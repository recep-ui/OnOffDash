FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN apk update && apk upgrade --no-cache \
    && apk add --no-cache iputils libcap \
    && setcap cap_net_raw+ep $(which ping || echo /bin/ping) \
    && npm ci --omit=dev \
    && rm -rf /opt/yarn* /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

COPY . .

RUN chown -R node:node /usr/src/app

USER node

EXPOSE 3001
CMD ["node", "server.js"]
