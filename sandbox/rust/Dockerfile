# Orvella sandbox: Rust (rustc dari Alpine)
FROM alpine:3.22
ENV HOME=/tmp
RUN apk add --no-cache rust gcc musl-dev \
 && adduser -D -H -u 10001 -h /tmp orv && mkdir /box
WORKDIR /box
