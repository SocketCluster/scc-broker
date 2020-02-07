FROM node:12.15.0-slim
MAINTAINER Jonathan Gros-Dubois

LABEL version="8.0.0"
LABEL description="Docker file for SCC Broker Server"

RUN mkdir -p /usr/src/
WORKDIR /usr/src/
COPY . /usr/src/

RUN npm install .

EXPOSE 8888

CMD ["npm", "start"]
