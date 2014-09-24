// Easy peasy amqp
// TODO: extract, integration test and open source this.
// http://fc00.deviantart.net/fs71/f/2010/017/6/5/Happy_Pea_by_FancyFerret.png
// Goals
//  * Simple API
//  * API supports common use-cases cleanly
//  * Would rather explode than miss an error
// Specific TODOs
//  * Introduce channel abstraction
//  * Scope errors to channels where possible
//  * Ensure reply listeners are scoped to correct channels
//  * Support clientProperties on connection
//  * Allow client-specified heartbeats

var EE = require('events').EventEmitter;
var net = require('net');
var urllib = require('url');
var util = require('util');

var async = require('async');
var bramqp = require('bramqp');

function noOp(){}

bramqp.selectSpecification('rabbitmq/full/amqp0-9-1.stripped.extended', noOp);

module.exports = function createAMQP(uri, options) {
    var server = parseAMQPUri(uri);
    return new AMQPConnection(server, options);
};

function parseAMQPUri(uri) {
    var parsedUri = urllib.parse(uri);
    var auth = (parsedUri.auth || ':').split(':');
    return {
        host: parsedUri.hostname || 'localhost',
        port: parseInt(parsedUri.port, 10) || 5672,
        login: auth[0] || 'guest',
        password: auth[1] || 'guest',
        vhost: decodeURIComponent(parsedUri.path.substring(1)) || '/',
    };
}

util.inherits(AMQPConnection, EE);
function AMQPConnection(broker, options) {
    var amqp = this;

    amqp.socket = null;
    amqp.handle = null;
    amqp.channelNum = 1;

    // TODO: actually do this
    var heartbeat = options.heartbeat || 10;

    var timeout = setTimeout(function() {
        amqp.emit('error', new Error('Connection timed out'));
        amqp.socket.destroy();
    }, options.timeout || 30000);

    amqp.socket = setupSocket(amqp, broker.host, broker.port, heartbeat);
    amqp.socket.on('connect', function() {
        bramqp.initializeSocket(amqp.socket, function(err, handle) {
            if (err) {
                return amqp.emit('error', err);
            }
            amqp.handle = handle;
            handle.on('error', function(err) {
                amqp.emit('error', err);
            });
            if (process.env.NODE_DEBUG_AMQP) {
                attachDebugging(handle);
            }
            handle.openAMQPCommunication(
                broker.login, broker.password, 'heartbeat', broker.vhost,
                onAMQPCommunicationReady
            );
        });
    });
    function onAMQPCommunicationReady(err) {
        if (err) {
            return amqp.emit('error', err);
        }
        amqp.handle.on('connection.close', function(ch, method, data) {
            amqp.handle.connection['close-ok']();
            amqp.socket.end();
            var err;
            if (data['reply-code'] != 200) {
                err = new Error('AMQP Connection Closed ' + data['reply-text']);
                err.code = data['reply-code'];
                amqp.emit(err);
            }
            amqp.emit('close', !!err);
        });
        amqp.handle.on('channel.close', function(ch, method, data) {
            if (data['reply-code'] != 200) {
                var err = new Error(
                    'AMQP Connection Closed ' + data['reply-text']);
                err.code = data['reply-code'];
                amqp.emit(err);
            }
        });
        clearTimeout(timeout);
        amqp.emit('ready');
    }
}

function setupSocket(amqp, host, port, heartbeat) {
    var socket = net.connect(port, host);
    //socket.setTimeout(heartbeat * 2 * 1000);
    socket.on('timeout', function() {
        amqp.emit('error', new Error("Socket Timeout"));
    });
    socket.on('error', function(err) {
        amqp.emit('error', err);
    });
    return socket;
}

function attachDebugging(handle) {
    var realMethod = handle.method;
    handle.method = function(ch, className, method, args) {
        console.warn(
            "AMQP %d > %s.%s: %j",
            ch, className, method, args
        );
        realMethod.apply(this, arguments);
    };
    var realContent = handle.content;
    handle.content = function(ch, className, props, content, callback) {
        console.warn(
            "AMQP %d => %s %j - %s",
            ch, className, props, content
        );
        realContent.apply(this, arguments);
    };
    handle.on('method', function(ch, className, method, data) {
        console.warn(
            "AMQP %d < %s.%s: %j",
            ch, className, method.name, data
        );
    });
    handle.on('content', function(ch, className, props, content) {
        console.warn(
            "AMQP %d <= %s %j - %s",
            ch, className, props, content
        );
    });

}

AMQPConnection.prototype.declareExchange = function(options, callback) {
    this.handle.exchange.declare(
        1,
        options.name,
        options.type || 'topic',
        !!options.passive,
        !!options.durable,
        !!options.autoDelete,
        !!options.internal,
        false, // no wait
        {}, // misc arguments
        function(err) {
            if (err) return callback(err);
        }
    );
    this.handle.once('exchange.declare-ok', function(ch, method, data) {
        callback();
    });
};

