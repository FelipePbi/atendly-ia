import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Categorias reconhecidas de sítio de `sendText` sobre a porta
 * `WhatsAppProvider` (Goal039 / WU-01). Sítio que não cai em nenhuma delas é
 * resíduo e derruba a descoberta, nomeando arquivo e linha — não há
 * allowlist por arquivo, módulo ou linha; o conjunto reconhecido é
 * computado a cada execução, lendo `apps/ai-orchestrator/src` inteiro.
 *
 * - `port_declaration`: assinatura de `sendText` na interface
 *   `WhatsAppProvider` — não emite texto.
 * - `adapter_implementation`: implementação de `sendText` em um adapter
 *   concreto (tem corpo) — não emite texto próprio, repassa o que recebeu.
 * - `product_own_text_to_customer`: o `text:` do envio é composto pelo
 *   próprio produto antes do envio — `state.response.text` (grafo de
 *   mensagens) ou uma variável local atribuída de `composeNotificationText(`
 *   (serviço de notificação).
 * - `text_in_transit_named_origin`: o `text:` do envio é uma propriedade de
 *   um parâmetro recebido pelo chamador (`<origem>.text`, exceto `body`,
 *   que é o corpo da requisição HTTP) — o texto já existia antes desta
 *   função; ela só repassa. `origin` nomeia o parâmetro de onde veio.
 * - `person_typed_text`: o `text:` do envio é `body.text` — corpo de
 *   requisição HTTP, texto digitado por uma pessoa no BFF.
 */
export type SendTextSiteCategory =
  | "port_declaration"
  | "adapter_implementation"
  | "product_own_text_to_customer"
  | "text_in_transit_named_origin"
  | "person_typed_text";

export interface ClassifiedSendTextSite {
  filePath: string;
  line: number;
  category: SendTextSiteCategory;
  /** Só preenchido em `text_in_transit_named_origin`: o parâmetro de onde o texto veio. */
  origin?: string;
}

/** Lista, recursivamente, todo arquivo `.ts` (exceto `.d.ts`) sob `root`. */
export function listTypeScriptSources(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listTypeScriptSources(full));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) files.push(full);
  }
  return files;
}

/** Linha (1-based) de um índice de caractere em `source`. */
function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** Apaga comentários de `source` preservando índices e quebras de linha, para que nenhum vire candidato a sítio. */
function blankComments(source: string): string {
  let out = "";
  let quote: string | undefined;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === "\\") {
        out += source.slice(i, i + 2);
        i += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      out += char;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      out += "\n";
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 1;
      continue;
    }
    out += char;
  }
  return out;
}

/** Último caractere não-espaço antes de `index`, ou `undefined` no início do arquivo. */
function lastNonWhitespaceCharBefore(
  source: string,
  index: number,
): string | undefined {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  return i >= 0 ? source[i] : undefined;
}

/** Índice do delimitador de fechamento que casa com `openChar` em `source[openIndex]`, respeitando aspas/crase. */
function findMatchingDelimiterEnd(
  source: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(
    `delimitador "${openChar}" sem fechamento correspondente a partir do índice ${openIndex}`,
  );
}

/** Divide o conteúdo de um objeto em propriedades de topo, ignorando vírgulas dentro de `()`/`[]`/`{}` e de literais. */
function splitTopLevelProperties(content: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      continue;
    }
    if (char === "," && depth === 0) {
      items.push(content.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = content.slice(start).trim();
  if (last) items.push(last);
  return items.filter((item) => item.length > 0);
}

/** Expressão atribuída à propriedade `text` de um objeto `sendText({...})`, ou `undefined` se não houver. */
function findTextPropertyExpression(objectContent: string): string | undefined {
  for (const property of splitTopLevelProperties(objectContent)) {
    if (property === "text") return "text";
    const explicit = property.match(/^text\s*:\s*([\s\S]+)$/);
    if (explicit) return explicit[1].trim();
  }
  return undefined;
}

/** Última declaração `const text = composeNotificationText(` antes de `beforeIndex`, se existir. */
function hasComposeNotificationTextAssignmentBefore(
  source: string,
  beforeIndex: number,
): boolean {
  const pattern = /\bconst\s+text\s*=\s*composeNotificationText\s*\(/g;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = pattern.exec(source))) {
    if (match.index >= beforeIndex) break;
    found = true;
  }
  return found;
}

