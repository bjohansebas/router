const { it, describe } = require('mocha')
const Router = require('..')
const utils = require('./support/utils')

const assert = utils.assert

describe('getRoutes', function () {
  it('should return an empty array when no routes are registered', function () {
    const router = new Router()

    assert.deepStrictEqual(router.getRoutes(), [])
  })

  it('should return route information for various route types (strings, arrays, and parameterized paths)', function () {
    const router = new Router()

    router.all('/', noop)
    router.route('/test2/')
    router.route('/test/').get(noop)
    router.all(/^\/[a-z]oo$/, noop)
    router.get(['/foo', '/bar'], noop)
    router.post('/:id/setting/:thing', noop)

    assert.deepStrictEqual(router.getRoutes(),
      [
        { path: '/', methods: ['_ALL'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
        { path: '/test2', methods: [], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined }, // Todo: Investigate
        { path: '/test', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
        { path: /^\/[a-z]oo$/, methods: ['_ALL'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
        { path: '/foo', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
        { path: '/bar', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
        { path: '/:id/setting/:thing', methods: ['POST'], keys: [{ name: 'id', type: 'param' }, { name: 'thing', type: 'param' }], options: { strict: undefined, caseSensitive: undefined }, router: undefined }
      ])
  })

  it('should track multiple registrations of the same route with different HTTP methods', function () {
    const router = new Router()

    router.post(['/test', '/test2'], noop)

    for (let i = 0; i < 2; i++) {
      router.get(['/test', '/test3'], noop)
    }

    router.put('/test3', noop)

    assert.deepStrictEqual(router.getRoutes(), [
      { path: '/test', methods: ['POST'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      { path: '/test2', methods: ['POST'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      { path: '/test', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      { path: '/test3', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      { path: '/test', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      { path: '/test3', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      { path: '/test3', methods: ['PUT'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined }
    ])
  })

  it('should properly handle nested routers and multiple mount points', function () {
    const router = new Router()
    const inner = new Router()
    router.post('/test', noop)

    for (let i = 0; i < 2; i++) {
      router.get('/test', noop)
    }

    for (let i = 0; i < 2; i++) {
      inner.get('/test', noop)
    }

    router.use(['/test/', '/test2', '/test3'], inner)
    router.use('/test4/', inner)
    router.route('/test5').get(noop).post(noop)

    assert.deepStrictEqual(router.getRoutes(), [
      { path: '/test', methods: ['POST'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      { path: '/test', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      { path: '/test', methods: ['GET'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
      {
        path: '/test',
        methods: undefined,
        keys: undefined,
        options: { strict: undefined, caseSensitive: undefined },
        router: [
          {
            keys: undefined,
            methods: ['GET'],
            options: { strict: undefined, caseSensitive: undefined },
            path: '/test',
            router: undefined
          }, {
            keys: undefined,
            methods: ['GET'],
            options: { strict: undefined, caseSensitive: undefined },
            path: '/test',
            router: undefined
          }]
      },
      {
        path: '/test2',
        methods: undefined,
        keys: undefined,
        options: { strict: undefined, caseSensitive: undefined },
        router: [
          {
            keys: undefined,
            methods: ['GET'],
            options: { strict: undefined, caseSensitive: undefined },
            path: '/test',
            router: undefined
          }, {
            keys: undefined,
            methods: ['GET'],
            options: { strict: undefined, caseSensitive: undefined },
            path: '/test',
            router: undefined
          }]
      },
      {
        path: '/test3',
        methods: undefined,
        keys: undefined,
        options: { strict: undefined, caseSensitive: undefined },
        router: [
          {
            keys: undefined,
            methods: ['GET'],
            options: { strict: undefined, caseSensitive: undefined },
            path: '/test',
            router: undefined
          }, {
            keys: undefined,
            methods: ['GET'],
            options: { strict: undefined, caseSensitive: undefined },
            path: '/test',
            router: undefined
          }]
      },
      {
        path: '/test4',
        methods: undefined,
        keys: undefined,
        options: { strict: undefined, caseSensitive: undefined },
        router: [
          {
            keys: undefined,
            methods: ['GET'],
            options: { strict: undefined, caseSensitive: undefined },
            path: '/test',
            router: undefined
          }, {
            keys: undefined,
            methods: ['GET'],
            options: { strict: undefined, caseSensitive: undefined },
            path: '/test',
            router: undefined
          }]
      },
      { path: '/test5', methods: ['GET', 'POST'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined }
    ])
  })

  it('should correctly flatten deeply nested router hierarchies with multiple levels', function () {
    const router = new Router()
    const inner = new Router()
    const subinner = new Router()

    subinner.put('/t5', noop)
    subinner.all(/^\/[a-z]oo$/, noop)
    subinner.use(noop)

    inner.use('/t3', subinner)
    inner.all('/t4', noop)
    inner.get('/', noop)
    inner.use(noop)

    router.use('/t2', inner)
    router.use(['/t5', '/t7'], inner)

    router.use(noop)
    router.use('/test1', noop)

    assert.deepStrictEqual(router.getRoutes(), [
      {
        path: '/t2',
        methods: undefined,
        keys: undefined,
        options: { strict: undefined, caseSensitive: undefined },
        router: [
          {
            path: '/t3',
            methods: undefined,
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: [
              { path: '/t5', methods: ['PUT'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
              { path: /^\/[a-z]oo$/, methods: ['_ALL'], keys: undefined,options: { strict: undefined, caseSensitive: undefined }, router: undefined },
            ]
          },
          {
            path: '/t4',
            methods: ['_ALL'],
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: undefined
          }, 
           {
            path: '/',
            methods: ['GET'],
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: undefined
          },
        ]
      },
      {
        path: '/t5',
        methods: undefined,
        keys: undefined,
        options: { strict: undefined, caseSensitive: undefined },
      router: [
          {
            path: '/t3',
            methods: undefined,
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: [
              { path: '/t5', methods: ['PUT'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
              { path: /^\/[a-z]oo$/, methods: ['_ALL'], keys: undefined,options: { strict: undefined, caseSensitive: undefined }, router: undefined },
            ]
          },
          {
            path: '/t4',
            methods: ['_ALL'],
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: undefined
          },  
          {
            path: '/',
            methods: ['GET'],
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: undefined
          },
        ]
      },
      {
        path: '/t7',
        methods: undefined,
        keys: undefined,
        options: { strict: undefined, caseSensitive: undefined },
        router: [
          {
            path: '/t3',
            methods: undefined,
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: [
              { path: '/t5', methods: ['PUT'], keys: undefined, options: { strict: undefined, caseSensitive: undefined }, router: undefined },
              { path: /^\/[a-z]oo$/, methods: ['_ALL'], keys: undefined,options: { strict: undefined, caseSensitive: undefined }, router: undefined },
            ]
          },
          {
            path: '/t4',
            methods: ['_ALL'],
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: undefined
          },  
          {
            path: '/',
            methods: ['GET'],
            keys: undefined,
            options: { strict: undefined, caseSensitive: undefined },
            router: undefined
          },
        ]
      }

    ])
  })

  it('should avoid double slashes when mounting routers at root path', function () {
    const router = new Router()
    const subRouter = new Router()

    subRouter.get('/api', () => {})
    router.use('/', subRouter)

    const routes = router.getRoutes()

    assert.deepStrictEqual(routes, [
      {
        path: '/',
        methods: undefined,
        keys: undefined,
        options: { strict: undefined, caseSensitive: undefined },
        router: [{
          path: '/api',
          methods: ['GET'],
          keys: undefined,
          options: { strict: undefined, caseSensitive: undefined },
          router: undefined
        }]
      }
    ])
  })

  it.skip('should preserve router configuration options from parent to child routers', function () {
    const router = new Router({ strict: true, caseSensitive: true })
    const inner = new Router({ strict: true, caseSensitive: false })
    const subinner = new Router({ strict: false, caseSensitive: false })

    subinner.put('/t5', noop)
    subinner.use(noop)

    inner.use('/t3', subinner)
    inner.all('/t4', noop)
    inner.get('/', noop)
    inner.use(noop)

    router.use('/t2', inner)
    router.use(['/t5', '/t7'], inner)

    router.use(noop)
    router.get('/test', noop)

    assert.deepStrictEqual(router.getRoutes(), [
      { path: '/t2/t3/t5', methods: ['PUT'], keys: undefined, options: { strict: false, caseSensitive: false } },
      { path: '/t2/t4', methods: ['_ALL'], keys: undefined, options: { strict: true, caseSensitive: false } },
      { path: '/t2/', methods: ['GET'], keys: undefined, options: { strict: true, caseSensitive: false } },
      { path: '/t5/t3/t5', methods: ['PUT'], keys: undefined, options: { strict: false, caseSensitive: false } },
      { path: '/t5/t4', methods: ['_ALL'], keys: undefined, options: { strict: true, caseSensitive: false } },
      { path: '/t5/', methods: ['GET'], keys: undefined, options: { strict: true, caseSensitive: false } },
      { path: '/t7/t3/t5', methods: ['PUT'], keys: undefined, options: { strict: false, caseSensitive: false } },
      { path: '/t7/t4', methods: ['_ALL'], keys: undefined, options: { strict: true, caseSensitive: false } },
      { path: '/t7/', methods: ['GET'], keys: undefined, options: { strict: true, caseSensitive: false } },
      { path: '/test', methods: ['GET'], keys: undefined, options: { strict: true, caseSensitive: true } }
    ])
  })

  it.skip('should handle multiple routers with different configuration options mounted at the same path', function () {
    const router = new Router({ strict: true, caseSensitive: true })
    const inner = new Router({ strict: true, caseSensitive: false })
    const otherInner = new Router({ strict: true, caseSensitive: true })
    const otherInner2 = new Router({ strict: true, caseSensitive: false })

    otherInner2.put('/:t5', noop)
    otherInner2.get('/:t6', noop)

    otherInner.put('/:t5', noop)
    otherInner.post('/:t6', noop)

    inner.use('/t2', otherInner)
    inner.use('/t2', otherInner2)

    router.use(inner)

    assert.deepStrictEqual(router.getRoutes(), [
      { path: '/t2/:t5', methods: ['PUT'], keys: [{ name: 't5', type: 'param' }], options: { strict: true, caseSensitive: true } },
      { path: '/t2/:t6', methods: ['POST'], keys: [{ name: 't6', type: 'param' }], options: { strict: true, caseSensitive: true } },
      { path: '/t2/:t5', methods: ['PUT'], keys: [{ name: 't5', type: 'param' }], options: { strict: true, caseSensitive: false } },
      { path: '/t2/:t6', methods: ['GET'], keys: [{ name: 't6', type: 'param' }], options: { strict: true, caseSensitive: false } }
    ])
  })
})

function noop () {}
