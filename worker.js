var url = require('url');

module.exports.run = function (worker) {
  var AUTH_KEY = worker.options.clusterAuthKey;

  var scServer = worker.scServer;

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
