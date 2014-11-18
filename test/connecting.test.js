/*eslint-env mocha*/

var assert = require('chai').assert;
var s = require('sinon');

var amqpea = require('..');
var shared = require('./shared');

describe("connecting", function() {
    it("can connect", function(done) {
        var amqp = amqpea(shared.uri, {});
        shared.deferCleanup(amqp);
        var spy = s.spy();
        amqp.on('connection-error', spy);
        amqp.on('error', done);
        amqp.on('ready', function() {
            s.assert.notCalled(spy);
            done();
        });
    });
    it("will connect to first in a list", function(done) {
        var amqp = amqpea([shared.uri, shared.brokenUri], {});
        shared.deferCleanup(amqp);
        var spy = s.spy();
        amqp.on('connection-error', spy);
        amqp.on('error', done);
        amqp.on('ready', function() {
            s.assert.notCalled(spy);
            done();
        });
    });
    it("will connect to first working server in a list", function(done) {
        var amqp = amqpea([shared.brokenUri, shared.uri], {});
        shared.deferCleanup(amqp);
        var spy = s.spy();
        amqp.on('connection-error', spy);
        amqp.on('error', done);
        amqp.on('ready', function() {
            s.assert.calledOnce(spy);
            s.assert.calledWith(spy, shared.brokenUri, s.match(Error));
            done();
        });
    });
    it("will emit error with broken server", function(done) {
        var amqp = amqpea(shared.brokenUri, {});
        shared.deferCleanup(amqp);
        var spy = s.spy();
        amqp.on('connection-error', spy);
        amqp.on('ready', done.bind(0, new Error('Expected no connection')));
        amqp.on('error', function(err) {
            assert.ok(err instanceof Error, 'expected error');
            s.assert.calledOnce(spy);
            s.assert.calledWith(spy, shared.brokenUri, s.match(Error));
            assert.strictEqual(err, spy.lastCall.args[1]);
            done();
        });
    });
    it("will emit error with all broken servers", function(done) {
        var amqp = amqpea([shared.brokenUri, shared.brokenUri2], {});
        shared.deferCleanup(amqp);
        var spy = s.spy();
        amqp.on('connection-error', spy);
        amqp.on('ready', done.bind(0, new Error('Expected no connection')));
        amqp.on('error', function(err) {
            assert.ok(err instanceof Error, 'expected error');
            s.assert.calledTwice(spy);
            s.assert.calledWith(spy, shared.brokenUri, s.match(Error));
            s.assert.calledWith(spy, shared.brokenUri2, s.match(Error));
            assert.strictEqual(err, spy.lastCall.args[1]);
            done();
        });
    });
});
