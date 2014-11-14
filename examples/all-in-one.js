var amqpea = require('..');

function die(err) {
    throw err;
}

var uri = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672/%2F';
var amqp = amqpea(uri, { timeout: 2000 });

amqp.on('error', die);
amqp.on('ready', function() {
    amqp.declareExchange({
        name: 'x'
    }, whenExchangeReady);
});
function whenExchangeReady(err) {
    if (err) return die(err);
    amqp.declareQueue({
        name: 'q',
        exclusive: true,
        binding: {
            exchange: 'x',
            keys: ['route']
        }
    }, whenQueueReady);
}
function whenQueueReady(err) {
    if (err) return die(err);
    beginPublishing();
    var consumer = amqp.createQueueConsumerChannel('q', 1);
    consumer.consume('ack', 'exclusive', function(msg) {
        var body = msg.fromJSON();
        console.log("Received: %j", body);
        msg.ack();
    });
}
function beginPublishing() {
    var i = 0;
    var publisher = amqp.createPublishChannel('confirm');
    setInterval(function() {
        publisher.publish('x', 'route', { num: ++i }, function(err) {
            if (err) return die(err);
            console.log("Published message %d", i);
        });
    }, 1000);
}
