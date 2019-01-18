const http = require('http');
const eetase = require('eetase');
const asyngularServer = require('asyngular-server');
const Action = require('asyngular-server/action');
const asyngularClient = require('asyngular-client');
const uuid = require('uuid');
const packageVersion = require('./package.json').version;
const url = require('url');
const express = require('express');

const DEFAULT_PORT = 8888;
const PORT = Number(process.env.AGC_BROKER_SERVER_PORT) || DEFAULT_PORT;
const AGC_INSTANCE_ID = uuid.v4();
const AGC_STATE_SERVER_HOST = process.env.AGC_STATE_SERVER_HOST;
const AGC_STATE_SERVER_PORT = Number(process.env.AGC_STATE_SERVER_PORT) || 7777;
const AGC_INSTANCE_IP = process.env.AGC_INSTANCE_IP || null;
const AGC_INSTANCE_IP_FAMILY = process.env.AGC_INSTANCE_IP_FAMILY || 'IPv4';
const AGC_AUTH_KEY = process.env.AGC_AUTH_KEY || null;
const RETRY_DELAY = Number(process.env.AGC_BROKER_SERVER_RETRY_DELAY) || 2000;
const STATE_SERVER_CONNECT_TIMEOUT = Number(process.env.AGC_STATE_SERVER_CONNECT_TIMEOUT) || 3000;
const STATE_SERVER_ACK_TIMEOUT = Number(process.env.AGC_STATE_SERVER_ACK_TIMEOUT) || 2000;
const BROKER_SERVER_CONNECT_TIMEOUT = Number(process.env.AGC_BROKER_SERVER_CONNECT_TIMEOUT) || 10000;
const BROKER_SERVER_ACK_TIMEOUT = Number(process.env.AGC_BROKER_SERVER_ACK_TIMEOUT) || 10000;
const BROKER_SERVER_WS_ENGINE = process.env.AGC_BROKER_SERVER_WS_ENGINE || 'ws';
const SECURE = !!process.env.AGC_BROKER_SERVER_SECURE;
const RECONNECT_RANDOMNESS = 1000;

/**
 * Log levels:
 * 3 - log everything
 * 2 - warnings and errors
 * 1 - errors only
 * 0 - log nothing
 */
let LOG_LEVEL;
if (typeof process.env.AGC_BROKER_SERVER_LOG_LEVEL !== 'undefined') {
  LOG_LEVEL = Number(process.env.AGC_BROKER_SERVER_LOG_LEVEL);
} else {
  LOG_LEVEL = 1;
}

if (!AGC_STATE_SERVER_HOST) {
  throw new Error(
    'No AGC_STATE_SERVER_HOST was specified - This should be provided ' +
    'through the AGC_STATE_SERVER_HOST environment variable'
  );
}

let agOptions = {
  wsEngine: BROKER_SERVER_WS_ENGINE,
  socketChannelLimit: null,
  connectTimeout: BROKER_SERVER_CONNECT_TIMEOUT,
  ackTimeout: BROKER_SERVER_ACK_TIMEOUT
};

if (process.env.ASYNGULAR_OPTIONS) {
  Object.assign(agOptions, JSON.parse(process.env.ASYNGULAR_OPTIONS));
}

let httpServer = eetase(http.createServer());
let agServer = asyngularServer.attach(httpServer, agOptions);

if (AGC_AUTH_KEY) {
  agServer.setMiddleware(agServer.MIDDLEWARE_HANDSHAKE, async (middlewareStream) => {
    for await (let action of middlewareStream) {
      if (action.type === Action.HANDSHAKE_WS) {
        let urlParts = url.parse(action.request.url, true);
        if (!urlParts.query || urlParts.query.authKey !== AGC_AUTH_KEY) {
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
    hostname: AGC_STATE_SERVER_HOST,
    port: AGC_STATE_SERVER_PORT,
    connectTimeout: STATE_SERVER_CONNECT_TIMEOUT,
    ackTimeout: STATE_SERVER_ACK_TIMEOUT,
    autoReconnectOptions: {
      initialDelay: RETRY_DELAY,
      randomness: RECONNECT_RANDOMNESS,
      multiplier: 1,
      maxDelay: RETRY_DELAY + RECONNECT_RANDOMNESS
    },
    query: {
      authKey: AGC_AUTH_KEY,
      instancePort: PORT,
      instanceType: 'agc-broker',
      version: packageVersion
    }
  };

  let stateSocket = asyngularClient.create(agStateSocketOptions);

  (async () => {
    for await (let {error} of stateSocket.listener('error')) {
      if (LOG_LEVEL >= 1) {
        console.error(error);
      }
    }
  })();

  let stateSocketData = {
    instanceId: AGC_INSTANCE_ID,
    instanceIp: AGC_INSTANCE_IP,
    instanceIpFamily: AGC_INSTANCE_IP_FAMILY,
    instanceSecure: SECURE
  };

  let emitJoinCluster = async () => {
    try {
      await stateSocket.invoke('agcBrokerJoinCluster', stateSocketData);
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
    console.log(`The agc-broker instance is listening on port ${PORT}`);
  }
  connectToClusterStateServer();
})();

httpServer.listen(PORT);
