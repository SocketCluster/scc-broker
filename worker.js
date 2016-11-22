var url = require('url');
var express = require('express');
var healthChecker = require('sc-framework-health-check');

module.exports.run = function (worker) {
  var AUTH_KEY = worker.options.clusterAuthKey;

  var httpServer = worker.httpServer;
  var scServer = worker.scServer;

  var app = express();

  // Add GET /health-check express route
  healthChecker.attach(worker, app);

  httpServer.on('request', app);

  if (AUTH_KEY) {
    scServer.addMiddleware(scServer.MIDDLEWARE_HANDSHAKE, (req, next) => {
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

  if (worker.options.messageLogLevel > 1) {
    scServer.addMiddleware(scServer.MIDDLEWARE_SUBSCRIBE, function (req, next) {
      console.log(`${req.socket.remoteAddress} subscribed to ${req.channel}`);
      next();
    });
  }
  if (worker.options.messageLogLevel > 2) {
    scServer.addMiddleware(scServer.MIDDLEWARE_PUBLISH_IN, function (req, next) {
      console.log(`${req.socket.remoteAddress} published to ${req.channel}`);
      next();
    });
  }
};
