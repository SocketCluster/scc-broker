# agc-broker
Server for the SC cluster - For horizontal scalability.

### Log levels:
```js
node server.js --cssh '127.0.0.1' -l 0
// or
AGC_STATE_SERVER_HOST='127.0.0.1' AGC_BROKER_SERVER_LOG_LEVEL=0 node server.js
```
 * 3 - log everything
 * 2 - warnings and errors
 * 1 - errors only
 * 0 - log nothing

### Build and deploy to DockerHub

Replace `x.x.x` with the version number.

```
docker build -t socketcluster/agc-broker:vx.x.x .
```

```
docker push socketcluster/agc-broker:vx.x.x
```
