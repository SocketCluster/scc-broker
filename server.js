var SocketCluster = require('../socketcluster');
var scClient = require('../socketcluster-client');
var argv = require('minimist')(process.argv.slice(2));
var packageVersion = require('./package.json').version;
var fs = require('fs');

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
var RECONNECT_RANDOMNESS = 1000;


/*
*
*  SOCKETCLUSTER_SECURE_COM : force https on the internal stack
*  SOCKETCLUSTER_BROKER_SSL_KEY : ssl key for the broker http server
*  SOCKETCLUSTER_BROKER_SSL_CERT : ssl cert for the broker http server
*  SOCKETCLUSTER_BROKER_SSL_REJECT_UNAUTHORIZED : this is for the "socket-cluster-client" when connecting to the state. In case of self sign certificates.
*
*/
var SOCKETCLUSTER_SECURE_COM = argv.sec || process.env.SOCKETCLUSTER_SECURE_COM || false;
var SOCKETCLUSTER_BROKER_SSL_KEY = argv.sslk || process.env.SOCKETCLUSTER_BROKER_SSL_KEY || false;
var SOCKETCLUSTER_BROKER_SSL_CERT = argv.sslc || process.env.SOCKETCLUSTER_BROKER_SSL_CERT || false;
var SOCKETCLUSTER_BROKER_SSL_REJECT_UNAUTHORIZED = argv.sslru || process.env.SOCKETCLUSTER_BROKER_SSL_REJECT_UNAUTHORIZED || false;


/**
 * Log levels:
 * 3 - log everything
 * 2 - warnings and errors
 * 1 - errors only
 * 0 - log nothing
 */
var LOG_LEVEL, SOCKETCLUSTER_OPTIONS, SOCKETSTATE_OPTIONS;
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
  wsEngine: 'ws', //process.env.SOCKETCLUSTER_WS_ENGINE || 'sc-uws',
  appName: argv.n || process.env.SOCKETCLUSTER_APP_NAME || null,
  workerController: argv.wc || process.env.SOCKETCLUSTER_WORKER_CONTROLLER || __dirname + '/worker.js',
  brokerController: argv.bc || process.env.SOCKETCLUSTER_BROKER_CONTROLLER || __dirname + '/broker.js',
  socketChannelLimit: null,
  crashWorkerOnError: argv['auto-reboot'] != false,
  connectTimeout: BROKER_SERVER_CONNECT_TIMEOUT,
  ackTimeout: BROKER_SERVER_ACK_TIMEOUT,
  messageLogLevel: LOG_LEVEL,
  clusterAuthKey: SCC_AUTH_KEY,
  protocol : 'http'
};

SOCKETSTATE_OPTIONS = {
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
  secure : false,
  rejectUnauthorized : false
};

if(typeof SOCKETCLUSTER_SECURE_COM === "string" && SOCKETCLUSTER_SECURE_COM === "true") {
  options.protocol = 'https';
  options.protocolOptions = {
    key: (SOCKETCLUSTER_BROKER_SSL_KEY !== "false") ? fs.readFileSync(SOCKETCLUSTER_BROKER_SSL_KEY) : void 0,
    cert: (SOCKETCLUSTER_BROKER_SSL_CERT !== "false") ? fs.readFileSync(SOCKETCLUSTER_BROKER_SSL_CERT) : void 0,
  }
  SOCKETSTATE_OPTIONS.secure = true;
  SOCKETSTATE_OPTIONS.rejectUnauthorized = SOCKETCLUSTER_BROKER_SSL_REJECT_UNAUTHORIZED;
}

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
    ...SOCKETSTATE_OPTIONS
    ,
    query: {
      authKey: SCC_AUTH_KEY,
      instancePort: socketCluster.options.port,
      instanceType: 'scc-broker',
      version: packageVersion
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
    instanceSecure: SECURE_COM
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
