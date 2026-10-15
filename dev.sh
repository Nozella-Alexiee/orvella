#!/usr/bin/env bash
# Orvella · development di Linux
#
# PostgreSQL, runner kode, proxy pratinjau, dan MariaDB jalan di Docker (docker-compose.dev.yml membuka
# PostgreSQL dan runner ke localhost). API (uvicorn --reload, :8000) dan Vite (:5173) jalan di host.
#
#   ./dev.sh            jalankan semuanya, lalu buka http://localhost:5173 (Ctrl+C mematikan API + Vite)
#   ./dev.sh --setup    sekali di awal: .env, venv backend, paket npm, image sandbox, migrasi + data demo
#   ./dev.sh --reseed   hapus isi database lalu isi ulang data demo
#   ./dev.sh --stop     matikan container development (data tetap ada)
set -euo pipefail
cd "$(dirname "$0")"

export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
PY=backend/.venv/bin/python
if [ -t 1 ]; then G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; D=$'\e[2m'; N=$'\e[0m'; else G= Y= R= D= N=; fi

compose() { docker compose -f docker-compose.yml -f docker-compose.dev.yml "$@"; }
secret() { LC_ALL=C tr -dc 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' </dev/urandom | head -c "$1"; }
env_value() { grep -E "^$1=" .env | head -n1 | cut -d= -f2- || true; }

root_env() {
  if [ ! -f .env ]; then
    umask 077
    cat >.env <<EOF
# Dibuat otomatis oleh dev.sh. Jangan dibagikan.
POSTGRES_PASSWORD=$(secret 24)
SECRET_KEY=$(secret 48)
DEMO_PASSWORD=orvella123
APP_PORT=8000
PREVIEW_PORT=8301
TUNNEL_PROTOCOL=auto
COOKIE_SECURE=true
EOF
    echo "${D}.env dibuat dengan password acak.${N}"
  fi
  for key in RUNNER_TOKEN PREVIEW_SECRET MYSQL_ROOT_PASSWORD; do
    grep -q "^$key=" .env || echo "$key=$(secret 40)" >>.env
  done
}

backend_env() {
  [ -f backend/.env ] && return
  umask 077
  cat >backend/.env <<EOF
# Setelan development lokal (jangan di-commit). Dibuat dari .env root oleh dev.sh.
ORVELLA_DATABASE_URL=postgresql+psycopg://orvella:$(env_value POSTGRES_PASSWORD)@127.0.0.1:${DEV_DB_PORT:-5432}/orvella
ORVELLA_SECRET_KEY=$(env_value SECRET_KEY)
ORVELLA_COOKIE_SECURE=false
ORVELLA_RUNNER_URL=http://127.0.0.1:${DEV_RUNNER_PORT:-8081}
ORVELLA_RUNNER_TOKEN=$(env_value RUNNER_TOKEN)
ORVELLA_PREVIEW_SECRET=$(env_value PREVIEW_SECRET)
ORVELLA_PREVIEW_PORT=$(env_value PREVIEW_PORT)
EOF
  echo "${D}backend/.env dibuat dari .env root.${N}"
}

setup() {
  root_env
  backend_env
  if [ ! -x "$PY" ]; then
    if command -v uv >/dev/null; then uv venv --python 3.14 --seed backend/.venv; else python3 -m venv backend/.venv; fi
  fi
  if command -v uv >/dev/null; then uv pip install --python "$PY" -q -r backend/requirements.txt
  else "$PY" -m pip install -q -r backend/requirements.txt; fi
  (cd frontend && npm ci --no-audit --no-fund)
  local missing=0
  for n in py node php c rust go jvm; do docker image inspect "orvella-sbx-$n:latest" >/dev/null 2>&1 || missing=1; done
  if [ "$missing" = 1 ]; then echo "${D}Membangun image sandbox bahasa (sekali saja, 5-10 menit)...${N}"; ./scripts/build-sandbox.sh; fi
  compose build runner preview
}

services_up() {
  compose up -d --wait db runner preview mysql
  (cd backend && ../"$PY" -m app.migrate && ../"$PY" -m app.seed)
}

case "${1:-}" in
  --setup) setup; services_up; echo "${G}Siap.${N} Jalankan ./dev.sh"; exit 0 ;;
  --reseed) services_up; (cd backend && ../"$PY" -m app.seed --reset); exit 0 ;;
  --stop) compose stop db runner preview mysql; exit 0 ;;
  "") ;;
  *) echo "Pemakaian: ./dev.sh [--setup|--reseed|--stop]" >&2; exit 2 ;;
esac

[ -x "$PY" ] && [ -d frontend/node_modules ] || { echo "${Y}Belum di-setup.${N} Jalankan ./dev.sh --setup dulu." >&2; exit 1; }
services_up

(cd backend && exec ../"$PY" -m uvicorn app.main:app --reload --port 8000) &
API=$!
trap 'kill $API 2>/dev/null || true' EXIT INT TERM
echo "${G}Orvella dev:${N} http://localhost:5173  ${D}(API :8000, pratinjau :$(env_value PREVIEW_PORT))${N}"
cd frontend && npx vite --port 5173
