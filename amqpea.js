// Easy peasy amqp
// TODO: integration test and open source this.
// Specific TODOs
//  * auto-bind all methods to their instance
//  * Introduce channel abstraction
//  * Scope errors to channels where possible
//  * Ensure reply listeners are scoped to correct channels

var EE = require('events').EventEmitter;
var net = require('net');
var urllib = require('url');
var util = require('util');

var async = require('async');
var bramqp = require('bramqp');

var connection = require('./lib/connection');

function noOp(){}

var spec = 'rabbitmq/full/amqp0-9-1.stripped.extended';

exports = module.exports = function createAMQP(uriOrUris, options) {
    var servers = Array.isArray(uriOrUris) ?
        uriOrUris.map(parseAMQPUri) : [parseAMQPUri(uriOrUris)];
    return new AMQPConnection(servers, options);
};

function parseAMQPUri(uri) {
    var parsedUri = urllib.parse(uri);
    var auth = (parsedUri.auth || ':').split(':');
    return {
        uri: uri,
        host: parsedUri.hostname || 'localhost',
        port: parseInt(parsedUri.port, 10) || 5672,
        login: auth[0] || 'guest',
        password: auth[1] || 'guest',
        vhost: decodeURIComponent(parsedUri.path.substring(1)) || '/'
    };
}

util.inherits(AMQPConnection, EE);
function AMQPConnection(servers, options) {
    var amqp = this;

    amqp.uri = null;
    amqp.socket = null;
    amqp.handle = null;
    amqp.channelNum = 1;

    connectToFirst(
        servers, options,
        amqp.emit.bind(amqp, 'connection-error'),
        onAMQPConnectionReady
    );

    function onAMQPConnectionReady(err, uri, socket, handle) {
        if (err) return amqp.emit('error', err);

        socket.on('error', amqp.emit.bind(amqp, 'error'));
        socket.on('timeout',
            amqp.emit.bind(amqp, 'error', new Error('Socket timeout')));
        handle.on('error', amqp.emit.bind(amqp, 'error'));

        amqp.uri = uri;
        amqp.socket = socket;
        amqp.handle = handle;

        // TODO: reify channel as a concept here later
        // TODO: channel flow control
        handle.channel.open(1, function(err) {
            if (err) return amqp.emit('error', err);
        });
        handle.once('1:channel.open-ok', function() {
            onAMQPCommunicationReady();
        });
    }
    function onAMQPCommunicationReady() {
        amqp.handle.on('connection.close', function(ch, method, data) {
            amqp.handle.connection['close-ok']();
            amqp.socket.end();
            var error;
            if (data['reply-code'] != 200) {
                error = new Error('AMQP Connection Closed ' + data['reply-text']);
                error.code = data['reply-code'];
                amqp.emit('error', error);
            }
            amqp.emit('close', !!error);
        });
        amqp.handle.on('channel.close', function(ch, method, data) {
            if (data['reply-code'] != 200) {
                var error = new Error(
                    'AMQP Connection Closed ' + data['reply-text']);
                error.code = data['reply-code'];
                amqp.emit('error', error);
            }
        });
        // Ensure exceptions in 'ready' handlers don't blow the parser up
        setImmediate(amqp.emit.bind(amqp, 'ready'));
    }
}

function connectToFirst(servers, options, notifyError, callback) {

    var socket, handle, lastErr;

    async.detectSeries(servers, function(server, next) {

        connectToAMQP(server, options, function(err, _socket, _handle) {
            if (err) {
                notifyError(server.uri, err);
                lastErr = err;
                return next(false);
            }

            socket = _socket;
            handle = _handle;
            next(true);
        });

    }, function(server) {
        if (!server) {
            return callback(lastErr);
        }
        callback(null, server.uri, socket, handle);
    });
}

