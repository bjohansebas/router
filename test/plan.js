const { it, describe } = require('mocha')
const assert = require('assert')
const Router = require('..')
const { classify, staticKey, buildPlan } = require('../lib/plan')

describe('compiled plan (phase 1)', function () {
  describe('classify', function () {
    it('should classify literal string paths as static', function () {
      assert.strictEqual(classify('/health'), 'static')
      assert.strictEqual(classify('/users/list'), 'static')
      assert.strictEqual(classify('/'), 'static')
    })

    it('should classify param/wildcard/group paths as dynamic', function () {
      assert.strictEqual(classify('/users/:id'), 'dynamic')
      assert.strictEqual(classify('/files/*rest'), 'dynamic')
      assert.strictEqual(classify('/a/{:opt}'), 'dynamic')
    })

    it('should classify RegExp and array paths as regexp', function () {
      assert.strictEqual(classify(/^\/x/), 'regexp')
      assert.strictEqual(classify(['/a', '/b']), 'regexp')
    })
  })

  describe('staticKey', function () {
    it('should loosen a trailing slash when not strict', function () {
      assert.strictEqual(staticKey('/users/', false, false), '/users')
      assert.strictEqual(staticKey('/users', false, false), '/users')
      assert.strictEqual(staticKey('/', false, false), '/')
    })

    it('should keep a trailing slash when strict', function () {
      assert.strictEqual(staticKey('/users/', false, true), '/users/')
    })

    it('should fold case when not sensitive', function () {
      assert.strictEqual(staticKey('/Users', false, false), '/users')
      assert.strictEqual(staticKey('/Users', true, false), '/Users')
    })
  })

  describe('buildPlan', function () {
    it('should cut the stack into runs around middleware barriers', function () {
      const router = new Router()
      router.get('/a', noop)
      router.get('/b', noop)
      router.use(noop)
      router.get('/c/:id', noop)

      const plan = buildPlan(router.stack, false, false)

      assert.strictEqual(plan.length, 3)
      assert.strictEqual(plan[0].kind, 'run')
      assert.strictEqual(plan[1].kind, 'middleware')
      assert.strictEqual(plan[2].kind, 'run')
    })

    it('should index static routes in the run static map, in registration order', function () {
      const router = new Router()
      router.get('/a', noop)
      router.all('/a', noop) // same path, later registration
      router.get('/b', noop)

      const run = buildPlan(router.stack, false, false)[0]

      assert.deepStrictEqual([...run.staticMap.keys()].sort(), ['/a', '/b'])
      assert.deepStrictEqual(run.staticMap.get('/a'), [0, 1]) // both, in order
    })

    it('should route parametric to dynamic and RegExp to regexp', function () {
      const router = new Router()
      router.get('/users/:id', noop)
      router.get(/^\/x/, noop)

      const run = buildPlan(router.stack, false, false)[0]

      assert.strictEqual(run.dynamic.length, 1)
      assert.strictEqual(run.regexp.length, 1)
      assert.strictEqual(run.staticMap.size, 0)
    })

    it('should record the run bounds', function () {
      const router = new Router()
      router.get('/a', noop)
      router.get('/b', noop)

      const run = buildPlan(router.stack, false, false)[0]

      assert.strictEqual(run.start, 0)
      assert.strictEqual(run.end, 1)
    })
  })
})

function noop (req, res, next) { next() }
