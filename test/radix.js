const { it, describe } = require('mocha')
const assert = require('assert')
const Router = require('..')
const { RadixTree, radixSegments } = require('../lib/radix')

function seg (path) {
  return path.slice(1).split('/')
}

describe('radix index (phase 2)', function () {
  describe('radixSegments', function () {
    it('should segment static + param paths', function () {
      assert.deepStrictEqual(radixSegments('/users/:id'), [{ static: 'users' }, { param: 'id' }])
      assert.deepStrictEqual(radixSegments('/a/:x/b/:y'), [{ static: 'a' }, { param: 'x' }, { static: 'b' }, { param: 'y' }])
    })

    it('should reject wildcard/optional/regexp/double-slash paths', function () {
      assert.strictEqual(radixSegments('/files/*rest'), null)
      assert.strictEqual(radixSegments('/a/{:opt}'), null)
      assert.strictEqual(radixSegments('/file-:name'), null)
      assert.strictEqual(radixSegments('/a//b'), null)
      assert.strictEqual(radixSegments('/a/'), null)
    })
  })

  describe('add / find', function () {
    it('should match a static path', function () {
      const t = new RadixTree()
      t.add('/users/list', 'A', 0)
      const r = t.find(seg('/users/list'))
      assert.strictEqual(r.value, 'A')
      assert.deepStrictEqual(r.values, [])
    })

    it('should match a param path and capture positional values', function () {
      const t = new RadixTree()
      t.add('/users/:id', 'A', 0)
      const r = t.find(seg('/users/42'))
      assert.strictEqual(r.value, 'A')
      assert.deepStrictEqual(r.keys, ['id'])
      assert.deepStrictEqual(r.values, ['42'])
    })

    it('should return null when nothing matches', function () {
      const t = new RadixTree()
      t.add('/users/:id', 'A', 0)
      assert.strictEqual(t.find(seg('/posts/1')), null)
      assert.strictEqual(t.find(seg('/users/1/x')), null)
    })

    it('should resolve overlap by registration order — param registered first', function () {
      const t = new RadixTree()
      t.add('/users/:id', 'PARAM', 0)
      t.add('/users/list', 'STATIC', 1)
      const r = t.find(seg('/users/list'))
      assert.strictEqual(r.value, 'PARAM') // first registered wins, not specificity
      assert.deepStrictEqual(r.values, ['list'])
    })

    it('should resolve overlap by registration order — static registered first', function () {
      const t = new RadixTree()
      t.add('/users/list', 'STATIC', 0)
      t.add('/users/:id', 'PARAM', 1)
      const r = t.find(seg('/users/list'))
      assert.strictEqual(r.value, 'STATIC')
      assert.deepStrictEqual(r.values, [])
    })

    it('should backtrack across a static/param fork', function () {
      const t = new RadixTree()
      t.add('/a/:x/c', 'X', 0)
      t.add('/a/b/:y', 'Y', 1)
      // /a/b/c matches both; X registered first wins
      assert.strictEqual(t.find(seg('/a/b/c')).value, 'X')
      // /a/b/d only matches Y (needs backtracking from the static 'b' branch)
      const r = t.find(seg('/a/b/d'))
      assert.strictEqual(r.value, 'Y')
      assert.deepStrictEqual(r.values, ['d'])
    })

    it('should keep the first-registered terminal at the same path', function () {
      const t = new RadixTree()
      t.add('/x/:id', 'FIRST', 0)
      t.add('/x/:id', 'SECOND', 1)
      assert.strictEqual(t.find(seg('/x/9')).value, 'FIRST')
    })
  })

  describe('findAll', function () {
    it('should enumerate every route sharing a segment shape, in order', function () {
      // same shape, different param names (e.g. GET /user/:user + PUT /user/:id)
      const t = new RadixTree()
      t.add('/user/:user', 'A', 0)
      t.add('/user/:id', 'B', 1)

      // findAll enumerates candidate stack indexes (the dispatcher confirms
      // params via each layer's own matcher), so it returns index/keys/values
      const all = t.findAll(seg('/user/bob'))
      assert.deepStrictEqual(all.map(function (c) { return c.index }), [0, 1])
      assert.deepStrictEqual(all[0].keys, ['user'])
      assert.deepStrictEqual(all[1].keys, ['id'])
      assert.deepStrictEqual(all[0].values, ['bob'])
    })

    it('should enumerate static and param overlaps in registration order', function () {
      const t = new RadixTree()
      t.add('/users/:id', 'PARAM', 0)
      t.add('/users/list', 'STATIC', 1)

      assert.deepStrictEqual(t.findAll(seg('/users/list')).map(function (c) { return c.index }), [0, 1])
      assert.deepStrictEqual(t.findAll(seg('/users/42')).map(function (c) { return c.index }), [0])
    })
  })

  describe('differential fuzzing vs the router (winner + params)', function () {
    it('should agree with the linear router on random tables', function () {
      // deterministic PRNG (no Math.random) so failures reproduce
      let s = 0x2545f491
      const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000 }
      const pick = (a) => a[Math.floor(rand() * a.length)]

      const words = ['a', 'b', 'c', 'users', 'list', 'x', 'y', 'new', 'id']

      for (let table = 0; table < 300; table++) {
        const nRoutes = 2 + Math.floor(rand() * 8)
        const paths = []
        for (let i = 0; i < nRoutes; i++) {
          const nSeg = 1 + Math.floor(rand() * 3)
          let p = ''
          for (let k = 0; k < nSeg; k++) {
            p += '/' + (rand() < 0.4 ? ':' + 'p' + k : pick(words))
          }
          paths.push(p)
        }

        // build the radix (value = registration index) and an oracle router
        const tree = new RadixTree()
        const router = new Router()
        let allRadixable = true
        for (let i = 0; i < paths.length; i++) {
          if (!tree.add(paths[i], i, i)) allRadixable = false
          router.get(paths[i], hit(i))
        }
        if (!allRadixable) continue // skip tables the radix declined (fallback territory)

        // probe with paths drawn from the same vocabulary
        for (let probe = 0; probe < 40; probe++) {
          const nSeg = 1 + Math.floor(rand() * 3)
          let url = ''
          for (let k = 0; k < nSeg; k++) url += '/' + pick(words)

          const oracle = runRouter(router, url)
          const found = tree.find(url.slice(1).split('/'))

          if (oracle.winner === undefined) {
            assert.strictEqual(found, null, 'radix matched where router did not: ' + url + ' :: ' + paths)
          } else {
            assert.notStrictEqual(found, null, 'radix missed where router matched: ' + url + ' :: ' + paths)
            assert.strictEqual(found.value, oracle.winner, 'winner mismatch: ' + url + ' :: ' + paths)
            // the router builds params with a null prototype; match that
            const params = Object.create(null)
            for (let k = 0; k < found.keys.length; k++) params[found.keys[k]] = found.values[k]
            assert.deepStrictEqual(params, oracle.params, 'params mismatch: ' + url + ' :: ' + paths)
          }
        }
      }
    })
  })
})

function hit (index) {
  return function (req, res) {
    req._winner = index
    req._params = req.params
  }
}

function runRouter (router, url) {
  const req = { method: 'GET', url }
  router.handle(req, {}, function () {})
  return { winner: req._winner, params: req._params }
}
