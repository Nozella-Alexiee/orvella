#!/usr/bin/env bash
# Membangun image sandbox untuk runner Orvella (orvella-sbx-<nama>).
#   ./scripts/build-sandbox.sh            # semua image
#   ./scripts/build-sandbox.sh py node    # sebagian saja
set -euo pipefail
cd "$(dirname "$0")/.."
ALL=(py node php c rust go jvm)
names=("$@"); [ ${#names[@]} -eq 0 ] && names=("${ALL[@]}")
for n in "${names[@]}"; do
  [ -f "sandbox/$n/Dockerfile" ] || { echo "Tidak ada sandbox/$n/Dockerfile" >&2; exit 2; }
  echo "==> orvella-sbx-$n"
  docker build --label orvella.sandbox.image="$n" -t "orvella-sbx-$n:latest" "sandbox/$n"
done
docker image ls --filter label=orvella.sandbox.image --format '{{.Repository}}\t{{.Size}}'
