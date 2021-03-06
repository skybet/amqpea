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

    it("should receive confirmed published messages", function(done) {

        var messages = [];
        var consumer = amqp.createQueueConsumerChannel('qq');
        consumer.consume(!'ack', 'exclusive', function(msg) {
            messages.push(msg);
            checkIfDone();
        });

        var confirms = 0;
        function confirm(err) {
            if (err) throw err;
            confirms += 1;
            checkIfDone();
        }
        var publisher = amqp.createPublishChannel('confirm');
        publisher.publish('xxx', 'key.1', { message: "body1" }, confirm);
        publisher.publish('xxx', 'key.2', { message: "body2" }, confirm);

        function checkIfDone() {
            if (messages.length < 2) return;
            if (confirms < 2) return;

            var msg1 = messages.shift();
            assert.deepPropertyVal(msg1, 'delivery.routing-key', 'key.1');
            assert.deepEqual(msg1.fromJSON(), { message: "body1" });
            var msg2 = messages.shift();
            assert.deepPropertyVal(msg2, 'delivery.routing-key', 'key.2');
            assert.deepEqual(msg2.fromJSON(), { message: "body2" });
            done();
        }
    });

    it("should receive published message with properties", function(done) {
        var messages = [];
        var consumer = amqp.createQueueConsumerChannel('qq');
        consumer.consume(!'ack', 'exclusive', function(msg) {
            messages.push(msg);
            checkIfDone();
        });
        var publisher = amqp.createPublishChannel();
        publisher.publish(
            'xxx', 'key.1',
            { message: "body1" },
            {
                'delivery-mode': 2,
                'message-id': '123',
                'headers': {
                    'stuff': 'can',
                    'go': 'here'
                }
            }
        );
        function checkIfDone() {
            if (messages.length < 1) return;

            var msg1 = messages.shift();
            assert.deepPropertyVal(msg1, 'delivery.routing-key', 'key.1');
            assert.deepEqual(msg1.fromJSON(), { message: "body1" });
            assert.deepPropertyVal(msg1, 'properties.delivery-mode', 2);
            assert.deepPropertyVal(msg1, 'properties.message-id', '123');
            done();
        }
    });

    it("should receive confirmed published message with properties", function(done) {
        var messages = [];
        var consumer = amqp.createQueueConsumerChannel('qq');
        consumer.consume(!'ack', 'exclusive', function(msg) {
            messages.push(msg);
            checkIfDone();
        });
        var publisher = amqp.createPublishChannel('confirm');
        var confirmed = false;
        publisher.publish(
            'xxx', 'key.1',
            { message: "body1" },
            { 'delivery-mode': 2, 'message-id': '123' },
            function(err) {
                if (err) throw err;
                confirmed = true;
                checkIfDone();
            }
        );
        function checkIfDone() {
            if (messages.length < 1) return;
            if (!confirmed) return;

            var msg1 = messages.shift();
            assert.deepPropertyVal(msg1, 'delivery.routing-key', 'key.1');
            assert.deepEqual(msg1.fromJSON(), { message: "body1" });
            assert.deepPropertyVal(msg1, 'properties.delivery-mode', 2);
            assert.deepPropertyVal(msg1, 'properties.message-id', '123');
            done();
        }
    });

});
