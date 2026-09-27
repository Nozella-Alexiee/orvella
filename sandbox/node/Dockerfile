# Orvella sandbox: Node 24 (+ Express, EJS, mysql2 untuk workspace web)
FROM node:24-bookworm-slim
ENV NODE_PATH=/opt/orv/node_modules NPM_CONFIG_UPDATE_NOTIFIER=false HOME=/tmp
RUN mkdir -p /opt/orv && cd /opt/orv && npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund express ejs cors mysql2 \
 && npm cache clean --force \
 && useradd -u 10001 -M -d /tmp orv && mkdir /box
WORKDIR /box
