FROM node:20-alpine
WORKDIR /app
# ping diperlukan untuk latihan ICMP; tidak ada tool shell dari input pengguna.
RUN apk add --no-cache iputils
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
RUN mkdir -p /data && chown node:node /data
COPY server.js ./
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
