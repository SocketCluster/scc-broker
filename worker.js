module.exports.run = function (worker) {
  var scServer = worker.scServer;

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
