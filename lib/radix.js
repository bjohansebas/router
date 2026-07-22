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
  this.terminal = null // { index, keys, value }
  this.min = MAX_INDEX // smallest registration index in this subtree
}

function RadixTree () {
  this.root = new Node()
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
      if (node.staticChildren === null) node.staticChildren = new Map()
      child = node.staticChildren.get(segment.static)
      if (child === undefined) {
        child = new Node()
        node.staticChildren.set(segment.static, child)
      }
    }

    if (index < child.min) child.min = index
    node = child
  }

  // first registration wins: keep the lowest-index terminal here
  if (node.terminal === null || index < node.terminal.index) {
    node.terminal = { index, keys, value }
  }

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
  descend(this.root, segments, 0, [], best)
  return best.terminal === null
    ? null
    : { value: best.terminal.value, keys: best.terminal.keys, values: best.values }
}

function descend (node, segments, i, values, best) {
  // prune: nothing in this subtree can beat the current best
  if (node.min >= best.index) {
    return
  }

  if (i === segments.length) {
    if (node.terminal !== null && node.terminal.index < best.index) {
      best.index = node.terminal.index
      best.terminal = node.terminal
      best.values = values.slice()
    }
    return
  }

  const segment = segments[i]

  // static child first (cheaper, and a static match is often the winner)
  if (node.staticChildren !== null) {
    const child = node.staticChildren.get(segment)
    if (child !== undefined) {
      descend(child, segments, i + 1, values, best)
    }
  }

  // then the param child, capturing this segment as its value
  if (node.paramChild !== null) {
    values.push(segment)
    descend(node.paramChild, segments, i + 1, values, best)
    values.pop()
  }
}

exports.RadixTree = RadixTree
exports.radixSegments = radixSegments
