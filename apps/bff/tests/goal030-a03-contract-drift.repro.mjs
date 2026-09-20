#!/usr/bin/env node

/**
 * Reprodução do achado A-03 da auditoria final (Goal030) — NÃO é um teste do gate.
 *
 * O nome do arquivo termina em `.repro.mjs` de propósito: o padrão padrão do
 * Vitest só coleta arquivo cujo nome contém `.test.` ou `.spec.`, então ele fica
 * fora do caminho verde de `test:bff-integration` e não pode deixar o gate
 * vermelho por acidente. Ele também não é pulado em silêncio: está declarado no
 * achado A-03 de `docs/migration/FINAL_AUDIT.md`, com o comando e o código de
 * saída que produziu.
 *
 * O que ele reproduz: G-32 — não existe contrato compartilhado entre o BFF e o
 * frontend, e nada fica vermelho quando o BFF passa a responder outra coisa.
 * O frontend declara o formato que espera; o BFF não declara formato de
 * resposta nenhum; nenhum artefato liga os dois lados.
 *
 * Código de saída:
 *   1 — o achado REPRODUZ (estado esperado hoje);
 *   0 — o achado deixou de reproduzir, isto é, alguém fechou G-32.
 *
 * Esta reprodução é estática de propósito: não sobe banco, não sobe servidor e
 * não depende de ambiente, para que qualquer pessoa possa repeti-la.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SCHEMAS = "apps/frontend/src/data/mappers/publicApiSchemas.ts";

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(full)) acc.push(full);
  }
  return acc;
}

const WINDOWS_SEPARATOR = String.fromCharCode(92);
const posix = (path) => path.split(WINDOWS_SEPARATOR).join("/");

const findings = [];

// 1. Quantos formatos de resposta o frontend declara por conta própria.
const schemaSource = readFileSync(join(REPO, SCHEMAS), "utf8");
const declared = [...schemaSource.matchAll(/^export const (\w+Schema)\b/gm)].map((m) => m[1]);

// 2. Quem, fora do frontend, consome essas declarações. O esperado é ninguém:
//    é isso que torna a declaração um palpite do consumidor, não um contrato.
const consumersOutsideFrontend = walk(join(REPO, "apps"))
  .filter((file) => !posix(relative(REPO, file)).startsWith("apps/frontend/"))
  .filter((file) => readFileSync(file, "utf8").includes("publicApiSchemas"))
  .map((file) => posix(relative(REPO, file)));

// 3. Se existe pacote de contrato compartilhado no monorepo.
const packages = readdirSync(join(REPO, "packages")).filter((name) =>
  statSync(join(REPO, "packages", name)).isDirectory(),
);

// 4. Se o BFF valida a própria resposta pública. `response:` em opção de rota e
//    `serializerCompiler` são as duas formas de fazê-lo no Fastify.
const bffSources = walk(join(REPO, "apps/bff/src"));
const publicRoutes = bffSources.flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)]
    .map((m) => `${m[1].toUpperCase()} ${m[2]}`),
);
const responseValidation = bffSources.filter((file) => {
  const source = readFileSync(file, "utf8");
  return source.includes("serializerCompiler") || /schema:\s*\{[^}]*response\s*:/s.test(source);
});

console.log("A-03 — contrato entre BFF e frontend (reprodução estática)\n");
console.log(`  formatos de resposta declarados pelo frontend em ${SCHEMAS}: ${declared.length}`);
console.log(`  consumidores dessas declarações fora de apps/frontend: ${consumersOutsideFrontend.length}`
  + (consumersOutsideFrontend.length > 0 ? ` (${consumersOutsideFrontend.join(", ")})` : ""));
console.log(`  pacotes em packages/: ${packages.join(", ") || "(nenhum)"}`);
console.log(`  rotas públicas registradas no BFF: ${publicRoutes.length}`);
console.log(`  arquivos do BFF que validam a resposta pública: ${responseValidation.length}`);

if (consumersOutsideFrontend.length === 0) {
  findings.push(
    "o formato que o frontend espera não é lido por nenhum outro app: é declaração do consumidor, não contrato",
  );
}
if (!packages.some((name) => /contract|contrato|api|schema/i.test(name) && name !== "legal-contract")) {
  findings.push("não existe pacote de contrato compartilhado em packages/");
}
if (responseValidation.length === 0) {
  findings.push(
    `nenhuma das ${publicRoutes.length} rotas públicas do BFF valida a própria resposta: `
      + "mudar o corpo devolvido não deixa nada vermelho do lado do produtor",
  );
}

if (findings.length > 0) {
  console.error("\nA-03 REPRODUZ:");
  for (const line of findings) console.error(`  - ${line}`);
  console.error(
    "\nConsequência: uma divergência entre o BFF e o frontend só aparece na tela do usuário.\n"
      + "Corrigir isto é Goal próprio; esta auditoria apenas registra.",
  );
  process.exit(1);
}

console.log("\nA-03 não reproduz mais: existe ligação verificável entre os dois lados.");
