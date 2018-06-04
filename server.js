var SocketCluster = require('socketcluster');
var scClient = require('socketcluster-client');
var argv = require('minimist')(process.argv.slice(2));

var DEFAULT_PORT = 8888;
var SCC_STATE_SERVER_HOST = argv.cssh || process.env.SCC_STATE_SERVER_HOST;
var SCC_STATE_SERVER_PORT = Number(process.env.SCC_STATE_SERVER_PORT) || 7777;
var SCC_INSTANCE_IP = process.env.SCC_INSTANCE_IP || null;
var SCC_INSTANCE_IP_FAMILY = process.env.SCC_INSTANCE_IP_FAMILY || 'IPv4';
var SCC_AUTH_KEY = process.env.SCC_AUTH_KEY || null;
var RETRY_DELAY = Number(argv.r) || Number(process.env.SCC_BROKER_SERVER_RETRY_DELAY) || 2000;
var STATE_SERVER_CONNECT_TIMEOUT = Number(process.env.SCC_STATE_SERVER_CONNECT_TIMEOUT) || 3000;
var STATE_SERVER_ACK_TIMEOUT = Number(process.env.SCC_STATE_SERVER_ACK_TIMEOUT) || 2000;
var BROKER_SERVER_CONNECT_TIMEOUT = Number(process.env.SCC_BROKER_SERVER_CONNECT_TIMEOUT) || 10000;
var BROKER_SERVER_ACK_TIMEOUT = Number(process.env.SCC_BROKER_SERVER_ACK_TIMEOUT) || 10000;
var SECURE = !!argv.s || !!process.env.SCC_BROKER_SERVER_SECURE;
var RECONNECT_RANDOMNESS = 1000;
/**
 * Log levels:
 * 3 - log everything
 * 2 - warnings and errors
 * 1 - errors only
 * 0 - log nothing
 */
var LOG_LEVEL;
if (typeof argv.l !== 'undefined') {
  LOG_LEVEL = Number(argv.l);
} else if (typeof process.env.SCC_BROKER_SERVER_LOG_LEVEL !== 'undefined') {
  LOG_LEVEL = Number(process.env.SCC_BROKER_SERVER_LOG_LEVEL);
} else {
  LOG_LEVEL = 1;
}

if (!SCC_STATE_SERVER_HOST) {
  throw new Error('No SCC_STATE_SERVER_HOST was specified - This should be provided ' +
    'either through the SCC_STATE_SERVER_HOST environment variable or ' +
    'by passing a --cssh=hostname argument to the CLI');
}

var options = {
  workers: Number(argv.w) || Number(process.env.SOCKETCLUSTER_WORKERS) || 1,
  brokers: Number(argv.b) || Number(process.env.SOCKETCLUSTER_BROKERS) || 1,
  port: Number(argv.p) || Number(process.env.SCC_BROKER_SERVER_PORT) || DEFAULT_PORT,
  wsEngine: process.env.SOCKETCLUSTER_WS_ENGINE || 'sc-uws',
  appName: argv.n || process.env.SOCKETCLUSTER_APP_NAME || null,
  workerController: argv.wc || process.env.SOCKETCLUSTER_WORKER_CONTROLLER || __dirname + '/worker.js',
  brokerController: argv.bc || process.env.SOCKETCLUSTER_BROKER_CONTROLLER || __dirname + '/broker.js',
  socketChannelLimit: null,
  crashWorkerOnError: argv['auto-reboot'] != false,
  connectTimeout: BROKER_SERVER_CONNECT_TIMEOUT,
  ackTimeout: BROKER_SERVER_ACK_TIMEOUT,
  messageLogLevel: LOG_LEVEL,
  clusterAuthKey: SCC_AUTH_KEY
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
    hostname: SCC_STATE_SERVER_HOST,
    port: SCC_STATE_SERVER_PORT,
    connectTimeout: STATE_SERVER_CONNECT_TIMEOUT,
    ackTimeout: STATE_SERVER_ACK_TIMEOUT,
    autoReconnectOptions: {
      initialDelay: RETRY_DELAY,
      randomness: RECONNECT_RANDOMNESS,
      multiplier: 1,
      maxDelay: RETRY_DELAY + RECONNECT_RANDOMNESS
    },
    query: {
      authKey: SCC_AUTH_KEY
    }
  };

  var stateSocket = scClient.connect(scStateSocketOptions);

  stateSocket.on('error', (err) => {
    if (LOG_LEVEL > 0) {
      console.error(err);
    }
  });

  var stateSocketData = {
    instanceId: socketCluster.options.instanceId,
    instanceIp: SCC_INSTANCE_IP,
    instanceIpFamily: SCC_INSTANCE_IP_FAMILY,
    instancePort: socketCluster.options.port,
    instanceSecure: SECURE
  };

  var emitJoinCluster = () => {
    stateSocket.emit('sccBrokerJoinCluster', stateSocketData, (err) => {
      if (err) {
        setTimeout(emitJoinCluster, RETRY_DELAY);
      }
    });
  };

  stateSocket.on('connect', emitJoinCluster);
};

connectToClusterStateServer();
