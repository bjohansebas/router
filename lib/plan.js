/*!
 * router
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Compiled dispatch plan (RFC 000, phase 1).
 *
 * The router stack is cut into `runs` — maximal contiguous sequences of route
 * layers with no interposed middleware. Middleware layers stay as ordered
 * barriers between runs (their prefix-match / req.url-trimming semantics are
 * untouched). Within a run, registration order only matters between routes
 * sharing the same path, so each run is indexed:
 *
 *   - static exact-match map (`staticKey(path)` -> registration-ordered stack
 *     indexes) — O(1) lookup;
 *   - parametric routes collected for the phase-2 radix index;
 *   - RegExp path routes kept on a linear fallback list.
 *
 * @private
 */

const { parse } = require('path-to-regexp')
const { RadixTree } = require('./radix')

const TRAILING_SLASH_REGEXP = /\/+$/

/**
 * Classify a route path: 'static' (only literal text), 'dynamic' (has a
 * param/wildcard/group), or 'regexp' (a RegExp or array path — linear
 * fallback). Never throws.
 *
 * @param {string|RegExp|Array} path
 * @return {string}
 * @private
 */

function classify (path) {
  if (typeof path !== 'string') {
    return 'regexp'
  }

  let tokens
  try {
    tokens = parse(path).tokens
  } catch (err) {
    return 'regexp'
  }

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'text') {
      return 'dynamic'
    }
  }

  return 'static'
}

/**
 * Canonical key for a static path under the router's matching options, so the
 * map keys the same shapes `Layer.match` treats as equal: trailing slashes are
 * loosened when not strict, case is folded when not case-sensitive.
 *
 * @param {string} path
 * @param {boolean} sensitive
 * @param {boolean} strict
 * @return {string}
 * @private
 */

function staticKey (path, sensitive, strict) {
  let key = path

  if (!strict && key !== '/') {
    key = key.replace(TRAILING_SLASH_REGEXP, '') || '/'
  }

  if (!sensitive) {
    key = key.toLowerCase()
  }

  return key
}

/**
 * Compile the stack into an ordered list of segments:
 *   { kind: 'middleware', index }
 *   { kind: 'run', start, end, staticMap: Map<key, index[]>, dynamic: index[],
 *     regexp: index[] }
 * where every `index` is the layer's position in `stack`.
 *
 * @param {Array} stack
 * @param {boolean} sensitive
 * @param {boolean} strict
 * @return {Array}
 * @private
 */

function buildPlan (stack, sensitive, strict) {
  const segments = []
  let run = null

  for (let i = 0; i < stack.length; i++) {
    const layer = stack[i]

    if (layer.route === undefined) {
      // middleware barrier: close the current run, then record the barrier
      if (run !== null) {
        segments.push(run)
        run = null
      }
      segments.push({ kind: 'middleware', index: i })
      continue
    }

    // route layer: extend (or open) the current run
    if (run === null) {
      run = {
        kind: 'run',
        start: i,
        end: i,
        staticMap: new Map(),
        dynamic: [],
        regexp: [],
        radix: new RadixTree(sensitive),
        // a run is radix-able while every route is a static (map) or a
        // radix-expressible param route — no RegExp, no wildcard/optional
        radixable: true
      }
    }
    run.end = i

    const routeKind = classify(layer.route.path)

    if (routeKind === 'static') {
      const key = staticKey(layer.route.path, sensitive, strict)
      let list = run.staticMap.get(key)
      if (list === undefined) {
        list = []
        run.staticMap.set(key, list)
      }
      list.push(i)
    } else if (routeKind === 'dynamic') {
      run.dynamic.push(i)
      // a param route the radix can't express keeps the whole run linear
      if (!run.radix.add(layer.route.path, i, i)) {
        run.radixable = false
      }
    } else {
      run.regexp.push(i)
      run.radixable = false
    }
  }

  if (run !== null) {
    segments.push(run)
  }

  return segments
}

/**
 * Tag each route layer with `_staticKey`: the canonical key for a static route
 * path, or `undefined` for parametric/RegExp routes and middleware. The
 * dispatcher uses it to skip a static route whose key can't match the request
 * path without running its regexp — the regexp still confirms the survivors.
 *
 * @param {Array} stack
 * @param {boolean} sensitive
 * @param {boolean} strict
 * @private
 */

function annotate (stack, sensitive, strict) {
  for (let i = 0; i < stack.length; i++) {
    const layer = stack[i]

    layer._staticKey = layer.route !== undefined && classify(layer.route.path) === 'static'
      ? staticKey(layer.route.path, sensitive, strict)
      : undefined
  }
}

exports.classify = classify
exports.staticKey = staticKey
exports.buildPlan = buildPlan
exports.annotate = annotate
