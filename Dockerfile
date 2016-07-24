FROM node:6.3.0-slim
MAINTAINER Jonathan Gros-Dubois

LABEL version="1.0.0"
LABEL description="Docker file for SC Cluster Broker Server"

RUN mkdir -p /usr/src/
WORKDIR /usr/src/
COPY . /usr/src/

RUN npm install .

ENV SOCKETCLUSTER_WS_ENGINE=ws

EXPOSE 8888

CMD ["npm", "start"]
