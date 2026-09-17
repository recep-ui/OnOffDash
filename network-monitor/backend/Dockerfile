FROM node:20.18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN apk add --no-cache iputils libcap \
    && setcap cap_net_raw+ep $(which ping || echo /bin/ping)
RUN npm ci --omit=dev

COPY . .

RUN chown -R node:node /usr/src/app

USER node

EXPOSE 3001
CMD ["npm", "start"]
