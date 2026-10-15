#!/usr/bin/env bash
# Orvella · backup & restore database (PostgreSQL, plus database MariaDB milik proyek PHP)
#
#   ./scripts/db.sh backup                 → backups/orvella-YYYYmmdd-HHMM.dump (+ .mysql.sql kalau ada proyek PHP)
#   ./scripts/db.sh restore <file.dump>    → TIMPA database dengan isi backup (minta konfirmasi; --yes untuk skrip)
#   ./scripts/db.sh list                   → daftar backup
#
# Pindah laptop/VPS: salin file .dump (dan .mysql.sql kalau ada) ke mesin baru, jalankan Orvella sekali
# (./dev.sh --setup atau docker compose up -d), lalu ./scripts/db.sh restore <file.dump>.
set -euo pipefail
cd "$(dirname "$0")/.."

DIR=backups
if [ -t 1 ]; then G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; D=$'\e[2m'; N=$'\e[0m'; else G= Y= R= D= N=; fi
env_value() { grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- || true; }
running() { [ -n "$(docker compose ps -q --status running "$1" 2>/dev/null)" ]; }

need_db() {
  running db || { echo "${D}Menyalakan PostgreSQL...${N}"; docker compose up -d --wait db >/dev/null; }
}

migrate() {
  if [ -x backend/.venv/bin/python ] && [ -f backend/.env ]; then (cd backend && .venv/bin/python -m app.migrate)
  elif running app; then docker compose exec -T app python -m app.migrate
  else echo "${Y}Jalankan migrasi sendiri nanti: python -m app.migrate (atau nyalakan app).${N}"; fi
}

backup() {
  need_db
  mkdir -p "$DIR"
  local stamp out
  stamp=$(date +%Y%m%d-%H%M)
  out="$DIR/orvella-$stamp.dump"
  docker compose exec -T db pg_dump -U orvella -d orvella -Fc >"$out.part"
  mv "$out.part" "$out"
  echo "${G}✓${N} PostgreSQL → $out ($(du -h "$out" | cut -f1))"
  if running mysql; then
    local pw dbs
    pw=$(env_value MYSQL_ROOT_PASSWORD)
    dbs=$(docker compose exec -T -e MYSQL_PWD="$pw" mysql mariadb -uroot -N -e "SHOW DATABASES LIKE 'orv\\_%'" | tr '\n' ' ')
    if [ -n "${dbs// /}" ]; then
      # shellcheck disable=SC2086
      docker compose exec -T -e MYSQL_PWD="$pw" mysql mariadb-dump -uroot --single-transaction --databases $dbs >"$DIR/orvella-$stamp.mysql.sql"
      echo "${G}✓${N} MariaDB proyek PHP → $DIR/orvella-$stamp.mysql.sql"
    fi
  fi
}

restore() {
  local file="${1:-}" yes="${2:-}"
  [ -f "$file" ] || { echo "${R}File tidak ada:${N} $file" >&2; echo "Pemakaian: ./scripts/db.sh restore backups/orvella-….dump" >&2; exit 2; }
  if [ "$yes" != "--yes" ]; then
    echo "${Y}Semua data Orvella di database sekarang akan DIGANTI dengan isi $file.${N}"
    read -r -p "Ketik PULIHKAN untuk lanjut: " ok
    [ "$ok" = "PULIHKAN" ] || { echo "Dibatalkan."; exit 1; }
  fi
  need_db
  docker compose exec -T db psql -U orvella -d orvella -q -v ON_ERROR_STOP=1 \
    -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public AUTHORIZATION orvella"
  docker compose exec -T db pg_restore -U orvella -d orvella --no-owner --role=orvella --exit-on-error <"$file"
  echo "${G}✓${N} PostgreSQL dipulihkan dari $file"
  local my="${file%.dump}.mysql.sql"
  if [ -f "$my" ]; then
    docker compose up -d --wait mysql >/dev/null
    docker compose exec -T -e MYSQL_PWD="$(env_value MYSQL_ROOT_PASSWORD)" mysql mariadb -uroot <"$my"
    echo "${G}✓${N} MariaDB proyek PHP dipulihkan dari $my"
  fi
  migrate
}

case "${1:-}" in
  backup) backup ;;
  restore) restore "${2:-}" "${3:-}" ;;
  list) ls -lh "$DIR"/orvella-* 2>/dev/null || echo "Belum ada backup di $DIR/." ;;
  *) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
