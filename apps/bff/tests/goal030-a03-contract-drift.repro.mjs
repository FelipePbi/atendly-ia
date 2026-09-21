#!/usr/bin/env node

/**
 * Reprodução do achado A-03 da auditoria final (Goal030) — E VERIFICAÇÃO DE
 * FECHAMENTO do Goal035/WU-09.
 *
 * O nome do arquivo termina em `.repro.mjs` de propósito: o padrão padrão do
 * Vitest só coleta arquivo cujo nome contém `.test.` ou `.spec.`, então ele fica
 * fora do caminho verde de `test:bff-integration` e não pode deixar o gate
 * vermelho por acidente. Ele também não é pulado em silêncio: está declarado no
 * achado A-03 de `docs/migration/FINAL_AUDIT.md`, com o comando e o código de
 * saída que produziu, e agora roda dentro de `validate:core` (passo
 * `repro:a03-contract-drift` em `scripts/validate-core.mjs`).
 *
 * O que ele reproduzia (estado do Goal030): G-32 — não existia contrato
 * compartilhado entre o BFF e o frontend, e nada ficava vermelho quando o BFF
 * passava a responder outra coisa. O frontend declarava o formato que
 * esperava; o BFF não declarava formato de resposta nenhum; nenhum artefato
 * ligava os dois lados.
 *
 * O que ele verifica agora (Goal035): que essa ligação existe e está viva —
 * não que ela nunca existiu. Ele confere, na árvore atual:
 *   1. existe um pacote de contrato compartilhado em `packages/`;
 *   2. o frontend consome os schemas desse pacote em vez de declará-los
 *      localmente (checado em `apps/frontend/src/data/mappers/publicApiSchemas.ts`);
 *   3. o BFF importa o mesmo pacote;
 *   4. o BFF registra, a partir de um arquivo que importa esse pacote e usa
 *      `.safeParse(`, uma verificação chamada no bootstrap do app — a
 *      verificação de fato ligada, não apenas escrita.
 * Se qualquer um desses quatro elos faltar, o achado volta a reproduzir: a
 * ligação foi removida ou nunca chegou a existir de ponta a ponta.
 *
 * Código de saída:
 *   1 — o achado REPRODUZ (contrato ausente ou desligado);
 *   0 — o achado não reproduz: existe contrato compartilhado, usado pelos dois
 *       lados e verificado no bootstrap do BFF.
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

function packageName(dir) {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO, "packages", dir, "package.json"), "utf8"));
    return pkg.name ?? null;
  } catch {
    return null;
  }
}

function exportedFunctionNames(source) {
  return [...source.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
}

const findings = [];

// 1. Existe pacote de contrato compartilhado no monorepo?
const packageDirs = readdirSync(join(REPO, "packages")).filter((name) =>
  statSync(join(REPO, "packages", name)).isDirectory(),
);
const contractDir = packageDirs.find(
  (name) => /contract|contrato|api|schema/i.test(name) && name !== "legal-contract",
);
const contractPackageName = contractDir ? packageName(contractDir) : null;

// 2. O frontend consome os schemas do pacote compartilhado, ou ainda os
//    declara por conta própria? Redeclaração local é o sintoma original de
//    A-03: um palpite do consumidor, não um contrato.
const schemaSource = readFileSync(join(REPO, SCHEMAS), "utf8");
const localDeclarations = [...schemaSource.matchAll(/^export const (\w+Schema)\s*=/gm)].map((m) => m[1]);
const frontendImportsContract = contractPackageName
  ? schemaSource.includes(contractPackageName)
  : false;

// 3. O BFF importa o mesmo pacote?
const bffFiles = walk(join(REPO, "apps/bff/src"));
const bffImportsContract = contractPackageName
  ? bffFiles.some((file) => readFileSync(file, "utf8").includes(contractPackageName))
  : false;

// 4. O BFF valida a própria resposta pública contra esse pacote, e essa
//    verificação está de fato ligada no bootstrap — não apenas escrita e
//    nunca chamada.
const validatorFiles = contractPackageName
  ? bffFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes(contractPackageName) && /\.safeParse\(/.test(source);
    })
  : [];
const validatorExports = validatorFiles.flatMap((file) =>
  exportedFunctionNames(readFileSync(file, "utf8")),
);
const appFile = bffFiles.find((file) => posix(relative(REPO, file)) === "apps/bff/src/app.ts");
const appSource = appFile ? readFileSync(appFile, "utf8") : "";
const validationRegistered =
  validatorFiles.length > 0 &&
  validatorExports.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(appSource));

console.log("A-03 — contrato entre BFF e frontend (reprodução estática)\n");
console.log(`  pacote de contrato compartilhado em packages/: ${contractPackageName ?? "(nenhum)"}`);
console.log(`  schemas declarados localmente em ${SCHEMAS}: ${localDeclarations.length}`);
console.log(`  ${SCHEMAS} importa o pacote compartilhado: ${frontendImportsContract}`);
console.log(`  BFF importa o pacote compartilhado: ${bffImportsContract}`);
console.log(
  `  BFF registra verificação de resposta contra o contrato no bootstrap: ${validationRegistered}`
    + (validatorFiles.length > 0
      ? ` (${validatorFiles.map((f) => posix(relative(REPO, f))).join(", ")})`
      : ""),
);

if (!contractPackageName) {
  findings.push("não existe pacote de contrato compartilhado em packages/");
}
if (localDeclarations.length > 0) {
  findings.push(
    `${SCHEMAS} ainda declara ${localDeclarations.length} schema(s) localmente em vez de importar do contrato compartilhado`,
  );
}
if (contractPackageName && !frontendImportsContract) {
  findings.push(`${SCHEMAS} não importa o pacote de contrato compartilhado`);
}
if (contractPackageName && !bffImportsContract) {
  findings.push("o BFF não importa o pacote de contrato compartilhado");
}
if (contractPackageName && !validationRegistered) {
  findings.push(
    "o BFF não tem, ligada no bootstrap, uma verificação da própria resposta pública contra o "
      + "contrato compartilhado: mudar o corpo devolvido não deixa nada vermelho do lado do produtor",
  );
}

if (findings.length > 0) {
  console.error("\nA-03 REPRODUZ:");
  for (const line of findings) console.error(`  - ${line}`);
  console.error(
    "\nConsequência: uma divergência entre o BFF e o frontend só aparece na tela do usuário.",
  );
  process.exit(1);
}

console.log(
  "\nA-03 não reproduz: existe pacote de contrato compartilhado, consumido pelos dois lados, "
    + "com a resposta do BFF verificada contra ele no bootstrap.",
);
