const { it, describe, afterEach } = require('mocha')
const Router = require('..')
const utils = require('./support/utils')
const dc = require('node:diagnostics_channel');
const assert = require('node:assert');
const { IncomingMessage, ServerResponse } = require('node:http');

const createServer = utils.createServer
const request = utils.request

describe.only('Diagnostics Channels', function () {
  it('should subscribe to request events', function (done) {
    function onRequest(msg) {
      assert.ok(msg.req instanceof IncomingMessage)
      assert.ok(msg.res instanceof ServerResponse)
      assert.ok(msg.error === undefined)

      if (msg.layer.path === '/users') {
        dc.unsubscribe('router.layer.handle.request', onRequest);
        done()
      }
    }

    dc.subscribe('router.layer.handle.request', onRequest)

    const router = Router()

    router.get('/users', sethit(1), saw)

    const server = createServer(router)

    request(server)
      .get('/users')
      .expect('x-fn-1', 'hit')
      .expect(200, 'saw GET /users', function () { })
  })

  it('should subscribe to error events', function (done) {
    let count = 0;

    function onError(msg) {
      assert.ok(msg.req instanceof IncomingMessage)
      assert.ok(msg.res instanceof ServerResponse)
      assert.ok(msg.error instanceof Error)
      if (count === 0) {
        assert.strictEqual(msg.error.message, 'boom!')
      } else {
        assert.strictEqual(msg.error.message, 'caught: boom!')
      }
      count++;
      if (count === 2) {
        dc.unsubscribe('router.layer.handle.error', onError);
        done()
      }
    }
    dc.subscribe('router.layer.handle.error', onError)

    const router = new Router()
    const route = router.route('/foo')
    const server = createServer(router)

    route.all(function createError(req, res, next) {
      return Promise.reject(new Error('boom!'))
    })

    route.all(function handleError(err, req, res, next) {
      return Promise.reject(new Error('caught: ' + err.message))
    })

    route.all(function handleError(err, req, res, next) {
      res.statusCode = 500
      res.end('caught again: ' + err.message)
    })

    request(server)
      .get('/foo')
      .expect(500, 'caught again: caught: boom!', function () {})
  })

  it('should subscribe ', function (done) {
    let count = 0;
    function onError(msg) {
      assert.ok(msg.req instanceof IncomingMessage)
      assert.ok(msg.res instanceof ServerResponse)
      assert.ok(msg.error instanceof Error)
      if (count === 0) {
        assert.strictEqual(msg.error.message, 'boom!')
      } else {
        assert.strictEqual(msg.error.message, 'caught: boom!')
      }
      count++;

      if(count === 2) {
        dc.unsubscribe('router.layer.handle.error', onError);
        done()
      }
    }

    dc.subscribe('router.layer.handle.error', onError);
    dc.subscribe('router.layer.handle.request', function (msg) {
      assert.ok(msg.req instanceof IncomingMessage)
      assert.ok(msg.res instanceof ServerResponse)
    })

    const router = new Router()
    const route = router.route('/foo')
    const server = createServer(router)

    route.all(function createError(req, res, next) {
      return Promise.reject(new Error('boom!'))
    })

    route.all(function handleError(err, req, res, next) {
      return Promise.reject(new Error('caught: ' + err.message))
    })

    route.all(function handleError(err, req, res, next) {
      res.statusCode = 500
      res.end('caught again: ' + err.message)
    })

    request(server)
      .get('/foo')
      .expect(500, 'caught again: caught: boom!', function () {})
  })
})

function saw(req, res) {
  console.log("ee")
  const msg = 'saw ' + req.method + ' ' + req.url
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end(msg)
}

function sethit(num) {
  const name = 'x-fn-' + String(num)
  return function hit(req, res, next) {
    res.setHeader(name, 'hit')
    next()
  }
}
