const { it, describe } = require('mocha')
const Router = require('..')
const utils = require('./support/utils')

runTestSuite('http')
runTestSuite('http2')

function runTestSuite (type) {
  const { createServer, rawrequest } = utils.helperServer(type)

  describe(`FQDN url - ${type}`, function () {
    it('should not obscure FQDNs', function (done) {
      if (type === 'http2') {
        // This test is not applicable for HTTP/2, nodejs throws an error when the path initially contains a FQDN
        this.skip()
      }

      const router = new Router()
      const server = createServer(router)

      router.use(saw)

      rawrequest(server)
        .get('http://example.com/foo')
        .expect(200, 'saw GET http://example.com/foo', done)
    })

    it('should strip/restore FQDN req.url', function (done) {
      if (type === 'http2') {
        // This test is not applicable for HTTP/2, nodejs throws an error when the path initially contains a FQDN
        this.skip()
      }

      const router = new Router()
      const server = createServer(router)

      router.use('/blog', setsaw(1))
      router.use(saw)

      rawrequest(server)
        .get('http://example.com/blog/post/1')
        .expect('x-saw-1', 'GET http://example.com/post/1')
        .expect(200, 'saw GET http://example.com/blog/post/1', done)
    })

    it('should ignore FQDN in search', function (done) {
      const router = new Router()
      const server = createServer(router)

      router.use('/proxy', setsaw(1))
      router.use(saw)

      rawrequest(server)
        .get('/proxy?url=http://example.com/blog/post/1')
        .expect('x-saw-1', 'GET /?url=http://example.com/blog/post/1')
        .expect(200, 'saw GET /proxy?url=http://example.com/blog/post/1', done)
    })

    it('should ignore FQDN in path', function (done) {
      const router = new Router()
      const server = createServer(router)

      router.use('/proxy', setsaw(1))
      router.use(saw)

      rawrequest(server)
        .get('/proxy/http://example.com/blog/post/1')
        .expect('x-saw-1', 'GET /http://example.com/blog/post/1')
        .expect(200, 'saw GET /proxy/http://example.com/blog/post/1', done)
    })
  })
}

function setsaw (num) {
  const name = 'x-saw-' + String(num)

  return function hit (req, res, next) {
    if (req.httpVersion === '2.0') {
      // Because HTTP/2 does not allow setting headers before/after the response is sent
      res.headers = { ...res.headers, [name]: req.method + ' ' + req.url }
    } else {
      res.setHeader(name, req.method + ' ' + req.url)
    }
    next()
  }
}

function saw (req, res) {
  const msg = 'saw ' + req.method + ' ' + req.url

  if(req.httpVersion === '2.0') {
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
