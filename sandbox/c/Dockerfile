# Orvella sandbox: C & C++ (GCC 14)
FROM alpine:3.22
ENV HOME=/tmp
RUN apk add --no-cache build-base \
 && adduser -D -H -u 10001 -h /tmp orv && mkdir /box
WORKDIR /box
