const { it, describe } = require('mocha')
const series = require('run-series')
const Router = require('..')
const utils = require('./support/utils')

const assert = utils.assert
const createHitHandle = utils.createHitHandle
const shouldHitHandle = utils.shouldHitHandle
const shouldNotHitHandle = utils.shouldNotHitHandle

runTestSuite('http')
runTestSuite('http2')

function runTestSuite (type) {
  const { createServer, request } = utils.helperServer(type)

  describe(`Router - ${type}`, function () {
    describe('.param(name, fn)', function () {
      it('should reject missing name', function () {
        const router = new Router()
        assert.throws(router.param.bind(router), /argument name is required/)
      })

      it('should reject bad name', function () {
        const router = new Router()
        assert.throws(router.param.bind(router, 42), /argument name must be a string/)
      })

      it('should reject missing fn', function () {
        const router = new Router()
        assert.throws(router.param.bind(router, 'id'), /argument fn is required/)
      })

      it('should reject bad fn', function () {
        const router = new Router()
        assert.throws(router.param.bind(router, 'id', 42), /argument fn must be a function/)
      })

      it('should map logic for a path param', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('id', function parseId (req, res, next, val) {
          req.params.id = Number(val)
          next()
        })

        router.get('/user/:id', function (req, res) {
          res.setHeader('Content-Type', 'text/plain')
          res.end('get user ' + req.params.id)
        })

        series([
          function (cb) {
            request(server)
              .get('/user/2')
              .expect(200, 'get user 2', cb)
          },
          function (cb) {
            request(server)
              .get('/user/bob')
              .expect(200, 'get user NaN', cb)
          }
        ], done)
      })

      it('should allow chaining', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('id', function parseId (req, res, next, val) {
          req.params.id = Number(val)
          next()
        })

        router.param('id', function parseId (req, res, next, val) {
          req.itemId = Number(val)
          next()
        })

        router.get('/user/:id', function (req, res) {
          res.setHeader('Content-Type', 'text/plain')
          res.end('get user ' + req.params.id + ' (' + req.itemId + ')')
        })

        request(server)
          .get('/user/2')
          .expect(200, 'get user 2 (2)', done)
      })

      it('should automatically decode path value', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('user', function parseUser (req, res, next, user) {
          req.user = user
          next()
        })

        router.get('/user/:id', function (req, res) {
          res.setHeader('Content-Type', 'text/plain')
          res.end('get user ' + req.params.id)
        })

        request(server)
          .get('/user/%22bob%2Frobert%22')
          .expect('get user "bob/robert"', done)
      })

      it('should 400 on invalid path value', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('user', function parseUser (req, res, next, user) {
          req.user = user
          next()
        })

        router.get('/user/:id', function (req, res) {
          res.setHeader('Content-Type', 'text/plain')
          res.end('get user ' + req.params.id)
        })

        request(server)
          .get('/user/%bob')
          .expect(400, /URIError: Failed to decode param/, done)
      })

      it('should only invoke fn when necessary', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('id', function parseId (req, res, next, val) {
          if (req.httpVersion === '2.0') {
            // Because HTTP/2 does not allow setting headers before/after the response is sent
            res.headers = { 'x-id': val }
          } else {
            res.setHeader('x-id', val)
          }
          next()
        })

        router.param('user', function parseUser (req, res, next, user) {
          throw new Error('boom')
        })

        router.get('/user/:user', saw)
        router.put('/user/:id', saw)

        series([
          function (cb) {
            request(server)
              .get('/user/bob')
              .expect(500, /Error: boom/, cb)
          },
          function (cb) {
            request(server)
              .put('/user/bob')
              .expect('x-id', 'bob')
              .expect(200, 'saw PUT /user/bob', cb)
          }
        ], done)
      })

      it('should only invoke fn once per request', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('user', function parseUser (req, res, next, user) {
          req.count = (req.count || 0) + 1
          req.user = user
          next()
        })

        router.get('/user/:user', sethit(1))
        router.get('/user/:user', sethit(2))

        router.use(function (req, res) {
          res.end('get user ' + req.user + ' ' + req.count + ' times')
        })

        request(server)
          .get('/user/bob')
          .expect('get user bob 1 times', done)
      })

      it('should keep changes to req.params value', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('id', function parseUser (req, res, next, val) {
          req.count = (req.count || 0) + 1
          req.params.id = Number(val)
          next()
        })

        router.get('/user/:id', function (req, res, next) {
          res.setHeader('x-user-id', req.params.id)
          next()
        })

        router.get('/user/:id', function (req, res) {
          res.end('get user ' + req.params.id + ' ' + req.count + ' times')
        })

        request(server)
          .get('/user/01')
          .expect('get user 1 1 times', done)
      })

      it('should invoke fn if path value differs', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('user', function parseUser (req, res, next, user) {
          req.count = (req.count || 0) + 1
          req.user = user
          req.vals = (req.vals || []).concat(user)
          next()
        })

        router.get('/:user/bob', sethit(1))
        router.get('/user/:user', sethit(2))

        router.use(function (req, res) {
          res.end('get user ' + req.user + ' ' + req.count + ' times: ' + req.vals.join(', '))
        })

        request(server)
          .get('/user/bob')
          .expect('get user bob 2 times: user, bob', done)
      })

      it('should catch exception in fn', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('user', function parseUser (req, res, next, user) {
          throw new Error('boom')
        })

        router.get('/user/:user', function (req, res) {
          res.setHeader('Content-Type', 'text/plain')
          res.end('get user ' + req.params.id)
        })

        request(server)
          .get('/user/bob')
          .expect(500, /Error: boom/, done)
      })

      it('should catch exception in chained fn', function (done) {
        const router = new Router()
        const server = createServer(router)

        router.param('user', function parseUser (req, res, next, user) {
          process.nextTick(next)
        })

        router.param('user', function parseUser (req, res, next, user) {
          throw new Error('boom')
        })

        router.get('/user/:user', function (req, res) {
          res.setHeader('Content-Type', 'text/plain')
          res.end('get user ' + req.params.id)
        })

        request(server)
          .get('/user/bob')
          .expect(500, /Error: boom/, done)
      })

      describe('promise support', function () {
        it('should pass rejected promise value', function (done) {
          const router = new Router()
          const server = createServer(router)

          router.param('user', function parseUser (req, res, next, user) {
            return Promise.reject(new Error('boom'))
          })

          router.get('/user/:user', function (req, res) {
            res.setHeader('Content-Type', 'text/plain')
            res.end('get user ' + req.params.id)
          })

          request(server)
            .get('/user/bob')
            .expect(500, /Error: boom/, done)
        })

        it('should pass rejected promise without value', function (done) {
          const router = new Router()
          const server = createServer(router)

          router.use(function createError (req, res, next) {
            return Promise.reject() // eslint-disable-line prefer-promise-reject-errors
          })

          router.param('user', function parseUser (req, res, next, user) {
            return Promise.reject() // eslint-disable-line prefer-promise-reject-errors
          })

          router.get('/user/:user', function (req, res) {
            res.setHeader('Content-Type', 'text/plain')
            res.end('get user ' + req.params.id)
          })

          request(server)
            .get('/user/bob')
            .expect(500, /Error: Rejected promise/, done)
        })
      })

      describe('next("route")', function () {
        it('should cause route with param to be skipped', function (done) {
          const router = new Router()
          const server = createServer(router)

          router.param('id', function parseId (req, res, next, val) {
            const id = Number(val)

            if (isNaN(id)) {
              return next('route')
            }

            req.params.id = id
            next()
          })

          router.get('/user/:id', function (req, res) {
            res.setHeader('Content-Type', 'text/plain')
            res.end('get user ' + req.params.id)
          })

          router.get('/user/new', function (req, res) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'text/plain')
            res.end('cannot get a new user')
          })

          series([
            function (cb) {
              request(server)
                .get('/user/2')
                .expect(200, 'get user 2', cb)
            },
            function (cb) {
              request(server)
                .get('/user/bob')
                .expect(404, cb)
            },
            function (cb) {
              request(server)
                .get('/user/new')
                .expect(400, 'cannot get a new user', cb)
            }
          ], done)
        })

        it('should invoke fn if path value differs', function (done) {
          const router = new Router()
          const server = createServer(router)

          router.param('user', function parseUser (req, res, next, user) {
            req.count = (req.count || 0) + 1
            req.user = user
            req.vals = (req.vals || []).concat(user)
            next(user === 'user' ? 'route' : null)
          })

          router.get('/:user/bob', createHitHandle(1))
          router.get('/user/:user', createHitHandle(2))

          router.use(function (req, res) {
            const msg = 'get user ' + req.user + ' ' + req.count + ' times: ' + req.vals.join(', ')

            if (req.httpVersion === '2.0') {
              res.stream.respond({
                'content-type': 'text/plain',
                ':status': 200,
                ...res.headers
              })

              res.stream.end(msg)
            } else {
              res.end(msg)
            }
          })

          request(server)
            .get('/user/bob')
            .expect(shouldNotHitHandle(1))
            .expect(shouldHitHandle(2))
            .expect('get user bob 2 times: user, bob', done)
        })
      })
    })
  })
}
function sethit (num) {
  const name = 'x-fn-' + String(num)
  return function hit (req, res, next) {
    if (req.httpVersion === '2.0') {
      // Because HTTP/2 does not allow setting headers before/after the response is sent
      res.headers = { [name]: 'hit' }
    } else {
      res.setHeader(name, 'hit')
    }
    next()
  }
}

function saw (req, res) {
  const msg = 'saw ' + req.method + ' ' + req.url
  if (req.httpVersion === '2.0') {
    res.stream.respond({
      'content-type': 'text/plain',
      ':status': 200,
      ...res.headers
    })
    res.stream.end(msg)
  } else {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end(msg)
  }
}
