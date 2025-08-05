const { it, describe } = require('mocha')
const Router = require('..')
const { helperServer} = require('./support/utils')

runTestSuite('http')
runTestSuite('http2')

function runTestSuite (type) {
  const { createServer, request } = helperServer(type)
  describe(`OPTIONS - ${type}`, function () {
    it('should respond with defined routes', function (done) {
      const router = Router()
      const server = createServer(router)

      router.delete('/', saw)
      router.get('/users', saw)
      router.post('/users', saw)
      router.put('/users', saw)

      request(server)
        .options('/users')
        .expect('Allow', 'GET, HEAD, POST, PUT')
        .expect(200, 'GET, HEAD, POST, PUT', done)
    })

    it('should not contain methods multiple times', function (done) {
      const router = Router()
      const server = createServer(router)

      router.delete('/', saw)
      router.get('/users', saw)
      router.put('/users', saw)
      router.get('/users', saw)

      request(server)
        .options('/users')
        .expect('GET, HEAD, PUT')
        .expect('Allow', 'GET, HEAD, PUT', done)
    })

    it('should not include "all" routes', function (done) {
      const router = Router()
      const server = createServer(router)

      router.get('/', saw)
      router.get('/users', saw)
      router.put('/users', saw)
      router.all('/users', sethit(1))

      request(server)
        .options('/users')
        .expect('x-fn-1', 'hit')
        .expect('Allow', 'GET, HEAD, PUT')
        .expect(200, 'GET, HEAD, PUT', done)
    })

    it('should not respond if no matching path', function (done) {
      const router = Router()
      const server = createServer(router)

      router.get('/users', saw)

      request(server)
        .options('/')
        .expect(404, done)
    })

    it('should do nothing with explicit options route', function (done) {
      const router = Router()
      const server = createServer(router)

      router.get('/users', saw)
      router.options('/users', saw)

      request(server)
        .options('/users')
        .expect(200, 'saw OPTIONS /users', done)
    })

    describe('when error occurs in respone handler', function () {
      it('should pass error to callback', function (done) {
        const router = Router()
        const server = createServer(function hander (req, res, next) {
          if (req.httpVersion === '2.0') {
            res.stream.respond({
              'content-type': 'text/plain',
              ':status': 200
            })
          } else {
            res.writeHead(200)
          }

          router(req, res, function (err) {
            if (req.httpVersion === '2.0') {
              res.stream.end(String(Boolean(err)))
            } else {
              res.end(String(Boolean(err)))
            }
          })
        })

        router.get('/users', saw)

        request(server)
          .options('/users')
          .expect(200, 'true', done)
      })
    })
  })
}
function saw (req, res) {
  const msg = 'saw ' + req.method + ' ' + req.url
  if (req.httpVersion === '2.0') {
    res.stream.respond({
      'content-type': 'text/plain',
      ':status': 200
    })
    res.stream.end(msg)
  } else {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end(msg)
  }
}

function sethit (num) {
  const name = 'x-fn-' + String(num)
  return function hit (req, res, next) {
    res.setHeader(name, 'hit')
    next()
  }
}
