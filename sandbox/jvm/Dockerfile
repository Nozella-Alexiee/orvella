# Orvella sandbox: Java 21 (Temurin) + Kotlin
FROM eclipse-temurin:21-jdk-alpine
ARG KOTLIN=2.1.21
ENV HOME=/tmp
RUN apk add --no-cache bash \
 && wget -q "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN}/kotlin-compiler-${KOTLIN}.zip" -O /tmp/k.zip \
 && unzip -q /tmp/k.zip -d /opt && rm /tmp/k.zip \
 && ln -s /opt/kotlinc/bin/kotlinc /usr/local/bin/kotlinc \
 && adduser -D -H -u 10001 -h /tmp orv && mkdir /box
WORKDIR /box
