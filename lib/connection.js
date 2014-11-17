var async = require('async');

/**
 * more general version of openAMQPCommunication from bramqp
 *
 * @param {bramqp} handle
 * @param {object} options
 *
 *        options.login         required string
 *        options.password      required string
 *        options.vhost         required string
 *
 *        options.heartbeat     int seconds OR
 *                              false to disable OR
 *                              true to trust server (defaults to this)
 *
 *        options.client        optional object
 *          client.product      optional string
 *          client.version      optional string
 *          client.platform     optional string
 *          client.copyright    optional string
 *          client.information  optional string
 *
 * @param {function} callback
 */
exports.openAMQPCommunication = openAMQPCommunication;
function openAMQPCommunication(handle, options, callback) {

    var heartbeat;

    async.waterfall([
        waitFor('connection.start'),
        startOk,
        waitFor('connection.tune'),
        tuneOk,
        setupHeartbeat,
        open
    ], callback);

    function waitFor(event) {
        return function(next) {
            // event handlers don't have err as arg 1
            handle.once(event, async.apply(next, null));
        };
    }
    function startOk(ch, method, data, next) {
        var client = buildClientProperties(options.client);
        var auth = {
            'LOGIN': {
                type: 'Long string',
                data: options.login
            },
            'PASSWORD': {
                type: 'Long string',
                data: options.password
            }
        };
        handle.connection['start-ok'](
            client, 'AMQPLAIN', auth, 'en_US', unary(next)
        );
    }
    function tuneOk(ch, method, data, next) {
        handle.setFrameMax(data['frame-max']);
        if (options.heartbeat === true) {
            heartbeat = data['heartbeat'];
        } else if (options.heartbeat > 0) {
            heartbeat = options.heartbeat;
        } else {
            heartbeat = 0;
        }
        handle.connection['tune-ok'](
            data['channel-max'], data['frame-max'], heartbeat, unary(next)
        );
    }
    function setupHeartbeat(next) {
        var missed = 0;

        checkHeartbeat();
        var timer = setInterval(checkHeartbeat, heartbeat * 1000);

        handle.on('heartbeat', function() { missed = 0; });
        handle.on('close', function() { clearInterval(timer); });
        function checkHeartbeat() {
            handle.heartbeat(function(err) {
                if (err) handle.emit('error', err);
            });
            if (missed >= 2) {
                handle.emit('error',
                    new Error('Server heartbeats not received'));
            }
            missed += 1;
        }

        next();
    }
    function open(next) {
        handle.connection.open(options.vhost, function(){});
        waitFor('connection.open-ok')(next);
    }
}

function unary(f) {
    return function(a) { f(a); };
}

var v = require('../package.json').version;
var clientPropertyFields = {
    product: 'AMQPea',
    version: v,
    platform: require('os').type() + '/Node.js/AMQPea/' + v,
    copyright: null,
    information: null
};
function buildClientProperties(options) {
    if (!options) return null;
    var client = {};
    Object.keys(clientPropertyFields).forEach(function(k) {
        var val = options[k] || clientPropertyFields[k];
        if (val) {
            client[k] = {
                type: 'Long string',
                data: val
            };
        }
    });
    return client;
}
