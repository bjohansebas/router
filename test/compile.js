const { it, describe } = require('mocha')
const assert = require('assert')
const Router = require('..')

// The compiled dispatch (static map + segment radix) must be a pure
// optimisation: for any request it has to visit the same layers, in the same
// order, building the same params as the legacy linear scan. `compile: false`
// keeps that legacy scan, so a router built with `compile: false` is the
// oracle for the default (compiled) one.

describe('compiled dispatch equivalence (compile: true vs false)', function () {
  it('should keep the escape hatch — compile:false skips the plan', function () {
    const legacy = new Router({ compile: false })
    legacy.get('/users/:id', function (req, res) { res.end(req.params.id) })
    assert.strictEqual(run(legacy, 'GET', '/users/42').body, '42')
  })

  it('should rebuild the plan when routes are added after the first dispatch', function () {
    const router = new Router()
    router.get('/a', function (req, res) { res.end('a') })
    assert.strictEqual(run(router, 'GET', '/a').body, 'a')

    // adding a route changes the stack length -> plan is invalidated & rebuilt
    router.get('/b/:id', function (req, res) { res.end('b' + req.params.id) })
    assert.strictEqual(run(router, 'GET', '/b/7').body, 'b7')
    assert.strictEqual(run(router, 'GET', '/a').body, 'a') // still there
  })

  it('should agree with the linear scan across random mixed tables', function () {
    // deterministic PRNG (no Math.random) so failures reproduce
    let s = 0x9e3779b9
    const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000 }
    const pick = (a) => a[Math.floor(rand() * a.length)]

    const words = ['a', 'b', 'users', 'list', 'x', 'new']
    const methods = ['GET', 'POST', 'PUT']

    for (let table = 0; table < 250; table++) {
      const compiled = new Router()
      const legacy = new Router({ compile: false })

      const nLayers = 3 + Math.floor(rand() * 8)
      for (let i = 0; i < nLayers; i++) {
        const roll = rand()
        if (roll < 0.15) {
          // a middleware barrier (with a mount path some of the time)
          const mw = mark(i)
          if (rand() < 0.5) { compiled.use(mw); legacy.use(mw) } else {
            const mp = '/' + pick(words)
            compiled.use(mp, mw); legacy.use(mp, mw)
          }
          continue
        }

        // a route: static, parametric, or (rarely) a RegExp path
        const method = pick(methods)
        let path
        if (roll < 0.25) {
          path = new RegExp('^/' + pick(words))
        } else {
          const nSeg = 1 + Math.floor(rand() * 3)
          path = ''
          for (let k = 0; k < nSeg; k++) {
            path += '/' + (rand() < 0.4 ? ':p' + k : pick(words))
          }
        }
        const fn = mark(i)
        compiled[method.toLowerCase()](path, fn)
        legacy[method.toLowerCase()](path, fn)
      }

      // probe both routers with the same requests and compare the full trace
      for (let probe = 0; probe < 30; probe++) {
        const method = pick(methods)
        const nSeg = 1 + Math.floor(rand() * 3)
        let url = ''
        for (let k = 0; k < nSeg; k++) url += '/' + pick(words)

        const a = run(compiled, method, url)
        const b = run(legacy, method, url)
        const ctx = method + ' ' + url + ' :: table ' + table
        assert.deepStrictEqual(a.trace, b.trace, 'trace mismatch: ' + ctx)
        assert.strictEqual(a.status, b.status, 'status mismatch: ' + ctx)
      }
    }
  })
})

// a handler that records (layer id, params snapshot) then continues, so the
// trace captures every layer the walk visits and the params seen at each
function mark (id) {
  return function (req, res, next) {
    const params = {}
    for (const k in req.params) params[k] = req.params[k]
    req._trace.push([id, params])
    next()
  }
}

function run (router, method, url) {
  const req = { method, url, _trace: [] }
  let status = 404
  let body
  const res = {
    end (chunk) { status = 200; if (chunk !== undefined) body = String(chunk) },
    setHeader () {},
    getHeader () {},
    writeHead () {}
  }
  router.handle(req, res, function (err) { if (err) status = 500 })
  return { trace: req._trace, status, body }
}
