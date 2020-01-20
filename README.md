# scc-broker
Server for the SC cluster - For SocketCluster horizontal scalability.

### Usage

```js
SCC_STATE_SERVER_HOST='127.0.0.1' SCC_BROKER_SERVER_LOG_LEVEL=0 node server.js
```

### Log levels

 * 3 - log everything
 * 2 - warnings and errors
 * 1 - errors only
 * 0 - log nothing

### Build and deploy to DockerHub

Replace `x.x.x` with the version number.

```
docker build -t socketcluster/scc-broker:vx.x.x .
```

```
docker push socketcluster/scc-broker:vx.x.x
```
