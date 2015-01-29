/*eslint-env mocha*/

var async = require('async');
var assert = require('chai').assert;

var shared = require('./shared');

describe("pubsub", function() {

    var amqp;
    beforeEach(function(done) {
        amqp = shared.createConnection(this, done);
    });
    beforeEach(function(done) {
        shared.deferCleanup("exchange", "xxx");
        shared.deferCleanup("queue", "qq");
        async.series([
            amqp.declareExchange.bind(amqp, {
                'name': 'xxx', 'type': 'topic'
            }),
            amqp.declareQueue.bind(amqp, {
                'name': 'qq', 'durable': false, 'autoDelete': true,
                'binding': { 'exchange': 'xxx', 'keys': ['#'] }
            })
        ], done);
    });

    it("should receive published messages", function(done) {
        var messages = [];
        var consumer = amqp.createQueueConsumerChannel('qq');
        consumer.consume(!'ack', 'exclusive', function(msg) {
            messages.push(msg);
            checkIfDone();
        });
        var publisher = amqp.createPublishChannel();
        publisher.publish('xxx', 'key.1', { message: "body1" });
        publisher.publish('xxx', 'key.2', { message: "body2" });
        function checkIfDone() {
            if (messages.length < 2) return;
            var msg1 = messages.shift();
            assert.deepPropertyVal(msg1, 'delivery.routing-key', 'key.1');
            assert.deepEqual(msg1.fromJSON(), { message: "body1" });
            var msg2 = messages.shift();
            assert.deepPropertyVal(msg2, 'delivery.routing-key', 'key.2');
            assert.deepEqual(msg2.fromJSON(), { message: "body2" });
            done();
        }
    });

});
