var SocketCluster = require('socketcluster').SocketCluster;
var scClient = require('socketcluster-client');
var argv = require('minimist')(process.argv.slice(2));

var DEFAULT_PORT = 8888;
var CLUSTER_STATE_SERVER_HOST = argv.cssh || process.env.CLUSTER_STATE_SERVER_HOST;
var CLUSTER_STATE_SERVER_PORT = process.env.CLUSTER_STATE_SERVER_PORT || 7777;

if (!CLUSTER_STATE_SERVER_HOST) {
  throw new Error('No CLUSTER_STATE_SERVER_HOST was specified - This should be provided ' +
    'either through the CLUSTER_STATE_SERVER_PORT environment variable or ' +
    'by passing a --cssh=hostname argument to the CLI');
}

var options = {
  workers: Number(argv.w) || Number(process.env.SOCKETCLUSTER_WORKERS) || 1,
  brokers: Number(argv.b) || Number(process.env.SOCKETCLUSTER_BROKERS) || 1,
  port: Number(argv.p) || DEFAULT_PORT,
  wsEngine: process.env.SOCKETCLUSTER_WS_ENGINE || 'uws',
  appName: argv.n || process.env.SOCKETCLUSTER_APP_NAME || null,
  workerController: argv.wc || process.env.SOCKETCLUSTER_WORKER_CONTROLLER || __dirname + '/worker.js',
  brokerController: argv.bc || process.env.SOCKETCLUSTER_BROKER_CONTROLLER || __dirname + '/broker.js',
  socketChannelLimit: Number(process.env.SOCKETCLUSTER_SOCKET_CHANNEL_LIMIT) || 1000,
  crashWorkerOnError: argv['auto-reboot'] != false
};

var SOCKETCLUSTER_OPTIONS;

if (process.env.SOCKETCLUSTER_OPTIONS) {
  SOCKETCLUSTER_OPTIONS = JSON.parse(process.env.SOCKETCLUSTER_OPTIONS);
}

for (var i in SOCKETCLUSTER_OPTIONS) {
  if (SOCKETCLUSTER_OPTIONS.hasOwnProperty(i)) {
    options[i] = SOCKETCLUSTER_OPTIONS[i];
  }
}

var socketCluster = new SocketCluster(options);

var connectToClusterStateServer = function () {
  var scStateSocketOptions = {
    hostname: CLUSTER_STATE_SERVER_HOST,
    port: CLUSTER_STATE_SERVER_PORT
  };
  var stateSocket = scClient.connect(scStateSocketOptions);
  var stateSocketData = {
    instanceId: socketCluster.options.instanceId
  };
  stateSocket.emit('serverJoinCluster', stateSocketData);
};

connectToClusterStateServer();
