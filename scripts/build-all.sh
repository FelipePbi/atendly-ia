#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/packages/contracts"
npm run build

cd "$ROOT_DIR/apps/ai-orchestrator"
npm run build

cd "$ROOT_DIR/apps/bff"
npm run build

cd "$ROOT_DIR/apps/frontend"
npm run build

cd "$ROOT_DIR/apps/health-worker"
npm run check

cd "$ROOT_DIR/apps/evolution-go"
go test ./...
