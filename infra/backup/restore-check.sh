#!/usr/bin/env bash
set -euo pipefail
d=$(ls -d /var/backups/avenly/2* | tail -1)
docker run -d --rm --name restore-check -e POSTGRES_HOST_AUTH_METHOD=trust pgvector/pgvector:0.8.6-pg17-bookworm >/dev/null
trap 'docker rm -f restore-check >/dev/null 2>&1 || true' EXIT
for i in $(seq 60); do docker exec restore-check pg_isready -U postgres -q 2>/dev/null && break; sleep 1; done
sleep 3
docker exec -i restore-check psql -U postgres -q -o /dev/null < "$d/globals.sql" 2>&1 | grep -v 'already exists' || true
for db in avenly_bff avenly_ai avenly_scheduling evogo_auth evogo_users; do
  docker exec restore-check psql -U postgres -qc "create database $db"
  docker exec -i restore-check pg_restore -U postgres -d "$db" --exit-on-error < "$d/$db.dump"
  n=$(docker exec restore-check psql -U postgres -d "$db" -Atc "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")
  echo "$db: $n tabelas restauradas"
done
echo "restauração ok a partir de $d"
