FROM node:22-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping libcap2-bin wget \
    && setcap cap_net_raw+ep "$(command -v ping)" \
    && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev

COPY . .

RUN chown -R node:node /usr/src/app

USER node

EXPOSE 3001
CMD ["npm", "start"]
