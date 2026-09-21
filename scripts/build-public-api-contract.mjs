#!/usr/bin/env node

// `build:public-api-contract` — constrói `packages/public-api-contract` e
// atualiza a cópia que cada app consumidor tem em `node_modules`.
//
// Os dois apps declaram o pacote por `file:` com `install-links=true`
// (`apps/bff/.npmrc`, `apps/frontend/.npmrc`): o npm **copia** o diretório do
// pacote no momento do `npm ci`, em vez de criar symlink. A cópia é o que
// garante uma só cópia de Zod por app, mas ela é congelada no instante da
// instalação. Sem este passo, editar `packages/public-api-contract/src` e
// rodar o gate compilaria a fonte e continuaria medindo a cópia velha.
//
// Este script não instala dependência de app nenhum e não toca em lockfile.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIR = path.join(ROOT, "packages", "public-api-contract");
const PACKAGE_NAME = "@atendly-ia/public-api-contract";
const CONSUMERS = ["apps/bff", "apps/frontend"];

// No Windows `npm` é um arquivo .cmd e o Node recusa executá-lo sem shell
// (EINVAL, correção do CVE-2024-27980). Mesmo formato de `scripts/lib/gate.mjs`:
// linha única entregue ao shell, sem argumento solto para o interpretador.
const run = (commandLine, cwd) => {
  const result = spawnSync(commandLine, {
    cwd,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${commandLine} (em ${path.relative(ROOT, cwd)}) saiu com ${result.status}`,
    );
  }
};

export const buildPublicApiContract = () => {
  if (!existsSync(path.join(PACKAGE_DIR, "node_modules", "typescript"))) {
    // Checkout limpo, ou `node_modules` do pacote removido: o build precisa do
    // `tsc` do próprio pacote. `--ignore-scripts` evita que o `prepare` do
    // pacote chame este caminho de novo.
    run("npm ci --ignore-scripts --no-audit --no-fund", PACKAGE_DIR);
  }
  run("npm run build", PACKAGE_DIR);

  const refreshed = [];
  for (const consumer of CONSUMERS) {
    const copy = path.join(ROOT, consumer, "node_modules", ...PACKAGE_NAME.split("/"));
    if (!existsSync(copy)) {
      // App ainda não instalado: o `npm ci` fará a cópia já construída.
      continue;
    }
    const copyDist = path.join(copy, "dist");
    rmSync(copyDist, { recursive: true, force: true });
    cpSync(path.join(PACKAGE_DIR, "dist"), copyDist, { recursive: true });
    cpSync(path.join(PACKAGE_DIR, "src"), path.join(copy, "src"), {
      recursive: true,
    });
    refreshed.push(consumer);
  }
  return refreshed;
};

const refreshed = buildPublicApiContract();
console.log(
  refreshed.length > 0
    ? `public-api-contract construído; cópia atualizada em: ${refreshed.join(", ")}`
    : "public-api-contract construído; nenhuma cópia instalada para atualizar",
);
