const http = require('http');
const eetase = require('eetase');
const socketClusterServer = require('socketcluster-server');
const Action = require('socketcluster-server/action');
const socketClusterClient = require('socketcluster-client');
const uuid = require('uuid');
const packageVersion = require('./package.json').version;
const url = require('url');
const express = require('express');

const DEFAULT_PORT = 8888;
const PORT = Number(process.env.SCC_BROKER_SERVER_PORT) || DEFAULT_PORT;
const SCC_INSTANCE_ID = uuid.v4();
const SCC_STATE_SERVER_HOST = process.env.SCC_STATE_SERVER_HOST;
const SCC_STATE_SERVER_PORT = Number(process.env.SCC_STATE_SERVER_PORT) || 7777;
const SCC_INSTANCE_IP = process.env.SCC_INSTANCE_IP || null;
const SCC_INSTANCE_IP_FAMILY = process.env.SCC_INSTANCE_IP_FAMILY || 'IPv4';
const SCC_AUTH_KEY = process.env.SCC_AUTH_KEY || null;
const RETRY_DELAY = Number(process.env.SCC_BROKER_SERVER_RETRY_DELAY) || 2000;
const STATE_SERVER_CONNECT_TIMEOUT = Number(process.env.SCC_STATE_SERVER_CONNECT_TIMEOUT) || 3000;
const STATE_SERVER_ACK_TIMEOUT = Number(process.env.SCC_STATE_SERVER_ACK_TIMEOUT) || 2000;
const BROKER_SERVER_CONNECT_TIMEOUT = Number(process.env.SCC_BROKER_SERVER_CONNECT_TIMEOUT) || 10000;
const BROKER_SERVER_ACK_TIMEOUT = Number(process.env.SCC_BROKER_SERVER_ACK_TIMEOUT) || 10000;
const BROKER_SERVER_WS_ENGINE = process.env.SCC_BROKER_SERVER_WS_ENGINE || 'ws';
const SECURE = !!process.env.SCC_BROKER_SERVER_SECURE;
const RECONNECT_RANDOMNESS = 1000;

/**
 * Log levels:
 * 3 - log everything
 * 2 - warnings and errors
 * 1 - errors only
 * 0 - log nothing
 */
let LOG_LEVEL;
if (typeof process.env.SCC_BROKER_SERVER_LOG_LEVEL !== 'undefined') {
  LOG_LEVEL = Number(process.env.SCC_BROKER_SERVER_LOG_LEVEL);
} else {
  LOG_LEVEL = 1;
}

if (!SCC_STATE_SERVER_HOST) {
  throw new Error(
    'No SCC_STATE_SERVER_HOST was specified - This should be provided ' +
    'through the SCC_STATE_SERVER_HOST environment variable'
  );
}

let agOptions = {
  wsEngine: BROKER_SERVER_WS_ENGINE,
  socketChannelLimit: null,
  connectTimeout: BROKER_SERVER_CONNECT_TIMEOUT,
  ackTimeout: BROKER_SERVER_ACK_TIMEOUT
};

if (process.env.SOCKETCLUSTER_OPTIONS) {
  Object.assign(agOptions, JSON.parse(process.env.SOCKETCLUSTER_OPTIONS));
}

let httpServer = eetase(http.createServer());
let agServer = socketClusterServer.attach(httpServer, agOptions);

if (SCC_AUTH_KEY) {
  agServer.setMiddleware(agServer.MIDDLEWARE_HANDSHAKE, async (middlewareStream) => {
    for await (let action of middlewareStream) {
      if (action.type === Action.HANDSHAKE_WS) {
        let urlParts = url.parse(action.request.url, true);
        if (!urlParts.query || urlParts.query.authKey !== SCC_AUTH_KEY) {
          let err = new Error('Cannot connect to the cluster broker server without providing a valid authKey as a URL query argument.');
          err.name = 'BadClusterAuthError';
          action.block(err);

          continue;
        }
      }

      action.allow();
    }
  });
}

if (LOG_LEVEL >= 2) {
  agServer.setMiddleware(agServer.MIDDLEWARE_INBOUND, async (middlewareStream) => {
    for await (let action of middlewareStream) {
      if (action.type === Action.SUBSCRIBE) {
        console.log(`${action.socket.remoteAddress} subscribed to ${action.channel}`);
      } else if (action.type === Action.PUBLISH_IN) {
        if (LOG_LEVEL >= 3) {
          console.log(`${action.socket.remoteAddress} published to ${action.channel}`);
        }
      }

      action.allow();
    }
  });
}

let expressApp = express();

// Add GET /health-check express route
expressApp.get('/health-check', (req, res) => {
  res.status(200).send('OK');
});

// HTTP request handling loop.
(async () => {
  for await (let requestData of httpServer.listener('request')) {
    expressApp.apply(null, requestData);
  }
})();

let connectToClusterStateServer = function () {
  let agStateSocketOptions = {
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
      authKey: SCC_AUTH_KEY,
      instancePort: PORT,
      instanceType: 'scc-broker',
      version: packageVersion
    }
  };

  let stateSocket = socketClusterClient.create(agStateSocketOptions);

  (async () => {
    for await (let {error} of stateSocket.listener('error')) {
      if (LOG_LEVEL >= 1) {
        console.error(error);
      }
    }
  })();

  let stateSocketData = {
    instanceId: SCC_INSTANCE_ID,
    instanceIp: SCC_INSTANCE_IP,
    instanceIpFamily: SCC_INSTANCE_IP_FAMILY,
    instanceSecure: SECURE
  };

  let emitJoinCluster = async () => {
    try {
      await stateSocket.invoke('sccBrokerJoinCluster', stateSocketData);
    } catch (err) {
      setTimeout(emitJoinCluster, RETRY_DELAY);
    }
  };

  (async () => {
    for await (let event of stateSocket.listener('connect')) {
      emitJoinCluster();
    }
  })();
};

(async () => {
  await httpServer.listener('listening').once();
  if (LOG_LEVEL >= 3) {
    console.log(`The scc-broker instance is listening on port ${PORT}`);
  }
  connectToClusterStateServer();
})();

httpServer.listen(PORT);
