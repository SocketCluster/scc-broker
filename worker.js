var SCWorker = require('socketcluster/scworker');
var url = require('url');
var express = require('express');
var healthChecker = require('sc-framework-health-check');

class Worker extends SCWorker {
  run() {
    var AUTH_KEY = this.options.clusterAuthKey;

    var httpServer = this.httpServer;
    var scServer = this.scServer;

    var app = express();

    // Add GET /health-check express route
    healthChecker.attach(this, app);

    httpServer.on('request', app);

    if (AUTH_KEY) {
      scServer.addMiddleware(scServer.MIDDLEWARE_HANDSHAKE_WS, (req, next) => {
        var urlParts = url.parse(req.url, true);
        if (urlParts.query && urlParts.query.authKey == AUTH_KEY) {
          next();
        } else {
          var err = new Error('Cannot connect to the cluster broker server without providing a valid authKey as a URL query argument.');
          err.name = 'BadClusterAuthError';
          next(err);
        }
      });
    }

    if (this.options.messageLogLevel > 1) {
      scServer.addMiddleware(scServer.MIDDLEWARE_SUBSCRIBE, (req, next) => {
        console.log(`${req.socket.remoteAddress} subscribed to ${req.channel}`);
        next();
      });
    }
    if (this.options.messageLogLevel > 2) {
      scServer.addMiddleware(scServer.MIDDLEWARE_PUBLISH_IN, (req, next) => {
        console.log(`${req.socket.remoteAddress} published to ${req.channel}`);
        next();
      });
    }
  }
}

new Worker();