AMQPConnection.prototype.createPublishChannel = function(confirm) {
    var handle = this.handle;
    var mutex = asyncMutex();
    var num = ++this.channelNum;

    mutex(function(next) {
        handle.channel.open(num, function(err) {
            if (err) return next(err);
        });

        handle.once('channel.open-ok', function() {
            if (!confirm) return next();
            handle.confirm.select(num, false, function(err) {
                if (err) return next(err);
            });
            handle.once('confirm.select-ok', function() {
                next();
            });
        });
    });

    return {
        close: close,
        publish: publish
    };

    function close(callback) {
        mutex(function(next) {
            handle.channel.close(num);
            handle.once('channel.close-ok', function() {
                next();
            });
        }, callback);
    }

    function publish(exchange, key, body, callback) {
        if (!callback) {
            if (confirm) {
                throw new Error(
                    'Must pass callback when using publisher confirmation');
            }
            callback = callback || noOp;
        }

        mutex(function(next) {
            handle.basic.publish(
                num, exchange, key, !"mandatory", !"immediate",
                onPublish
            );
            function onPublish(err) {
                if (err) return next(err);

                handle.content(
                    num,
                    'basic',
                    {
                        'content-type': 'application/json'
                    },
                    JSON.stringify(body),
                    onContent
                );
            }
            function onContent(err) {
                if (err) return next(err);

                if (!confirm) return next(err);

                handle.on('basic.ack', confirmed);
                handle.on('basic.nack', confirmed);
            }
            function confirmed(ch, method, data) {
                handle.removeListener('basic.ack', confirmed);
                handle.removeListener('basic.nack', confirmed);
                if (method.name == 'ack') {
                    next();
                } else {
                    next(new Error('Server rejected message'));
                }
            }
        }, callback);
    }
};

AMQPConnection.prototype.declareQueue = function(options, callback) {
    var amqp = this;
    var handle = this.handle;
    handle.queue.declare(
        1,
        options.name,
        !!options.passive,
        !!options.durable,
        !!options.exclusive,
        !!options.autoDelete,
        false, // no wait
        options.arguments || {},
        function(err) {
            if (err) return callback(err);
        }
    );
    handle.once('queue.declare-ok', function(ch, method, data) {
        if (!options.binding) return callback(null, createQueue());

        function bindKey(key, next) {
            handle.queue.bind(
                1,
                options.name,
                options.binding.exchange,
                key,
                false, //no wait
                {},
                function(err) {
                    if (err) next(err);
                }
            );
            handle.once('queue.bind-ok', function() {
                next();
            });
        }

        async.forEach(options.binding.keys, bindKey, function(err) {
            if (err) return callback(err);
            callback(null, createQueue());
        });

        function createQueue() {
            var name = data.queue;
            return {
                name: name,
                toString: function() { return 'AMQPQueue: ' + name; }
            };
        }
    });
};

AMQPConnection.prototype.createQueueConsumerChannel =
function(queueName, prefetchCount) {
    var handle = this.handle;
    var mutex = asyncMutex();
    var num = ++this.channelNum;

    mutex(function(next) {
        handle.channel.open(num, function(err) {
            if (err) return next(err);
        });

        handle.once('channel.open-ok', function() {
            next();
        });
    });

    if (prefetchCount) {
        mutex(function(next) {
            handle.basic.qos(num, 0, prefetchCount, false, function(err) {
                if (err) return next(err);
            });
            handle.once('basic.qos-ok', function() {
                next();
            });
        });
    }

    var consumer = new AMQPQueueConsumer(consume);

    return consumer;

    function consume(ack, exclusive, messageHandler) {
        if (ack && !prefetchCount && prefetchCount !== 0) {
            consumer.emit('error', new Error(
                'Attempted to enable acknowledgement on a queue consumer ' +
                'without setting prefetchCount on channel, this is probably ' +
                'not a good idea. If you\'re sure, set prefetchCount to 0 ' +
                'explicitly'
            ));
        }
        if (messageHandler) {
            consumer.on('message', messageHandler);
        }
        mutex(function(next) {
            handle.basic.consume(
                num,
                queueName,
                '', // Auto-gen consumer tag
                false, // no-local (ignored by rabbitmq)
                !ack,
                !!exclusive,
                false, // no-wait
                {}, // misc arguments
                function(err) {
                    if (err) return next();
                    consumer.emit(err);
                }
            );
            handle.once('basic.consume-ok', function(ch, method, data) {
                consumer.tag = data.consumerTag;
                next();
            });
        });
        handle.on('basic.deliver', function(ch, method, data) {
            if (ch != num) return;
            handle.once('content', function(ch, className, props, content) {
                messageReceived(data, props, content);
            });
        });
    }
    function messageReceived(data, properties, content) {
        var tag = data['delivery-tag'];
        var msg = new AMQPMessage(
            data,
            properties,
            content,
            function ack() {
                handle.basic.ack(num, tag, function(err) {
                    if (err) consumer.emit('error', err);
                });
            }
        );
        consumer.emit('message', msg);
    }
};

AMQPConnection.prototype.close = function(callback) {
    this.handle.closeAMQPCommunication(callback || noOp);
};

util.inherits(AMQPQueueConsumer, EE);
function AMQPQueueConsumer(consumeFunction) {
    this.consume = consumeFunction;
    this.tag = null;
}

function AMQPMessage(delivery, properties, content, ack) {
    this.delivery = delivery;
    this.properties = properties;
    this.content = content;
    this.ack = ack;
}
AMQPMessage.prototype.fromJSON = function() {
    if (this.properties['content-type'] != 'application/json') {
        throw new Error('Message is not json');
    } else {
        return JSON.parse(this.content);
    }
};

function asyncMutex() {
    var q = async.queue(worker, 1);
    function worker(fn, callback) {
        fn(callback);
    }
    return function(fn, callback) {
        q.push(fn, callback);
    };
}
