/*eslint-env mocha*/
var urllib = require('url');
var net = require('net');

var async = require('async');

var login = process.env.AMQP_USERNAME || "guest";
var password = process.env.AMQP_PASSWORD || "guest";
var hostname = process.env.AMQP_HOSTNAME || "localhost";
var port = parseInt(process.env.AMQP_PORT, 10) || 5672;
var vhost = process.env.AMQP_VHOST || "/";
var admin = parseInt(process.env.AMQP_ADMIN_PORT, 10) || 15672;

var uriData = {
    protocol: 'amqp',
    slashes: true,
    auth: encodeURIComponent(login) + ':' + encodeURIComponent(password),
    hostname: hostname,
    port: port,
    pathname: encodeURIComponent(vhost)
};

exports.uri = urllib.format(uriData);
exports.brokenUri = urllib.format(
    copy(uriData, { hostname: '23rt' + hostname }));
exports.brokenUri2 = urllib.format(
    copy(uriData, { hostname: 'lfg' + hostname }));

before(function(done) {
    async.map([port, admin], async.apply(testConnection, hostname), done);
});

var connections = [];
exports.deferCleanup = function deferCleanup(amqp) {
    amqp.on('ready', function() {
        connections.push(amqp);
    });
};
afterEach(function(done) {
    async.each(connections, function(amqp, next) {
        amqp.close(next);
    }, done);
    connections = [];
});

var client = require('request');
exports.admin = function(path, callback) {
    client({
        uri: urllib.format({
            protocol: "http",
            hostname: hostname,
            port: admin,
            pathname: path
        }),
        json: true,
        auth: { username: login, password: password }
    }, function(err, res, body) {
        callback(err, body, res);
    });
};
exports.adminConnectionInfo = function (amqp, callback) {
    var outgoingPort = amqp.socket.localPort;
    exports.admin("/api/connections", function(err, connections) {
        if (err) return callback(err);

        var connection = connections.filter(function(conn) {
            return conn.peer_port == outgoingPort;
        })[0];

        if (!connection) return callback(new Error('Connection not found'));

        callback(null, connection);
    });
};

function testConnection(hostname, port, callback) {
    var socket = net.connect({host: hostname, port: port});
    socket.on('connect', function() {
        socket.end();
        callback();
    });
    socket.on('error', callback);
}

function copy(a, b) {
    var result = {};
    Object.keys(a).forEach(function(k) { result[k] = a[k]; });
    Object.keys(b).forEach(function(k) { result[k] = b[k]; });
    return result;
}
