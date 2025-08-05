const { it, describe } = require('mocha')
const Router = require('..')
const { helperServer} = require('./support/utils')

runTestSuite('http')
runTestSuite('http2')

function runTestSuite (type) {
  const { createServer, request } = helperServer(type)

  describe(`HEAD - ${type}`, function () {
    it('should invoke get without head', function (done) {
      const router = Router()
      const server = createServer(router)

      router.get('/users', sethit(1), saw)

      request(server)
        .head('/users')
        .expect('Content-Type', 'text/plain')
        .expect('x-fn-1', 'hit')
        .expect(200, done)
    })

    it('should invoke head if prior to get', function (done) {
      const router = Router()
      const server = createServer(router)

      router.head('/users', sethit(1), saw)
      router.get('/users', sethit(2), saw)

      request(server)
        .head('/users')
        .expect('Content-Type', 'text/plain')
        .expect('x-fn-1', 'hit')
        .expect(200, done)
    })
  })
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

function sethit (num) {
  const name = 'x-fn-' + String(num)
  return function hit (req, res, next) {
    if (req.httpVersion === '2.0') {
      // Because HTTP/2 does not allow setting headers before/after the response is sent
      res.headers = {[name]: 'hit'}
      next()
    } else {
      res.setHeader(name, 'hit')
      next()
    }
  }
}
