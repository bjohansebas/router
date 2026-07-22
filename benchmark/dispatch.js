'use strict'

/**
 * Dispatch micro-benchmark: compiled plan (default) vs the legacy linear scan
 * (`compile: false`), at a growing number of routes.
 *
 * Two scenarios, both hitting the LAST registered route — the worst case for
 * the O(n) scan and the case the compiled plan is meant to flatten:
 *
 *   static — N distinct static paths; the last one is requested.
 *   param  — N distinct parametric paths (/r<i>/:id); the last one is requested.
 *
 * The requested handler responds (no next), so each run is a single dispatch
 * with no setImmediate churn. Run: `node benchmark/dispatch.js`.
 */

const Router = require('..')

const SIZES = [10, 100, 500, 1000]
const ITERATIONS = 20000

function build (n, compile, kind) {
  const router = new Router({ compile })
  for (let i = 0; i < n; i++) {
    const path = kind === 'static' ? '/route' + i : '/r' + i + '/:id'
    router.get(path, respond)
  }
  return router
}

function respond (req, res) { res.end() }

function makeReq (n, kind) {
  const url = kind === 'static' ? '/route' + (n - 1) : '/r' + (n - 1) + '/42'
  return function () { return { method: 'GET', url } }
}

const noopRes = { end () {}, setHeader () {}, getHeader () {}, writeHead () {} }

function bench (router, nextReq) {
  // warm up the lazy plan and the JIT
  for (let i = 0; i < 2000; i++) router.handle(nextReq(), noopRes, noop)

  const start = process.hrtime.bigint()
  for (let i = 0; i < ITERATIONS; i++) router.handle(nextReq(), noopRes, noop)
  const ns = Number(process.hrtime.bigint() - start)

  return ns / ITERATIONS // ns per dispatch
}

function noop () {}

function fmt (ns) {
  return (ns / 1000).toFixed(2).padStart(9) + ' µs'
}

for (const kind of ['static', 'param']) {
  console.log('\n=== hit-last, ' + kind + ' routes (µs/dispatch, lower is better) ===')
  console.log('routes'.padStart(6), 'legacy(O(n))'.padStart(14), 'compiled'.padStart(14), 'speedup'.padStart(9))

  for (const n of SIZES) {
    const nextReq = makeReq(n, kind)
    const legacy = bench(build(n, false, kind), nextReq)
    const compiled = bench(build(n, true, kind), nextReq)
    console.log(
      String(n).padStart(6),
      fmt(legacy).padStart(14),
      fmt(compiled).padStart(14),
      (legacy / compiled).toFixed(1).padStart(7) + '×'
    )
  }
}

console.log('')
