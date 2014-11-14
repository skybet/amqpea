require('longjohn');
var amqpea = require('..');

/**
 * AMQPea will connect to the first available server
 */

var urls;
if (process.env.AMQP_URLS) {
    urls = process.env.AMQP_URLS.split(',');
} else {
    urls = [
        'amqp://guest:guest@nope:5672/%2F',
        'amqp://guest:guest@localhost:5672/%2F'
    ];
}

var amqp = amqpea(urls, { timeout: 2000, debug: true });

amqp.on('connection-error', function(server, err) {
    console.log("warning: ", server, err.stack);
});

amqp.on('ready', function() {
    console.log("Connected to %s", amqp.uri);
});
