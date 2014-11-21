/*eslint-env mocha*/

var assert = require('chai').assert;

var amqpea = require('..');
var shared = require('./shared');

describe("client information", function() {

    it("should have sensible defaults for client info", function(done) {
        var amqp = amqpea(shared.uri, {});
        shared.deferCleanup(amqp);
        amqp.on('error', done);
        amqp.on('ready', function() {
            shared.adminConnectionInfo(amqp, function(err, data) {
                if (err) return done(err);

                var properties = data.client_properties;

                assert.property(properties, 'product');
                assert.property(properties, 'version');
                assert.property(properties, 'platform');

                done();
            });
        });
    });

    it("should allow client to set properties", function(done) {
        var amqp = amqpea(shared.uri, {
            client: {
                product: "testsuite",
                version: 9001,
                platform: "Risc/OS",
                copyright: "copyleft",
                information: "not the most imaginative value"
            }
        });
        shared.deferCleanup(amqp);
        amqp.on('error', done);
        amqp.on('ready', function() {
            shared.adminConnectionInfo(amqp, function(err, data) {
                if (err) return done(err);

                var properties = data.client_properties;

                assert.propertyVal(properties, 'product', "testsuite");
                assert.propertyVal(properties, 'version', "9001");
                assert.propertyVal(properties, 'platform', "Risc/OS");
                assert.propertyVal(properties, 'copyright', "copyleft");
                assert.propertyVal(properties, 'information',
                    "not the most imaginative value");

                done();
            });
        });
    })

});
