#!/bin/sh
# Roda uma única vez, na criação do volume do Postgres de produção
# (docker-entrypoint-initdb.d). Cada serviço recebe usuário e banco próprios:
# nenhum serviço lê o banco do outro.
set -eu

create_db() {
  role="$1"
  password="$2"
  database="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -v role="$role" -v password="$password" -v database="$database" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')\gexec
SQL
}

create_db bff "$BFF_DB_PASSWORD" avenly_bff
create_db ai_orchestrator "$AI_DB_PASSWORD" avenly_ai
create_db scheduling "$SCHEDULING_DB_PASSWORD" avenly_scheduling
create_db evolution "$EVOLUTION_DB_PASSWORD" evogo_auth
create_db evolution "$EVOLUTION_DB_PASSWORD" evogo_users

# pgvector exige superusuário para CREATE EXTENSION; a migração da IA usa
# IF NOT EXISTS e passa a ser no-op.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname avenly_ai \
  -c 'CREATE EXTENSION IF NOT EXISTS vector'
