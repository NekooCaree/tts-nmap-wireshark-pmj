FROM nginx:1.28-alpine
USER root
RUN apk add --no-cache openssl
COPY entrypoint.sh nginx.conf /opt/gateway/
COPY index.html /opt/gateway/index.html
USER nginx
ENTRYPOINT ["/bin/sh", "/opt/gateway/entrypoint.sh"]
