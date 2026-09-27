# Orvella sandbox: PHP 8.4 CLI (+ pdo_mysql, mysqli; pdo_sqlite sudah bawaan)
FROM php:8.4-cli-alpine
ENV HOME=/tmp
RUN docker-php-ext-install pdo_mysql mysqli \
 && adduser -D -H -u 10001 -h /tmp orv && mkdir /box
WORKDIR /box