/** Classifica a expressão do `text:` de um sítio de chamada `sendText({...})` em uma categoria nomeada, ou `undefined` se a forma não for reconhecida. */
function classifySendTextCallExpression(
  expression: string,
  source: string,
  siteIndex: number,
): Pick<ClassifiedSendTextSite, "category" | "origin"> | undefined {
  if (expression === "state.response.text") {
    return { category: "product_own_text_to_customer" };
  }
  if (
    expression === "text" &&
    hasComposeNotificationTextAssignmentBefore(source, siteIndex)
  ) {
    return { category: "product_own_text_to_customer" };
  }
  const propertyAccess = expression.match(/^([A-Za-z_$][\w$]*)\.text$/);
  if (propertyAccess) {
    const [, origin] = propertyAccess;
    if (origin === "body") return { category: "person_typed_text" };
    return { category: "text_in_transit_named_origin", origin };
  }
  return undefined;
}

const SEND_TEXT_TOKEN_PATTERN = /\bsendText\s*\(/g;

/**
 * Classifica todo sítio de `sendText` de `source` (chamada sobre a porta
 * `WhatsAppProvider`, ou a própria declaração/implementação da porta) em uma
 * categoria nomeada. Sítio fora das categorias reconhecidas é resíduo e
 * derruba a descoberta, lançando erro que nomeia `filePath` e a linha.
 */
export function classifySendTextSites(
  rawSource: string,
  filePath: string,
): ClassifiedSendTextSite[] {
  const source = blankComments(rawSource);
  const sites: ClassifiedSendTextSite[] = [];
  let match: RegExpExecArray | null;
  SEND_TEXT_TOKEN_PATTERN.lastIndex = 0;
  while ((match = SEND_TEXT_TOKEN_PATTERN.exec(source))) {
    const line = lineAt(source, match.index);
    const openParenIndex = match.index + match[0].length - 1;
    const isCall = lastNonWhitespaceCharBefore(source, match.index) === ".";

    if (isCall) {
      const closeParenIndex = findMatchingDelimiterEnd(
        source,
        openParenIndex,
        "(",
        ")",
      );
      const args = source.slice(openParenIndex + 1, closeParenIndex).trim();
      const objectMatch = args.match(/^\{([\s\S]*)\}$/);
      const textExpression = objectMatch
        ? findTextPropertyExpression(objectMatch[1])
        : undefined;
      const classified =
        textExpression !== undefined
          ? classifySendTextCallExpression(textExpression, source, match.index)
          : undefined;
      if (!classified) {
        throw new Error(
          `${filePath}:${line}: chamada sendText(...) com forma de "text:" não reconhecida` +
            (textExpression !== undefined
              ? ` ("${textExpression}")`
              : " (nenhuma propriedade text: encontrada no argumento)") +
            " — não é state.response.text, variável local vinda de composeNotificationText(, " +
            "nem propriedade <origem>.text de um parâmetro do chamador.",
        );
      }
      sites.push({ filePath, line, ...classified });
      continue;
    }

    const closeParenIndex = findMatchingDelimiterEnd(
      source,
      openParenIndex,
      "(",
      ")",
    );
    const afterParams = source.slice(closeParenIndex + 1);
    const braceOffset = afterParams.indexOf("{");
    const semicolonOffset = afterParams.indexOf(";");
    const hasBody =
      braceOffset !== -1 &&
      (semicolonOffset === -1 || braceOffset < semicolonOffset);
    const isDeclarationOnly =
      semicolonOffset !== -1 &&
      (braceOffset === -1 || semicolonOffset < braceOffset);

    if (hasBody) {
      sites.push({ filePath, line, category: "adapter_implementation" });
      continue;
    }
    if (isDeclarationOnly) {
      sites.push({ filePath, line, category: "port_declaration" });
      continue;
    }
    throw new Error(
      `${filePath}:${line}: declaração de sendText(...) sem corpo "{" nem terminador ";" reconhecível` +
        " — não é a assinatura da porta WhatsAppProvider nem a implementação de um adapter.",
    );
  }
  return sites;
}

/**
 * Descobre e classifica todo sítio de `sendText` sob `srcRoot`, lendo a
 * árvore a cada execução — nenhuma lista de arquivos é escrita à mão. Sítio
 * sem categoria derruba a descoberta, nomeando arquivo e linha (ver
 * {@link classifySendTextSites}).
 */
export function discoverSendTextSites(srcRoot: string): ClassifiedSendTextSite[] {
  const sites: ClassifiedSendTextSite[] = [];
  for (const filePath of listTypeScriptSources(srcRoot)) {
    const source = readFileSync(filePath, "utf8");
    sites.push(...classifySendTextSites(source, filePath));
  }
  return sites;
}
