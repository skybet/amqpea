require('longjohn');
var amqpea = require('..');

var url = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672/%2F';

var amqp = amqpea(url, { timeout: 2000, debug: true });

amqp.on('ready', function() {

    var mutex = amqpea.mutex();

    mutex(function(next) {
        amqp.declareExchange({
            name: 'dlx',
            type: 'fanout',
            autoDelete: true
        }, next);
    });

    mutex(function(next) {
        amqp.declareQueue({
            name: 'dlx',
            exclusive: true,
            autoDelete: true,
            binding: {
                exchange: 'dlx',
                keys: ['#']
            }
        }, next);
    });

    mutex(function(next) {
        amqp.declareQueue({
            name: '',
            exclusive: true,
            autoDelete: true,
            arguments: {
                'x-dead-letter-exchange': {
                    type: 'Long string',
                    data: 'dlx'
                }
            }
        }, next);
    }, queueReady);

});

function queueReady(err, q) {
    if (err) throw err;

    console.log("Delcared queue %s", q.name);

    var pubCh = amqp.createPublishChannel(false);
    var qCh = amqp.createQueueConsumerChannel(q.name, 1);
    var dlxCh = amqp.createQueueConsumerChannel('dlx');

    var i = 0;
    qCh.consume('ack', 'exclusive', function(msg) {
        var op = (++i % 2) ? 'ack' : 'reject';
        console.log("calling %s on msg %j", op, msg.fromJSON());
        msg[op]();
    });

    dlxCh.consume(!'ack', 'exclusive', function(msg) {
        console.log("Message received on DLX: %j %j", msg, msg.fromJSON());
    });

    var j = 0;
    setInterval(function() {
        pubCh.publish('', q.name, ++j);
    }, 500);
}