function connectToAMQP(server, options, callback) {
    var debug = options.debug || process.env.NODE_DEBUG_AMQP;

    var timeout, socket, handle;

    timeout = setTimeout(
        async.apply(cleanupAndCallback, new Error('Connection timed out')),
        options.timeout || 30000
    );

    if (debug) console.warn("Connecting to %s:%d", server.host, server.port);
    socket = net.connect({host: server.host, port: server.port});
    socket.on('timeout', socketTimeout);
    function socketTimeout() {
        cleanupAndCallback(new Error('Socket timed out'));
    }
    socket.on('error', cleanupAndCallback);
    if (debug) {
        socket.on('connect', function() {
            console.warn("Socket connected to %s:%d", server.host, server.port);
        });
    }

    bramqp.initialize(socket, options.spec || spec, function(err, _handle) {
        if (err) {
            return cleanupAndCallback(err);
        }
        handle = _handle;
        handle.on('error', cleanupAndCallback);

        if (debug) attachDebugging(handle);

        connection.openAMQPCommunication(
            handle,
            {
                login: server.login,
                password: server.password,
                vhost: server.vhost,
                heartbeat: 'heartbeat' in options ? options.heartbeat : true,
                client: options.client
            },
            cleanupAndCallback
        );
    });

    function cleanupAndCallback(err) {
        clearTimeout(timeout);
        if (socket) {
            if (err) socket.destroy();
            socket.removeListener('timeout', socketTimeout);
            socket.removeListener('error', cleanupAndCallback);
        }
        if (handle) {
            handle.removeListener('error', cleanupAndCallback);
        }
        callback(err, socket, handle);
    }
}

function attachDebugging(handle) {
    var realHeartbeat = handle.heartbeat;
    handle.heartbeat = function() {
        console.warn("AMQP to ❤");
        realHeartbeat.apply(this, arguments);
    };
    var realMethod = handle.method;
    handle.method = function(ch, className, method, args) {
        console.warn(
            "AMQP to %d %s.%s %j",
            ch, className, method, args
        );
        realMethod.apply(this, arguments);
    };
    var realContent = handle.content;
    handle.content = function(ch, className, props, content) {
        console.warn(
            "AMQP to %d %s %j - %s",
            ch, className, props, content
        );
        realContent.apply(this, arguments);
    };
    // Disabled because it's too spammy
    // handle.on('heartbeat', function() {
    //     console.warn("AMQP ❤ in");
    // });
    handle.on('method', function(ch, className, method, data) {
        console.warn(
            "AMQP %d in %s.%s %j",
            ch, className, method.name, data
        );
    });
    handle.on('content', function(ch, className, props, content) {
        console.warn(
            "AMQP %d in %s %j - %s",
            ch, className, props, content
        );
    });
    var realOn = handle.on;
    handle.on = function(event) {
        console.warn("AMQP listener attached for %j", event);
        realOn.apply(this, arguments);
    };
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
    this.handle.once('exchange.declare-ok', function() {
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
            function confirmed(ch, method) {
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

    function consume(ack, exclusive, handler) {
        if (ack && !prefetchCount && prefetchCount !== 0) {
            consumer.emit('error', new Error(
                'Attempted to enable acknowledgement on a queue consumer ' +
                'without setting prefetchCount on channel, this is probably ' +
                'not a good idea. If you\'re sure, set prefetchCount to 0 ' +
                'explicitly'
            ));
        }
        if (handler) {
            consumer.on('message', handler);
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
        handle.on('basic.deliver', function(ch, method, delivery) {
            if (ch != num) return;
            handle.once('content', function(ch, className, props, content) {
                messageReceived(delivery, props, content);
            });
        });
    }
    function messageReceived(delivery, properties, content) {
        var tag = delivery['delivery-tag'];
        var msg = new AMQPMessage(
            delivery,
            properties,
            content,
            function ack() {
                handle.basic.ack(num, tag, function(err) {
                    if (err) consumer.emit('error', err);
                });
            },
            function reject(requeue) {
                handle.basic.reject(num, tag, !!requeue, function(err) {
                    if (err) consumer.emit('error', err);
                });
            }
        );
        consumer.emit('message', msg);
    }
};

AMQPConnection.prototype.close = function(callback) {
    callback = callback || noOp;
    this.handle.connection.close(function(err) {
        if (err) return callback(err);
    });
    var socket = this.socket;
    this.handle.once('connection.close-ok', function() {
        socket.end(callback);
    });
};

util.inherits(AMQPQueueConsumer, EE);
function AMQPQueueConsumer(consumeFunction) {
    this.consume = consumeFunction;
    this.tag = null;
}

function AMQPMessage(delivery, properties, content, ack, reject) {
    this.delivery = delivery;
    this.properties = properties;
    this.content = content;
    this.ack = ack;
    this.reject = reject;
}
AMQPMessage.prototype.fromJSON = function() {
    if (this.properties['content-type'] != 'application/json') {
        throw new Error('Message is not json');
    } else {
        return JSON.parse(this.content);
    }
};

exports.mutex = asyncMutex;
function asyncMutex() {
    var q = async.queue(worker, 1);
    function worker(fn, callback) {
        fn(callback);
    }
    return function(fn, callback) {
        q.push(fn, callback);
    };
}
