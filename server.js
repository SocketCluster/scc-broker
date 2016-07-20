var SocketCluster = require('socketcluster').SocketCluster;
var scClient = require('socketcluster-client');
var argv = require('minimist')(process.argv.slice(2));

var DEFAULT_PORT = 8888;
var SC_CLUSTER_STATE_SERVER_HOST = argv.cssh || process.env.SC_CLUSTER_STATE_SERVER_HOST;
var SC_CLUSTER_STATE_SERVER_PORT = Number(process.env.SC_CLUSTER_STATE_SERVER_PORT) || 7777;
var RETRY_DELAY = Number(argv.r) || Number(process.env.SC_CLUSTER_BROKER_SERVER_RETRY_DELAY) || 2000;
var SECURE = !!argv.s || !!process.env.SC_CLUSTER_BROKER_SERVER_SECURE;
var LOG_LEVEL = Number(argv.l) || Number(process.env.SC_CLUSTER_BROKER_SERVER_LOG_LEVEL) || 1;

if (!SC_CLUSTER_STATE_SERVER_HOST) {
  throw new Error('No SC_CLUSTER_STATE_SERVER_HOST was specified - This should be provided ' +
    'either through the SC_CLUSTER_STATE_SERVER_PORT environment variable or ' +
    'by passing a --cssh=hostname argument to the CLI');
}

var options = {
  workers: Number(argv.w) || Number(process.env.SOCKETCLUSTER_WORKERS) || 1,
  brokers: Number(argv.b) || Number(process.env.SOCKETCLUSTER_BROKERS) || 1,
  port: Number(argv.p) || Number(process.env.SOCKETCLUSTER_SERVER_PORT) || DEFAULT_PORT,
  wsEngine: process.env.SOCKETCLUSTER_WS_ENGINE || 'uws',
  appName: argv.n || process.env.SOCKETCLUSTER_APP_NAME || null,
  workerController: argv.wc || process.env.SOCKETCLUSTER_WORKER_CONTROLLER || __dirname + '/worker.js',
  brokerController: argv.bc || process.env.SOCKETCLUSTER_BROKER_CONTROLLER || __dirname + '/broker.js',
  socketChannelLimit: Number(process.env.SOCKETCLUSTER_SOCKET_CHANNEL_LIMIT) || 1000,
  crashWorkerOnError: argv['auto-reboot'] != false,
  messageLogLevel: LOG_LEVEL
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
    hostname: SC_CLUSTER_STATE_SERVER_HOST,
    port: SC_CLUSTER_STATE_SERVER_PORT
  };
  var stateSocket = scClient.connect(scStateSocketOptions);
  stateSocket.on('error', (err) => {
    console.error(err);
  });

  var stateSocketData = {
    instanceId: socketCluster.options.instanceId,
    instancePort: socketCluster.options.port,
    instanceSecure: SECURE
  };

  var emitJoinCluster = () => {
    stateSocket.emit('serverJoinCluster', stateSocketData, (err) => {
      if (err) {
        setTimeout(emitJoinCluster, RETRY_DELAY);
      }
    });
  };
  emitJoinCluster();
};

connectToClusterStateServer();
