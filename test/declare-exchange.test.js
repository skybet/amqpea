/*eslint-env mocha*/

var assert = require('chai').assert;

var shared = require('./shared');

describe("declareExchange", function() {

    var amqp;
    beforeEach(function(done) {
        amqp = shared.createConnection(this, done);
    });

    it("should declare a topic exchange with defaults", function(done) {
        shared.deferCleanup("exchange", "declareExchange-test-a");
        amqp.declareExchange({
            name: "declareExchange-test-a"
        }, function(err) {
            if (err) return done(err);
            shared.adminExchangeInfo("declareExchange-test-a", gotExchange);
        });
        function gotExchange(err, exchange) {
            if (err) return done(err);

            assert.propertyVal(exchange, 'name', 'declareExchange-test-a');
            assert.propertyVal(exchange, 'type', 'topic');
            assert.propertyVal(exchange, 'durable', false);
            assert.propertyVal(exchange, 'auto_delete', false);
            assert.propertyVal(exchange, 'internal', false);
            assert.property(exchange, 'arguments');
            assert.deepEqual(exchange.arguments, {});

            done();
        }
    });

    it("should declare an exchange with chosen options", function(done) {
        shared.deferCleanup("exchange", "declareExchange-test-b");
        amqp.declareExchange({
            name: "declareExchange-test-b",
            durable: true, autoDelete: true, internal: true
        }, function(err) {
            if (err) return done(err);
            shared.adminExchangeInfo("declareExchange-test-b", gotExchange);
        });
        function gotExchange(err, exchange) {
            if (err) return done(err);

            assert.propertyVal(exchange, 'name', 'declareExchange-test-b');
            assert.propertyVal(exchange, 'type', 'topic');
            assert.propertyVal(exchange, 'durable', true);
            assert.propertyVal(exchange, 'auto_delete', true);
            assert.propertyVal(exchange, 'internal', true);
            assert.property(exchange, 'arguments');
            assert.deepEqual(exchange.arguments, {});

            done();
        }
    });

});
