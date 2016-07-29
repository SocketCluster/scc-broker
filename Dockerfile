FROM node:6.3.0-slim
MAINTAINER Jonathan Gros-Dubois

LABEL version="1.1.0"
LABEL description="Docker file for SC Cluster Broker Server"

RUN mkdir -p /usr/src/
WORKDIR /usr/src/
COPY . /usr/src/

RUN npm install .

EXPOSE 8888

CMD ["npm", "start"]
