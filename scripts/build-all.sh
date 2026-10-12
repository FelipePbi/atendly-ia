#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/apps/scheduling-service"
npm run build

cd "$ROOT_DIR/apps/ai-orchestrator"
npm run build

# Contrato público compartilhado: precisa estar construído, e com a cópia de
# apps/*/node_modules atualizada, antes dos builds que o consomem.
node "$ROOT_DIR/scripts/build-public-api-contract.mjs"

cd "$ROOT_DIR/apps/bff"
npm run build

cd "$ROOT_DIR/apps/frontend"
npm run build

cd "$ROOT_DIR/apps/evolution-go"
go test ./...
