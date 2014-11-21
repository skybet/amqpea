# AMQPea
AMQP made easy

<!--
![Happy Pea](http://glenjamin.co.uk/chatzilla/misc/happy-pea.png)
"Happy Pea" Copyright [FancyFerret on DeviantArt](http://fancyferret.deviantart.com/art/Happy-Pea-150776948)
-->

## Goals

 * Would rather explode than miss an error
 * API supports common use-cases cleanly
 * API still allows more complex use-cases
 * API clearly separates protocol from higher-level actions
 * AMQP 0.9.1
 * Work nicely with RabbitMQ clusters
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

## Examples

More examples can be found in the [examples](./examples) folder.

## API Docs

Most of these options correspond directly to an AMQP protocol concept, for more information see the [AMQP 0.9.1 reference](http://www.rabbitmq.com/amqp-0-9-1-reference.html).

### amqpea(urisOrUri, options) => AMQPConnection

Establish a new AMQPConnection instance.

* `urisOrUri {string or array(string)}` Pass one or more AMQP URIs, the first one that works will be connected to.
  An AMQP uri looks like `amqp://login:password@hostname:port/vhost`.
  Note that if the vhost begins with a `/`, this needs to be URL encoded, so `/default` becomes a URL path of `/%2Fdefault`.
* `options {object}` Various options to control the client's behaviour
  - `timeout {number}` Number of milliseconds to wait before considering the connection timed out
  - `debug {boolean}` Set to true to log a bunch of debugging messages to STDERR. Can also be enabled by setting the environment variable `NODE_DEBUG_AMQP` to a non-empty value.
  - `heartbeat {boolean or number}` Control the AMQP protocol heartbeat: false for no heartbeats, true to do what the server says, or a number of seconds to override.
  - `client {object}` Send some strings to the server to help identify the client. Allowed keys are `product`, `version`, `platform`, `copyright` and `information`. Product, version and platform default to something useful.

### AMQPConnection

Instances represent a connected AMQP client, use the main `amqpea` export to create an instance.

#### Event: error(err)

Fired when the server has an error.

* `err {Error}` The exception that occurred

The connection object will not be usable after an error has been emitted. By default node.js will exit your program if you don't listen for this event.

#### Event: close(hadError)

Fired when the server connection has been closed.

* `hadError {boolean}` True when server is closing due to error

#### Event: ready()

Fired when the server connection is ready to use.

#### Event: connection-error(uri, err)

Fired for every failed server connection.

* `uri {string}` The URI that failed to connect
* `err {Error}` The exception that occurred

When attempting to connect to multiple servers, this is the only way to see why servers are failing. If none of the servers can be connected to, the `error` event will be fired with the same `err` as the last `connection-error`.

#### amqp.declareExchange(options, callback(err))

Declare an exchange on the server.

* `options {object}` Various options
  * `name {string}` name of the exchange
  * `type {string}` type of the exchange, default: `topic`
  * `passive {boolean}` only re-use existing exchange, default: `false`
  * `durable {boolean}` persist exchange across broker restarts, default: `false`
  * `autoDelete {boolean}` delete exchange when queues are finished using it, default: `false`
  * `internal {boolean}` disallow publishing directly to the exchange, default: `false`
* `callback(err) {function}` Called when exchange declaration is confirmed
  * `err {Error}` non-null when an error occurred

To publish to an exchange, use `createPublishChannel`.

#### amqp.declareQueue(options, callback(err))

Declare a queue on the server.

* `options {object}` Various options
  * `name {string}` name of the queue, leave blank to let the server generate a unique name
  * `passive {boolean}` only re-use existing queue, default: `false`
  * `durable {boolean}` persist queue across broker restarts, default: `false`
  * `exclusive {boolean}` only allow use by this connection, default: `false`
  * `autoDelete {boolean}` delete queue when all consumers are finished, default: `false`
  * `binding {object}` optional, configure the queue's bindings
    * `exchange {string}` name of the exchange to bind to
    * `keys {array(string)}` which routing keys to bind
* `callback(err, queue) {function}` Called when queue declaration is confirmed
  * `err {Error}` non-null when an error occurred
  * `queue {object}` Contains `name` as a `{string}`.

#### amqp.createPublishChannel(confirm) => AMQPPublishChannel

`TODO: write this`

#### amqp.createQueueConsumerChannel(name, prefetch) => AMQPQueueConsumerChannel

`TODO: write this`

#### amqp.close()

`TODO: write this`

### AMQPPublishChannel

`TODO: write this`

#### channel.publish(exchange, key, body, callback)

`TODO: write this`

#### channel.close()

`TODO: write this`

### AMQPQueueConsumerChannel

Represents a channel to be used for consuming messages.

#### channel.tag

The consumer's tag.

#### Event: 'error'

Can be thrown if an `ack` or `reject` fails.
TODO: move these errors into the actions' callbacks.

#### channel.consume(ack, exclusive, handler(msg))

Begin consuming the queue.

* `ack {boolean}` Enable message acknowledgement
* `exclusive {boolean}` Request that only this consumer can use the queue
* `handler(msg) {function}` Called on every message with an `AMQPMessage` object

### AMQPMessage

#### msg.delivery

`{object}` Delivery information, likely to change in future versions.

#### msg.properties

`{object}` Message properties, likely to change in future versions.

#### msg.content

`{Buffer}` The raw message content.

#### msg.fromJSON()

Decode a JSON message into an object, may `throw` an `Error`.

#### msg.ack()

Acknowledge the message with the server.

#### msg.ack()

Reject the message with the server.


## Running the Tests

To run the tests you will need a local AMQP server. The testsuite talks to the broker as well as via the HTTP admin API.

There are environment variables to set which tell the test runner how to connect.

* `AMQP_USERNAME` defaults to "guest"
* `AMQP_PASSWORD` defaults to "guest"
* `AMQP_HOSTNAME` defaults to "localhost"
* `AMQP_PORT` defaults to 5672
* `AMQP_VHOST` defaults to "/"
* `AMQP_ADMIN_PORT` defaults to 15672

With the appropriate variables set, use npm to run the testsuite.

```sh
npm test
```
