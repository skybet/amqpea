require('longjohn');
var amqpea = require('..');

var url = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672/%2F';

var amqp = amqpea(url, {
    timeout: 2000,
    heartbeat: 20,
    client: {
        product: "clientProperties-test-client",
        version: "v1",
        platform: "osx",
        copyright: "SkyBet",
        information: "more"
    }
});

amqp.on('ready', function() {

    console.log("Connected and waiting to be killed...");

});
