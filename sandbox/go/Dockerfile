# Orvella sandbox: Go. /gocache diisi dulu supaya kompilasi pertama tidak lambat;
# runner memasang volume orvella_gocache di sana (isinya disalin dari image saat volume masih kosong).
FROM golang:1.25-alpine
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GOCACHE=/gocache GOPATH=/tmp/go HOME=/tmp
RUN mkdir -p /gocache /tmp/warm && cd /tmp/warm \
 && printf 'package main\n\nimport (\n\t"bufio"\n\t"errors"\n\t"fmt"\n\t"math"\n\t"math/rand"\n\t"os"\n\t"sort"\n\t"strconv"\n\t"strings"\n\t"time"\n\t"unicode"\n)\n\nvar _ = []any{bufio.NewReader, errors.New, math.Sqrt, rand.Intn, os.Exit, sort.Ints, strconv.Itoa, strings.Split, time.Now, unicode.IsDigit}\n\nfunc main() { fmt.Println("ok") }\n' > main.go \
 && go build -o /tmp/warm/x main.go && cd / && rm -rf /tmp/warm /tmp/go /tmp/.config \
 && chown -R 10001:10001 /gocache \
 && adduser -D -H -u 10001 -h /tmp orv && mkdir /box
WORKDIR /box
