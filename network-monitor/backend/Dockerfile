FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

# Wait for DB script (optional, but good practice)
# We will use docker-compose healthchecks instead.

EXPOSE 3001
CMD ["npm", "start"]
