#!/usr/bin/env bash
# Backup diário dos bancos do Avenly (Postgres do compose) e do banco do Coolify.
# Cada banco vira um dump em formato custom (pg_restore), mais os roles (globals).
set -euo pipefail

PROJECT=wxictoixqkxp3uh2h9dgogmk
DEST=/var/backups/avenly
KEEP_DAYS=14
BUCKET=avenly-db-backups

stamp=$(date -u +%Y%m%dT%H%MZ)
dir="$DEST/$stamp"
tmp="$DEST/.tmp-$stamp"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp"
chmod 700 "$DEST"

app=$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter label=com.docker.compose.service=postgres)
[ "$(printf '%s\n' "$app" | grep -c .)" = 1 ] || { echo "postgres do app: esperado 1 container, achei '$app'" >&2; exit 1; }

docker exec "$app" sh -c 'pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$tmp/globals.sql"
for db in $(docker exec "$app" sh -c 'psql -U "$POSTGRES_USER" -Atc "select datname from pg_database where not datistemplate and datname <> '"'postgres'"'"'); do
  docker exec "$app" sh -c "pg_dump -U \"\$POSTGRES_USER\" -Fc -Z 6 \"$db\"" > "$tmp/$db.dump"
  docker exec -i "$app" pg_restore --list < "$tmp/$db.dump" > /dev/null
done

docker exec coolify-db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc -Z 6 "$POSTGRES_DB"' > "$tmp/coolify.dump"
docker exec -i coolify-db pg_restore --list < "$tmp/coolify.dump" > /dev/null

(cd "$tmp" && sha256sum -- * > SHA256SUMS)
mv "$tmp" "$dir"
chmod -R go= "$dir"

find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "backup ok: $dir ($(du -sh "$dir" | cut -f1))"

# Cópia fora da VM, no Object Storage da Oracle. A VM se autentica pelo instance
# principal e só pode criar objetos novos (--no-overwrite): não apaga nem
# sobrescreve. A regra de ciclo de vida do bucket apaga o que passa de 30 dias.
# SHA256SUMS vai por último: a presença dele marca a cópia como completa.
for f in $(cd "$dir" && ls | grep -vx SHA256SUMS) SHA256SUMS; do
  oci os object put --auth instance_principal --bucket-name "$BUCKET" \
    --name "$stamp/$f" --file "$dir/$f" --no-overwrite > /dev/null
done
echo "cópia ok: oci://$BUCKET/$stamp/"
