/*!
 * router
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Segment radix index for parametric routes (RFC 000 phase 2, design B).
 *
 * One tree per run. Each level is a path segment; nodes have static children
 * (keyed by the literal segment) and an optional `:param` child. Terminals
 * carry a monotonically increasing registration index; matching returns the
 * candidate with the smallest index, i.e. Express's registration-order
 * priority (NOT specificity). Overlaps (a static and a param segment both
 * matching) are resolved by an ordered DFS with backtracking, pruned by the
 * per-subtree minimum registration index (branch-and-bound).
 *
 * Only routes made of static segments and whole `:name` segments are indexed;
 * wildcards, optional groups, mixed text+param segments and RegExp paths are
 * left to the caller's linear fallback.
 *
 * @private
 */

const PARAM_SEGMENT = /^:[A-Za-z_$][A-Za-z0-9_$]*$/
const STATIC_SEGMENT = /^[^:*{}()?+\\]*$/
const MAX_INDEX = 0xffffffff

/**
 * Split a route path into radix segments, or return null when the path is not
 * expressible in the segment radix (so the caller keeps it on the fallback).
 *
 * @param {string} path
 * @return {Array|null} array of { param } | { static }, or null
 * @private
 */

function radixSegments (path) {
  if (typeof path !== 'string' || path.length === 0 || path[0] !== '/') {
    return null
  }

  const parts = path.slice(1).split('/')
  const segments = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    // an empty part means "//" or a trailing slash — leave to the fallback
    if (part === '') {
      return null
    }

    if (PARAM_SEGMENT.test(part)) {
      segments.push({ param: part.slice(1) })
    } else if (STATIC_SEGMENT.test(part)) {
      segments.push({ static: part })
    } else {
      return null
    }
  }

  return segments
}

function Node () {
  this.staticChildren = null // Map<segment, Node>
  this.paramChild = null // Node
  this.terminals = null // [{ index, keys, value }] — routes ending here
  this.min = MAX_INDEX // smallest registration index in this subtree
}

function RadixTree (sensitive) {
  this.root = new Node()
  this.sensitive = sensitive === true
}

/**
 * Add a route. Returns false (and indexes nothing) when the path is not
 * radix-expressible, so the caller can fall back.
 *
 * @param {string} path
 * @param {*} value payload returned on match (e.g. a stack index)
 * @param {number} index registration index (unique, increasing)
 * @return {boolean}
 * @private
 */

RadixTree.prototype.add = function add (path, value, index) {
  const segments = radixSegments(path)

  if (segments === null) {
    return false
  }

  let node = this.root
  const keys = []

  if (index < node.min) node.min = index

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    let child

    if (segment.param !== undefined) {
      if (node.paramChild === null) node.paramChild = new Node()
      child = node.paramChild
      keys.push(segment.param)
    } else {
      const key = this.sensitive ? segment.static : segment.static.toLowerCase()
      if (node.staticChildren === null) node.staticChildren = new Map()
      child = node.staticChildren.get(key)
      if (child === undefined) {
        child = new Node()
        node.staticChildren.set(key, child)
      }
    }

    if (index < child.min) child.min = index
    node = child
  }

  // several routes can share a node (same segment shape, different param
  // names and/or methods) — keep them all; registration order is resolved at
  // lookup by the smallest index. add() is called in ascending stack order,
  // so terminals stay sorted.
  if (node.terminals === null) node.terminals = []
  node.terminals.push({ index, keys, value })

  return true
}

/**
 * Find the registration-first route matching `segments`, or null.
 *
 * @param {Array} segments request path split on "/", leading empty dropped
 * @return {object|null} { value, keys, values } — keys/values are positional
 * @private
 */

RadixTree.prototype.find = function find (segments) {
  const best = { index: MAX_INDEX, terminal: null, values: null }
  descend(this.root, segments, 0, [], best, this.sensitive)
  return best.terminal === null
    ? null
    : { value: best.terminal.value, keys: best.terminal.keys, values: best.values }
}

/**
 * Collect every route matching `segments`, in registration order. Used by the
 * dispatcher, which must be able to advance to the next candidate on
 * next('route'); the winning route's own matcher still confirms and builds
 * params, so this only needs to enumerate candidate stack indexes.
 *
 * @param {Array} segments
 * @return {Array} ascending-index list of { index, keys, values }
 * @private
 */

RadixTree.prototype.findAll = function findAll (segments) {
  const out = []
  collectAll(this.root, segments, 0, [], out, this.sensitive)
  out.sort(byIndex)
  return out
}

function byIndex (a, b) {
  return a.index - b.index
}

function collectAll (node, segments, i, values, out, sensitive) {
  if (i === segments.length) {
    if (node.terminals !== null) {
      for (let t = 0; t < node.terminals.length; t++) {
        const term = node.terminals[t]
        out.push({ index: term.index, keys: term.keys, values: values.slice() })
      }
    }
    return
  }

  const segment = segments[i]

  if (node.staticChildren !== null) {
    const child = node.staticChildren.get(sensitive ? segment : segment.toLowerCase())
    if (child !== undefined) {
      collectAll(child, segments, i + 1, values, out, sensitive)
    }
  }

  if (node.paramChild !== null) {
    values.push(segment)
    collectAll(node.paramChild, segments, i + 1, values, out, sensitive)
    values.pop()
  }
}

function descend (node, segments, i, values, best, sensitive) {
  // prune: nothing in this subtree can beat the current best
  if (node.min >= best.index) {
    return
  }

  if (i === segments.length) {
    if (node.terminals !== null) {
      for (let t = 0; t < node.terminals.length; t++) {
        const term = node.terminals[t]
        if (term.index < best.index) {
          best.index = term.index
          best.terminal = term
          best.values = values.slice()
        }
      }
    }
    return
  }

  const segment = segments[i]

  // static child first (cheaper, and a static match is often the winner)
  if (node.staticChildren !== null) {
    const child = node.staticChildren.get(sensitive ? segment : segment.toLowerCase())
    if (child !== undefined) {
      descend(child, segments, i + 1, values, best, sensitive)
    }
  }

  // then the param child, capturing this segment as its value
  if (node.paramChild !== null) {
    values.push(segment)
    descend(node.paramChild, segments, i + 1, values, best, sensitive)
    values.pop()
  }
}

exports.RadixTree = RadixTree
exports.radixSegments = radixSegments
