/*eslint-env mocha*/
var urllib = require('url');
var net = require('net');

var async = require('async');

var amqpea = require('..');

var login = process.env.AMQP_USERNAME || "guest";
var password = process.env.AMQP_PASSWORD || "guest";
var hostname = process.env.AMQP_HOSTNAME || "localhost";
var port = parseInt(process.env.AMQP_PORT, 10) || 5672;
var vhost = process.env.AMQP_VHOST || "/";
var admin = parseInt(process.env.AMQP_ADMIN_PORT, 10) || 15672;
var adminProto = process.env.AMQP_ADMIN_PROTO || "http";
var adminSSLInsecure = !!process.env.AMQP_ADMIN_SSL_INSECURE;
var debug = !!process.env.NODE_DEBUG_AMQP;

var uriData = {
    protocol: 'amqp',
    slashes: true,
    auth: encodeURIComponent(login) + ':' + encodeURIComponent(password),
    hostname: hostname,
    port: port,
    pathname: encodeURIComponent(vhost)
};

var uri = exports.uri = urllib.format(uriData);
exports.brokenUri = urllib.format(
    copy(uriData, { hostname: 'amqp.example.com' }));
exports.brokenUri2 = urllib.format(
    copy(uriData, { hostname: 'amqp.example.org' }));

before(function(done) {
    async.map(
        [port, admin],
        async.apply(testConnection, hostname),
        function(err) {
            console.warn("");
            done(err);
        }
    );
});

// Shorthand factory for connection related to test
exports.createConnection = function(context, callback) {
    var name = context.currentTest.fullTitle();
    var amqp = amqpea(uri, { timeout: 200, client: { product: name } });
    amqp.on('error', callback);
    amqp.on('ready', function() {
        amqp.removeListener('error', callback);
        callback();
    });
    exports.deferCleanup(amqp);
    return amqp;
};

// Ensure server state is cleared down between tests
var items = [];
var connections = [];
exports.deferCleanup = function deferCleanup(type, object) {
    if (typeof object === 'undefined') {
        object = type;
        type = 'connection';
    }
    switch(type) {
        case 'connection':
            object.on('ready', function() {
                connections.push(object);
            });
            break;
        default:
            items.push([type, object]);
            break;
    }
};
afterEach(function closeConnections(done) {
    async.each(connections, function(amqp, next) {
        amqp.close(function(){ next(); });
    }, done);
    connections = [];
});
afterEach(function deleteItems(done) {
    async.each(items, function(item, next) {
        var type = item[0], name = item[1];
        exports.admin({
            method: 'DELETE',
            path: "/" + type + "s/" + encodeURIComponent(vhost) +
                    "/" + encodeURIComponent(name)
        }, function(err, data) {
            if (err && err.code == 404) {
                err = null;
            }
            return next(err, data);
        });
    }, done);
    items = [];
});

// Helpers for talking to the admin API
var client = require('request');
exports.admin = function(options, callback) {
    var path;
    if (typeof options === 'string') {
        path = options;
        options = {};
    } else {
        path = options.path;
        delete options.path;
    }
    var opts = copy({
        method: 'GET',
        uri: urllib.format({
            protocol: adminProto,
            hostname: hostname,
            port: admin,
            pathname: "/api" + path
        }),
        json: true,
        strictSSL: !adminSSLInsecure,
        auth: { username: login, password: password }
    }, options);
    if (debug) console.warn("%s %s", opts.method, path);
    client(opts, function(err, res, body) {
        if (!err && res.statusCode >= 400) {
            err = new Error('' + res.statusCode + ': ' + body);
            err.code = res.statusCode;
        }
        callback(err, body, res);
    });
};
exports.adminConnectionInfo = function (amqp, callback) {
    var outgoingPort = amqp.socket.localPort;
    exports.admin("/connections", function(err, connections) {
        if (err) return callback(err);

        var connection = connections.filter(function(conn) {
            return conn.peer_port == outgoingPort;
        })[0];

        if (!connection) return callback(new Error('Connection not found'));

        callback(null, connection);
    });
};
exports.adminExchangeInfo = function (name, callback) {
    var url = "/exchanges/" + encodeURIComponent(vhost) +
                "/" + encodeURIComponent(name);
    exports.admin(url, callback);
};

function testConnection(hostname, port, callback) {
    console.warn("Testing connection to %s:%d", hostname, port);
    var socket = net.connect({host: hostname, port: port});
    socket.on('connect', function() {
        console.warn("Connection %s:%d connected", hostname, port);
        socket.destroy();
        callback();
    });
    socket.on('error', function(err) {
        console.warn(
            "Error connecting to %s:%d - %s",
            hostname, port, err.stack
        );
        callback(err);
    });
}

function copy(a, b) {
    var result = {};
    Object.keys(a).forEach(function(k) { result[k] = a[k]; });
    Object.keys(b).forEach(function(k) { result[k] = b[k]; });
    return result;
}
