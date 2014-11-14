# AMQPea
AMQP made easy

![Happy Pea](http://fc00.deviantart.net/fs71/f/2010/017/6/5/Happy_Pea_by_FancyFerret.png "Copyright FancyFerret on DeviantArt")

## Goals

 * Would rather explode than miss an error
 * API supports common use-cases cleanly
 * API allows complicated things
 * API clearly separates protocol from higher-level actions
 * Work nicely with RabbitMQ clusers
 * Be fast enough
 * Easy to debug
 * Well tested...

## Quick Start

Install

```sh
npm install --save amqpea
```

All-in-one example:

```javascript
var amqpea = require('amqpea');

function die(err) {
    throw err;
}

var uri = 'amqp://guest:guest@localhost:5672/%2F';
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
```

## API Docs

### amqpea(urisOrUri, options) => AMQPConnection

### AMQPConnection.emit('error')

### AMQPConnection.emit('close')

### AMQPConnection.emit('ready')

### AMQPConnection.emit('connection-error')
emitted for every failed connection, useful when connecting to multiple

### AMQPConnection.declareExchange(options, callback)

### AMQPConnection.declareQueue(options, callback)

### AMQPConnection.createPublishChannel(confirm) => AMQPPublishChannel

### AMQPConnection.createQueueConsumerChannel(name, prefetch) => AMQPQueueConsumerChannel
