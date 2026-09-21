import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
 * - `` `composed_by_${compositor}` ``: o `text:` do envio é uma variável
 *   local atribuída de `const <nome> = <compositor>(` no mesmo bloco de
 *   função do sítio (ex.: `composed_by_composeNotificationText`) — a
 *   categoria nomeia o compositor, e a suíte verifica que os textos que ele
 *   produz estão em `VERIFIED_CLIENT_TEXTS`. Atribuição de outro bloco do
 *   mesmo arquivo não conta: cada função tem seu próprio escopo.
 * - `assistant_decision_text`: o `text:` do envio é `state.response.text` —
 *   a decisão do assistente no grafo de mensagens. Fica em categoria própria
 *   porque D-050 (item 2) separa o que o **código** garante (conjunto
 *   fechado e testável, como `composed_by_*`) do que o **prompt** apenas
 *   orienta (a fala do modelo, não demonstrável por um dublê roteirizado) —
 *   `state.response.text` pode carregar qualquer uma das duas origens, então
 *   não pertence ao conjunto verificado por execução.
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
  | `composed_by_${string}`
  | "assistant_decision_text"
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

/** Primeiro caractere não-espaço depois de `index`, ou `undefined` no fim do arquivo. */
function firstNonWhitespaceCharAfter(
  source: string,
  index: number,
): string | undefined {
  let i = index + 1;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  return i < source.length ? source[i] : undefined;
}

/** Modificadores conhecidos que podem preceder o nome de um método ou membro declarado, sem indicar chamada. */
const MEMBER_DECLARATION_MODIFIERS = new Set([
  "async",
  "static",
  "public",
  "private",
  "protected",
  "readonly",
  "abstract",
  "override",
  "declare",
  "get",
  "set",
  "export",
  "function",
]);

/**
 * true se o identificador em `index`, cuja lista de parâmetros ou argumentos
 * abre em `openParenIndex`, estiver em posição de declaração ou implementação
 * de membro. Duas condições precisam valer juntas:
 *
 * 1. **Antes do nome**, entre o limite de statement mais próximo (`{`, `}`,
 *    `;`) e o identificador, não há nada além de modificadores conhecidos (ou
 *    não há nada). Uma chamada com receptor (`this.sender.sendAiReply(...)`)
 *    ou precedida de palavra de expressão (`return`, `await`, `=`) cai aqui.
 * 2. **Depois do `)` correspondente** vem `:` (anotação de tipo de retorno) ou
 *    `{` (corpo do membro) — as duas únicas continuações de uma declaração ou
 *    implementação. Uma chamada continua com `;`, `,`, `)`, `.` ou operador.
 *
 * A segunda condição é o que separa declaração de **chamada de identificador
 * solto** (`sendAiReply({ ... });` sem receptor, no início do statement), que
 * pela primeira condição sozinha seria confundida com declaração e sairia da
 * vigilância em silêncio.
 */
function isMemberDeclarationOrImplementationPosition(
  source: string,
  index: number,
  openParenIndex: number,
): boolean {
  let boundary = index - 1;
  while (boundary >= 0 && !"{};".includes(source[boundary])) boundary -= 1;
  const between = source.slice(boundary + 1, index).trim();
  const onlyModifiers =
    between.length === 0 ||
    between.split(/\s+/).every((word) => MEMBER_DECLARATION_MODIFIERS.has(word));
  if (!onlyModifiers) return false;
  const closeParenIndex = findMatchingDelimiterEnd(
    source,
    openParenIndex,
    "(",
    ")",
  );
  const afterParams = firstNonWhitespaceCharAfter(source, closeParenIndex);
  return afterParams === ":" || afterParams === "{";
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

/** Corpo `{ ... }` (sem as chaves) de `interface <name>` em `source`, com o índice absoluto de seu início, ou `undefined` se a interface não existir. */
function findInterfaceBody(
  source: string,
  name: string,
): { bodyStart: number; body: string } | undefined {
  const pattern = new RegExp(`\\binterface\\s+${name}\\b[^{]*\\{`);
  const match = pattern.exec(source);
  if (!match) return undefined;
  const openIndex = match.index + match[0].length - 1;
  const closeIndex = findMatchingDelimiterEnd(source, openIndex, "{", "}");
  return { bodyStart: openIndex + 1, body: source.slice(openIndex + 1, closeIndex) };
}

/** Divide o corpo de uma interface em membros de topo (terminados por `;`), ignorando `;` dentro de `()`/`[]`/`{}` e de literais. */
function splitTopLevelInterfaceMembers(body: string): string[] {
  return splitTopLevelInterfaceMembersWithOffsets(body).map((item) => item.text);
}

/** Como {@link splitTopLevelInterfaceMembers}, mas preservando o índice absoluto (em `body`) de onde cada membro começa, para localizar linha. */
function splitTopLevelInterfaceMembersWithOffsets(
  body: string,
): { text: string; start: number }[] {
  const items: { text: string; start: number }[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  const pushSegment = (rawEnd: number): void => {
    const raw = body.slice(start, rawEnd);
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) items.push({ text, start: start + leading });
  };
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
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
    if (char === ";" && depth === 0) {
      pushSegment(i);
      start = i + 1;
    }
  }
  pushSegment(body.length);
  return items;
}

/** true se o corpo de uma interface declarar, no nível superior, uma propriedade `text: string` — o payload entregue ao destinatário do canal. */
function hasTopLevelTextStringProperty(body: string): boolean {
  for (const member of splitTopLevelInterfaceMembers(body)) {
    const match = member.match(/^([A-Za-z_$][\w$]*)\s*\??\s*:\s*([\s\S]+)$/);
    if (match && match[1] === "text" && match[2].trim() === "string") return true;
  }
  return false;
}

/** Um método declarado na interface `WhatsAppProvider`, classificado quanto a carregar texto ao destinatário do canal (Goal040 / WU-01). */
export interface WhatsAppProviderPortMethod {
  name: string;
  line: number;
  /** true: o parâmetro declara `text: string` — carrega texto ao destinatário do canal. */
  isCarrier: boolean;
  /** Motivo da classificação, para diagnóstico. */
  reason: string;
}

/**
 * Enumera todo método declarado na interface `WhatsAppProvider` de `source`,
 * classificando cada um em exatamente uma categoria: carrega texto ao
 * destinatário do canal (o tipo do parâmetro declara, no nível superior,
 * `text: string`) ou não carrega (não declara). Método cujo parâmetro não
 * resolve, no mesmo arquivo, a um tipo com forma reconhecível é resíduo e
 * derruba a leitura, nomeando arquivo e linha — não há lista de nomes de
 * método escrita à mão; o conjunto é lido da declaração a cada execução.
 */
export function parseWhatsAppProviderMethods(
  source: string,
  filePath: string,
): WhatsAppProviderPortMethod[] {
  const blanked = blankComments(source);
  const iface = findInterfaceBody(blanked, "WhatsAppProvider");
  if (!iface) {
    throw new Error(`${filePath}: interface "WhatsAppProvider" não encontrada`);
  }
  const methods: WhatsAppProviderPortMethod[] = [];
  for (const member of splitTopLevelInterfaceMembersWithOffsets(iface.body)) {
    const line = lineAt(blanked, iface.bodyStart + member.start);
    const methodMatch = member.text.match(/^([A-Za-z_$][\w$]*)\s*\??\s*\(/);
    const propertyMatch =
      !methodMatch && member.text.match(/^([A-Za-z_$][\w$]*)\s*\??\s*:\s*\(/);
    const nameMatch = methodMatch ?? propertyMatch;
    if (!nameMatch) {
      throw new Error(
        `${filePath}:${line}: membro "${member.text}" declarado com forma não reconhecida na porta WhatsAppProvider` +
          ' (esperado "nome(" ou "nome: (") — não dá para determinar se carrega texto ao destinatário do canal.',
      );
    }
    const name = nameMatch[1];
    const openParenIndex = nameMatch[0].length - 1;
    const closeParenIndex = findMatchingDelimiterEnd(
      member.text,
      openParenIndex,
      "(",
      ")",
    );
    const paramsText = member.text
      .slice(openParenIndex + 1, closeParenIndex)
      .trim();
    const firstParam = paramsText ? splitTopLevelProperties(paramsText)[0] : undefined;
    const paramTypeMatch = firstParam?.match(
      /^[A-Za-z_$][\w$]*\s*:\s*([A-Za-z_$][\w$]*)\s*$/,
    );
    const paramTypeName = paramTypeMatch?.[1];
    if (!paramTypeName) {
      throw new Error(
        `${filePath}:${line}: método "${name}" declarado com forma de parâmetro não reconhecida na porta WhatsAppProvider` +
          " — não dá para determinar se carrega texto ao destinatário do canal.",
      );
    }
    const paramTypeIface = findInterfaceBody(blanked, paramTypeName);
    if (!paramTypeIface) {
      throw new Error(
        `${filePath}:${line}: método "${name}" tem parâmetro de tipo "${paramTypeName}", não declarado como interface neste arquivo` +
          " — não dá para determinar se carrega texto ao destinatário do canal.",
      );
    }
    const isCarrier = hasTopLevelTextStringProperty(paramTypeIface.body);
    const reason = isCarrier
      ? `parâmetro "${paramTypeName}" declara text: string — carrega texto ao destinatário do canal`
      : `parâmetro "${paramTypeName}" não declara text: string — não carrega texto ao destinatário do canal`;
    methods.push({ name, line, isCarrier, reason });
  }
  return methods;
}

/** Caminho absoluto da declaração da porta `WhatsAppProvider`, lida a cada execução — não é editado por esta unidade. */
const WHATSAPP_PROVIDER_PORT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/channel/ports/WhatsAppProvider.ts",
);

/**
 * Nomes dos métodos da porta `WhatsAppProvider` que carregam texto ao
 * destinatário do canal, lidos da declaração a cada execução via
 * {@link parseWhatsAppProviderMethods} — nenhum nome de método é escrito à
 * mão neste descobridor.
 */
export function resolveSendTextCarrierMethodNames(): string[] {
  const source = readFileSync(WHATSAPP_PROVIDER_PORT_PATH, "utf8");
  const methods = parseWhatsAppProviderMethods(source, WHATSAPP_PROVIDER_PORT_PATH);
  return methods.filter((method) => method.isCarrier).map((method) => method.name);
}

/** Padrão que casa a chamada/declaração de qualquer método portador de texto da porta `WhatsAppProvider`, computado a cada execução. */
function buildSendTextTokenPattern(
  carrierMethodNames: string[] = resolveSendTextCarrierMethodNames(),
): RegExp {
  const escaped = carrierMethodNames.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`\\b(?:${escaped.join("|")})\\s*\\(`, "g");
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

/** Máscara "dentro de aspas/crase" para cada índice de `source` até `uptoIndex` (exclusivo), computada uma vez para as buscas de escopo abaixo. */
function computeQuoteMask(source: string, uptoIndex: number): boolean[] {
  const mask: boolean[] = new Array(uptoIndex).fill(false);
  let quote: string | undefined;
  for (let i = 0; i < uptoIndex; i += 1) {
    const char = source[i];
    if (quote) {
      mask[i] = true;
      if (char === "\\") {
        i += 1;
        if (i < uptoIndex) mask[i] = true;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      mask[i] = true;
    }
  }
  return mask;
}

/** Índice do delimitador de abertura que casa com `closeIndex`, escaneando para trás e ignorando índices marcados em `quoteMask`. */
function findMatchingDelimiterStart(
  source: string,
  quoteMask: boolean[],
  closeIndex: number,
  openChar: string,
  closeChar: string,
): number {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i -= 1) {
    if (quoteMask[i]) continue;
    const char = source[i];
    if (char === closeChar) depth += 1;
    else if (char === openChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(
    `delimitador "${closeChar}" sem abertura correspondente até o índice ${closeIndex}`,
  );
}

/** Palavra (identificador) que termina em `index` (exclusivo), ignorando espaço antes — usada para reconhecer a palavra-chave antes de um "(". */
function wordEndingAt(source: string, index: number): string {
  let end = index;
  while (end > 0 && /\s/.test(source[end - 1])) end -= 1;
  let start = end;
  while (start > 0 && /[\w$]/.test(source[start - 1])) start -= 1;
  return source.slice(start, end);
}

/** Palavras-chave de controle de fluxo cujo "(...)"  é seguido de "{" sem ser corpo de função. */
const CONTROL_FLOW_KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "with",
]);

/**
 * true se o "{" em `braceIndex` abre corpo de função (declaração, método ou
 * arrow), e não bloco de controle (`if`/`for`/`while`/`switch`/`catch`) nem
 * outro uso de chave (objeto, `class`, etc.). Reconhece tanto
 * `(...) {` / `(...): Tipo {` (função nomeada ou método) quanto `(...) => {`
 * (arrow), inclusive com anotação de tipo de retorno entre os parênteses e a
 * chave.
 */
function isFunctionBodyOpenBrace(
  source: string,
  quoteMask: boolean[],
  braceIndex: number,
): boolean {
  let i = braceIndex - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  if (i < 0) return false;

  if (source[i] === ">" && source[i - 1] === "=") return true; // "=> {"

  if (source[i] === ")") {
    const openParenIndex = findMatchingDelimiterStart(
      source,
      quoteMask,
      i,
      "(",
      ")",
    );
    return !CONTROL_FLOW_KEYWORDS.has(wordEndingAt(source, openParenIndex));
  }

  // Anotação de tipo de retorno entre o fim dos parâmetros e a chave:
  // "): TipoDeRetorno {". Anda para trás sobre a expressão de tipo,
  // respeitando o aninhamento de "<>"/"[]"/"()", até achar o ":" que a abre.
  let depth = 0;
  for (let j = i; j >= 0; j -= 1) {
    if (quoteMask[j]) continue;
    const char = source[j];
    if (char === ">" || char === "]" || char === ")") {
      depth += 1;
      continue;
    }
    if (char === "<" || char === "[" || char === "(") {
      if (depth === 0) return false;
      depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (char === ":") {
      let k = j - 1;
      while (k >= 0 && /\s/.test(source[k])) k -= 1;
      if (k < 0 || source[k] !== ")") return false;
      const openParenIndex = findMatchingDelimiterStart(
        source,
        quoteMask,
        k,
        "(",
        ")",
      );
      return !CONTROL_FLOW_KEYWORDS.has(wordEndingAt(source, openParenIndex));
    }
    if (/[\w$.\s|&?]/.test(char)) continue;
    return false;
  }
  return false;
}

/**
 * Início (logo após o "{") do corpo da função mais interna que contém
 * `index`, ou `0` se `index` estiver no nível superior do arquivo/módulo —
 * o bloco de escopo para resolução de variável local (Goal040 / WU-02).
 * Bloco de controle (`if`/`try`/`for`/...) aninhado dentro da função não
 * conta como fronteira: só função delimita escopo.
 */
function findEnclosingFunctionBodyStart(source: string, index: number): number {
  const quoteMask = computeQuoteMask(source, index);
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (quoteMask[i]) continue;
    const char = source[i];
    if (char === "}") {
      depth += 1;
      continue;
    }
    if (char === "{") {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      if (isFunctionBodyOpenBrace(source, quoteMask, i)) return i + 1;
      continue;
    }
  }
  return 0;
}

/**
 * Nome do compositor da última `const <identifier> = <compositor>(` dentro
 * do corpo da função que contém `beforeIndex` — nunca de outro bloco do
 * mesmo arquivo (Goal040 / WU-02: resolução de escopo de bloco, não busca no
 * arquivo inteiro). `undefined` se não houver nenhuma no escopo.
 */
function resolveBlockScopedComposerName(
  source: string,
  identifier: string,
  beforeIndex: number,
): string | undefined {
  const blockStart = findEnclosingFunctionBodyStart(source, beforeIndex);
  const scope = source.slice(blockStart, beforeIndex);
  const pattern = new RegExp(
    `\\bconst\\s+${identifier}\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*\\(`,
    "g",
  );
  let match: RegExpExecArray | null;
  let composerName: string | undefined;
  while ((match = pattern.exec(scope))) {
    composerName = match[1];
  }
  return composerName;
}

/** Classifica a expressão do `text:` de um sítio de chamada `sendText({...})` em uma categoria nomeada, ou `undefined` se a forma não for reconhecida. */
function classifySendTextCallExpression(
  expression: string,
  source: string,
  siteIndex: number,
): Pick<ClassifiedSendTextSite, "category" | "origin"> | undefined {
  if (expression === "state.response.text") {
    return { category: "assistant_decision_text" };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
    const composerName = resolveBlockScopedComposerName(
      source,
      expression,
      siteIndex,
    );
    if (composerName) {
      return { category: `composed_by_${composerName}` };
    }
  }
  const propertyAccess = expression.match(/^([A-Za-z_$][\w$]*)\.text$/);
  if (propertyAccess) {
    const [, origin] = propertyAccess;
    if (origin === "body") return { category: "person_typed_text" };
    return { category: "text_in_transit_named_origin", origin };
  }
  return undefined;
}

/**
 * Classifica todo sítio de `sendText` de `source` (chamada sobre a porta
 * `WhatsAppProvider`, ou a própria declaração/implementação da porta) em uma
 * categoria nomeada. Sítio fora das categorias reconhecidas é resíduo e
 * derruba a descoberta, lançando erro que nomeia `filePath`, a linha e o
 * portador descoberto (por padrão, os nomes lidos da porta via
 * {@link resolveSendTextCarrierMethodNames}; `carrierMethodNames` existe para
 * que testes injetem um conjunto sintético sem tocar o arquivo da porta).
 */
export function classifySendTextSites(
  rawSource: string,
  filePath: string,
  carrierMethodNames: string[] = resolveSendTextCarrierMethodNames(),
): ClassifiedSendTextSite[] {
  const source = blankComments(rawSource);
  const sites: ClassifiedSendTextSite[] = [];
  const sendTextTokenPattern = buildSendTextTokenPattern(carrierMethodNames);
  let match: RegExpExecArray | null;
  while ((match = sendTextTokenPattern.exec(source))) {
    const line = lineAt(source, match.index);
    const carrierName = match[0].replace(/\s*\($/, "");
    const openParenIndex = match.index + match[0].length - 1;
    const isCall = !isMemberDeclarationOrImplementationPosition(
      source,
      match.index,
      openParenIndex,
    );

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
          `${filePath}:${line}: chamada ${carrierName}(...) com forma de "text:" não reconhecida` +
            (textExpression !== undefined
              ? ` ("${textExpression}")`
              : " (nenhuma propriedade text: encontrada no argumento)") +
            " — não é state.response.text, variável local atribuída de um compositor " +
            "(const <nome> = <compositor>() no mesmo bloco de função do sítio), " +
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
      `${filePath}:${line}: declaração de ${carrierName}(...) sem corpo "{" nem terminador ";" reconhecível` +
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

/* =========================================================================
 * Cadeia de trânsito seguida até o chamador (Goal040 / WU-03)
 * ========================================================================= */

/**
 * Categoria de um chamador de função de trânsito. É exatamente o vocabulário
 * já declarado para sítio de `sendText`, menos as duas categorias que só
 * existem na porta (`port_declaration`/`adapter_implementation`): um chamador
 * ou continua a cadeia (`text_in_transit_named_origin`, com `origin` no
 * próprio parâmetro dele), ou entrega texto de categoria já declarada
 * (`assistant_decision_text`, `person_typed_text`), ou compõe o texto na hora
 * (`composed_by_<compositor>`, que exige compositor verificado).
 */
export type SendTextCallerCategory = Exclude<
  SendTextSiteCategory,
  "port_declaration" | "adapter_implementation"
>;

/** Um chamador real de uma função de trânsito, classificado pelo que fornece como texto. */
export interface ClassifiedSendTextCaller {
  filePath: string;
  line: number;
  /** Nome da função que contém a chamada — o elo seguinte da cadeia. */
  callerFunction: string;
  category: SendTextChainLinkCategory;
  /** Só em `text_in_transit_named_origin`: o parâmetro do chamador de onde o texto veio. */
  origin?: string;
  /** Só em `composed_by_*`: o compositor, já conferido contra os verificados. */
  composer?: string;
}

/**
 * Por que uma ocorrência do nome da função de trânsito **não** é chamador.
 *
 * - `port_declaration_or_implementation`: o nome aparece seguido de `(`, só
 *   com modificadores antes e com `:` ou `{` depois do `)` — é a assinatura na
 *   porta ou a própria implementação que contém o sítio, não uma chamada. Uma
 *   chamada de identificador solto (`sendAiReply({ ... });`) não cai aqui:
 *   depois do `)` dela não vem nem `:` nem `{`.
 * - `type_or_string_reference`: o nome aparece dentro de literal ou sem `(`
 *   depois — anotação de tipo como `Pick<Sender, "sendToTenantUnderTest">` ou
 *   `ReturnType<Port["sendAiReply"]>`, que não emite texto nenhum.
 *
 * Comentário não chega a virar ocorrência: a fonte passa por
 * {@link blankComments} antes da varredura. Chamada de teste também não: a
 * raiz de leitura é `apps/ai-orchestrator/src`, e nenhuma suíte mora lá.
 */
export type TransitOccurrenceExclusionReason =
  | "port_declaration_or_implementation"
  | "type_or_string_reference";

/** Ocorrência do nome da função de trânsito que a varredura recusou, com o motivo nomeado. */
export interface ExcludedTransitOccurrence {
  filePath: string;
  line: number;
  transitFunction: string;
  reason: TransitOccurrenceExclusionReason;
}

/** Uma cadeia de emissão: o sítio em trânsito, a função que o contém e o percurso até a raiz de cada ramo. */
export interface SendTextTransitChain {
  /** O sítio de `sendText` cujo texto já vinha de fora da função. */
  site: ClassifiedSendTextSite;
  /** A função que contém o sítio — é pelo nome dela que os chamadores são procurados. */
  transitFunction: string;
  /** Primeiro elo: cada chamada real da função de trânsito em `srcRoot`, classificada. */
  callers: ClassifiedSendTextCaller[];
  /** Ocorrências do mesmo nome que não são chamada **no primeiro elo**, cada uma com o motivo da exclusão. */
  excludedOccurrences: ExcludedTransitOccurrence[];
  /**
   * O percurso inteiro, elo a elo, do primeiro chamador até a raiz de cada
   * ramo (Goal041 / WU-02). `links[i].root` só vem preenchida no elo que fecha
   * o ramo.
   */
  links: SendTextChainLink[];
  /** As raízes alcançadas, uma por ramo terminado, cada uma com o motivo escrito junto. */
  roots: SendTextChainRoot[];
  /** Ciclos encontrados pelo percurso: cada um nomeia o elo cuja segunda visita foi recusada. */
  cycles: SendTextChainCycle[];
  /** Ocorrências recusadas nos elos **além do primeiro**, com o motivo nomeado. */
  excludedOccurrencesBeyondFirstLink: ExcludedTransitOccurrence[];
}

/** Modificadores de parâmetro de construtor, que precedem o nome. */
const PARAMETER_MODIFIER = /^(?:public|private|protected|readonly)\s+/;

/** Palavras que `wordEndingAt` pode devolver antes de um "(" sem que haja função nomeada ali. */
const NOT_A_FUNCTION_NAME = new Set(["", "function", "return", "await", "new"]);

/**
 * Índice do ")" que fecha a lista de parâmetros da função cujo corpo abre em
 * `braceIndex`, ou `undefined` se a forma não for reconhecível. Cobre
 * `(...) {`, `(...): Tipo {` e `(...) => {` — as mesmas formas que
 * {@link isFunctionBodyOpenBrace} reconhece.
 */
function findParameterListCloseParen(
  source: string,
  quoteMask: boolean[],
  braceIndex: number,
): number | undefined {
  let i = braceIndex - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  if (i < 0) return undefined;

  if (source[i] === ">" && source[i - 1] === "=") {
    let j = i - 2;
    while (j >= 0 && /\s/.test(source[j])) j -= 1;
    return j >= 0 && source[j] === ")" ? j : undefined;
  }

  if (source[i] === ")") return i;

  let depth = 0;
  for (let j = i; j >= 0; j -= 1) {
    if (quoteMask[j]) continue;
    const char = source[j];
    if (char === ">" || char === "]" || char === ")") {
      depth += 1;
      continue;
    }
    if (char === "<" || char === "[" || char === "(") {
      if (depth === 0) return undefined;
      depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (char === ":") {
      let k = j - 1;
      while (k >= 0 && /\s/.test(source[k])) k -= 1;
      return k >= 0 && source[k] === ")" ? k : undefined;
    }
    if (/[\w$.\s|&?]/.test(char)) continue;
    return undefined;
  }
  return undefined;
}

/** Nomes ligados por uma lista de parâmetros, inclusive desestruturação e rest. */
function parseParameterNames(paramsText: string): string[] {
  const names: string[] = [];
  for (const parameter of splitTopLevelProperties(paramsText)) {
    let text = parameter.trim();
    while (PARAMETER_MODIFIER.test(text)) {
      text = text.replace(PARAMETER_MODIFIER, "").trim();
    }
    if (text.startsWith("...")) text = text.slice(3).trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      const closeChar = text.startsWith("{") ? "}" : "]";
      const closeIndex = findMatchingDelimiterEnd(text, 0, text[0], closeChar);
      for (const entry of splitTopLevelProperties(text.slice(1, closeIndex))) {
        const bound = entry.match(
          /^([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/,
        );
        if (bound) names.push(bound[2] ?? bound[1]);
      }
      continue;
    }
    const named = text.match(/^([A-Za-z_$][\w$]*)/);
    if (named) names.push(named[1]);
  }
  return names;
}

/** Função mais interna que contém `index`, com parâmetros e posição, mesmo quando ela não tem nome próprio (arrow anônima). */
interface EnclosingFunctionSpan {
  /** Palavra imediatamente antes do "(" — nome do membro, ou modificador/vazio quando a função é anônima. */
  name: string;
  parameterNames: string[];
  /** Índice do "(" que abre a lista de parâmetros — de onde a raiz de entrada é lida. */
  openParenIndex: number;
}

/**
 * Função mais interna que contém `index`, ou `undefined` no nível do módulo.
 *
 * Devolve a função **mesmo sem nome próprio**: uma arrow passada como handler
 * de rota não tem nome, e o percurso transitivo ainda precisa dos parâmetros
 * dela para saber de onde o texto veio e da posição dela para reconhecer a
 * raiz de entrada.
 */
function resolveEnclosingFunctionSpan(
  source: string,
  index: number,
): EnclosingFunctionSpan | undefined {
  const bodyStart = findEnclosingFunctionBodyStart(source, index);
  if (bodyStart === 0) return undefined;
  const braceIndex = bodyStart - 1;
  const quoteMask = computeQuoteMask(source, braceIndex);
  const closeParenIndex = findParameterListCloseParen(
    source,
    quoteMask,
    braceIndex,
  );
  if (closeParenIndex === undefined) return undefined;
  const openParenIndex = findMatchingDelimiterStart(
    source,
    quoteMask,
    closeParenIndex,
    "(",
    ")",
  );
  return {
    name: wordEndingAt(source, openParenIndex),
    parameterNames: parseParameterNames(
      source.slice(openParenIndex + 1, closeParenIndex),
    ),
    openParenIndex,
  };
}

/**
 * true se `name`, a palavra colhida antes do "(" da lista de parâmetros, não
 * é nome de função pelo qual se possa procurar chamadores: arrow anônima
 * (`async (request) => {`) devolve o modificador, não um nome.
 */
function isAnonymousFunctionName(name: string): boolean {
  return (
    NOT_A_FUNCTION_NAME.has(name) ||
    CONTROL_FLOW_KEYWORDS.has(name) ||
    MEMBER_DECLARATION_MODIFIERS.has(name)
  );
}

/** Função **nomeada** mais interna que contém `index`, ou `undefined` no nível do módulo ou em função anônima. */
function resolveEnclosingFunction(
  source: string,
  index: number,
): EnclosingFunctionSpan | undefined {
  const span = resolveEnclosingFunctionSpan(source, index);
  if (!span || isAnonymousFunctionName(span.name)) return undefined;
  return span;
}

/** Índice da chamada de método portador de texto da porta que está na linha `line` de `source`. */
function findCarrierCallIndexAtLine(
  source: string,
  filePath: string,
  line: number,
): number {
  const pattern = buildSendTextTokenPattern();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (lineAt(source, match.index) === line) return match.index;
  }
  throw new Error(
    `${filePath}:${line}: sítio de envio não reencontrado na linha ao seguir a cadeia de trânsito`,
  );
}

/** A expressão do `text:` do primeiro argumento-objeto que declara `text`, entre os argumentos de uma chamada. */
function findTextExpressionInArguments(
  argumentsText: string,
): string | undefined {
  for (const argument of splitTopLevelProperties(argumentsText)) {
    const objectMatch = argument.match(/^\{([\s\S]*)\}$/);
    if (!objectMatch) continue;
    const expression = findTextPropertyExpression(objectMatch[1]);
    if (expression !== undefined) return expression;
  }
  return undefined;
}

/**
 * Classifica todo chamador de `transitFunction` em `rawSource`.
 *
 * O reconhecimento é ancorado **no nome da função de trânsito** — que por sua
 * vez vem do sítio do método portador da porta `WhatsAppProvider` —, nunca na
 * presença de um parâmetro chamado `text`: helper que formata texto, log que
 * registra texto e anotação de tipo que menciona o método continuam
 * invisíveis porque não chamam a função de trânsito. Ocorrência que não é
 * chamada sai em `excluded`, com o motivo nomeado (ver
 * {@link TransitOccurrenceExclusionReason}).
 *
 * Chamador cuja expressão de `text` não cai em nenhuma categoria é resíduo e
 * derruba a leitura, nomeando arquivo e linha. Chamador que compõe o texto na
 * hora com compositor ausente de `verifiedComposers` também é resíduo.
 */
export function classifyTransitCallersInSource(
  rawSource: string,
  filePath: string,
  transitFunction: string,
  verifiedComposers: ReadonlySet<string>,
): {
  callers: ClassifiedSendTextCaller[];
  excluded: ExcludedTransitOccurrence[];
} {
  const source = blankComments(rawSource);
  const { calls, excluded } = scanTransitOccurrences(
    source,
    filePath,
    transitFunction,
  );
  const callers = calls.map((call) =>
    classifyTransitCaller(
      source,
      filePath,
      call.line,
      call.index,
      call.openParenIndex,
      transitFunction,
      verifiedComposers,
    ),
  );
  return { callers, excluded };
}

/** Uma ocorrência de `transitFunction` que é chamada de verdade, com o "(" dos argumentos já localizado. */
interface TransitCallOccurrence {
  index: number;
  line: number;
  openParenIndex: number;
}

/**
 * Separa, na fonte **já limpa de comentários**, as chamadas reais de
 * `transitFunction` das ocorrências que não são chamada — cada recusa sai com
 * o motivo nomeado (ver {@link TransitOccurrenceExclusionReason}).
 *
 * É o único lugar onde o critério "isto é uma chamada" mora: o primeiro elo e
 * os elos seguintes do percurso transitivo usam esta mesma varredura, para que
 * nenhum deles ganhe um critério próprio que divirja do outro.
 */
function scanTransitOccurrences(
  source: string,
  filePath: string,
  transitFunction: string,
): { calls: TransitCallOccurrence[]; excluded: ExcludedTransitOccurrence[] } {
  const quoteMask = computeQuoteMask(source, source.length);
  const calls: TransitCallOccurrence[] = [];
  const excluded: ExcludedTransitOccurrence[] = [];
  const pattern = new RegExp(
    `\\b${transitFunction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const index = match.index;
    const line = lineAt(source, index);
    if (quoteMask[index]) {
      excluded.push({
        filePath,
        line,
        transitFunction,
        reason: "type_or_string_reference",
      });
      continue;
    }
    let after = index + transitFunction.length;
    while (after < source.length && /\s/.test(source[after])) after += 1;
    if (source[after] !== "(") {
      excluded.push({
        filePath,
        line,
        transitFunction,
        reason: "type_or_string_reference",
      });
      continue;
    }
    if (isMemberDeclarationOrImplementationPosition(source, index, after)) {
      excluded.push({
        filePath,
        line,
        transitFunction,
        reason: "port_declaration_or_implementation",
      });
      continue;
    }
    calls.push({ index, line, openParenIndex: after });
  }
  return { calls, excluded };
}

/** Classifica uma chamada já reconhecida da função de trânsito pelo que ela fornece como texto. */
function classifyTransitCaller(
  source: string,
  filePath: string,
  line: number,
  callIndex: number,
  openParenIndex: number,
  transitFunction: string,
  verifiedComposers: ReadonlySet<string>,
): ClassifiedSendTextCaller {
  const closeParenIndex = findMatchingDelimiterEnd(
    source,
    openParenIndex,
    "(",
    ")",
  );
  const expression = findTextExpressionInArguments(
    source.slice(openParenIndex + 1, closeParenIndex),
  );
  const enclosing = resolveEnclosingFunction(source, callIndex);
  const callerFunction = enclosing?.name ?? "<função anônima>";
  const parameterNames = enclosing?.parameterNames ?? [];
  const residue = (detail: string): never => {
    throw new Error(
      `${filePath}:${line}: chamador de ${transitFunction}(...) sem categoria — ${detail}`,
    );
  };

  if (expression === undefined) {
    return residue(
      "nenhum argumento-objeto com propriedade text: nesta chamada," +
        " então não dá para dizer que texto ele fornece",
    );
  }
  if (expression === "state.response.text") {
    return {
      filePath,
      line,
      callerFunction,
      category: "assistant_decision_text",
    };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
    const composer = resolveBlockScopedComposerName(
      source,
      expression,
      callIndex,
    );
    if (composer) {
      if (!verifiedComposers.has(composer)) {
        return residue(
          `compõe o texto na hora com "${composer}", que não está entre os compositores` +
            " cujo texto produzido está em VERIFIED_CLIENT_TEXTS",
        );
      }
      return {
        filePath,
        line,
        callerFunction,
        category: `composed_by_${composer}`,
        composer,
      };
    }
    if (parameterNames.includes(expression)) {
      return {
        filePath,
        line,
        callerFunction,
        category: "text_in_transit_named_origin",
        origin: expression,
      };
    }
  }
  const propertyAccess = expression.match(/^([A-Za-z_$][\w$]*)\.text$/);
  if (propertyAccess) {
    const [, origin] = propertyAccess;
    if (origin === "body") {
      return { filePath, line, callerFunction, category: "person_typed_text" };
    }
    if (parameterNames.includes(origin)) {
      return {
        filePath,
        line,
        callerFunction,
        category: "text_in_transit_named_origin",
        origin,
      };
    }
  }
  return residue(
    `"${expression}" não é state.response.text, não é body.text, não é parâmetro de` +
      ` "${callerFunction}" e não é variável local atribuída de um compositor no mesmo bloco de função`,
  );
}

/* =========================================================================
 * Percurso transitivo até raiz classificada (Goal041 / WU-02)
 * ========================================================================= */

/**
 * Por que um ramo da cadeia de trânsito termina.
 *
 * A parada é sempre por **raiz classificada**, nunca por profundidade fixa:
 * o percurso sobe de chamador em chamador dentro da árvore lida até cair em
 * uma destas raízes. Ramo que não chega a nenhuma delas é resíduo com arquivo
 * e linha — não há limite de saltos que faça um ramo parar em silêncio.
 *
 * Quatro raízes são **de origem de texto**: o texto nasce no próprio elo, e
 * não há cadeia acima dele.
 *
 * - `text_composed_at_link`: o elo compõe prosa própria (`const <nome> =
 *   <compositor>(...)` no mesmo bloco de função). A raiz **exige** que o
 *   compositor esteja entre os verificados contra `VERIFIED_CLIENT_TEXTS`;
 *   compositor ausente desse conjunto não é raiz, é resíduo.
 * - `assistant_decision_text`: o texto é a decisão do assistente —
 *   `state.response.text`, ou variável local atribuída de
 *   `await this.assistant.<método>(...)`, que é a mesma decisão vindo pela
 *   porta do assistente.
 * - `person_typed_text`: o texto é `body.text`, digitado por uma pessoa no
 *   corpo da requisição HTTP.
 * - `literal_text_at_link`: o texto é literal escrito na fonte do próprio elo
 *   — literal de aspas, concatenação de literais, template, ou `const` de
 *   módulo ligado a um deles. O literal sai em `literalText` de propósito:
 *   é ele que a suíte enumera, então literal novo muda a enumeração afirmada
 *   em vez de entrar sem ser visto.
 *
 * Três raízes são **de entrada**: o texto ainda está em trânsito, mas a função
 * que o carrega não tem chamador na árvore porque quem a chama está fora dela.
 *
 * - `http_route`: a função é o handler de uma rota registrada
 *   (`<algo>.post("/caminho", handler)` e as demais palavras de método HTTP);
 *   quem chama é o servidor, a partir de uma requisição.
 * - `worker_or_job`: a função é método de uma classe `*Worker`/`*Job`, ou é o
 *   callback de `setInterval`/`setTimeout`; quem chama é o relógio.
 * - `activation_test_entry`: a função é método de uma classe do canal de teste
 *   de ativação (nome `ActivationTest*`, ou classe que implementa porta
 *   `ActivationTest*`); quem chama é a execução do teste de ativação.
 *
 * A última raiz é de **terminação do percurso**:
 *
 * - `cycle`: a continuação deste elo já tinha sido visitada neste percurso. O
 *   ramo termina aqui, o ciclo é reportado em `cycles`, e nenhum elo é
 *   percorrido duas vezes — o ramo não some e o percurso não trava.
 */
export type SendTextChainRootKind =
  | "text_composed_at_link"
  | "assistant_decision_text"
  | "person_typed_text"
  | "literal_text_at_link"
  | "http_route"
  | "worker_or_job"
  | "activation_test_entry"
  | "cycle";

/** A raiz em que um ramo terminou, com o motivo escrito junto. */
export interface SendTextChainRoot {
  kind: SendTextChainRootKind;
  reason: string;
}

/**
 * Categoria do que um elo fornece como texto: o vocabulário do Goal040 mais
 * `literal_text_at_link`, que é o elo cujo texto é literal da própria fonte.
 */
export type SendTextChainLinkCategory =
  | SendTextCallerCategory
  | "literal_text_at_link";

/** Um elo do percurso: uma chamada real da função do elo anterior. */
export interface SendTextChainLink {
  /** 1 é o primeiro elo — o chamador da função de trânsito que contém o sítio. */
  depth: number;
  filePath: string;
  line: number;
  /** A função chamada neste elo, isto é, a função de trânsito do elo anterior. */
  calleeFunction: string;
  /** A função que contém a chamada; é por ela que o percurso continua. */
  callerFunction: string;
  category: SendTextChainLinkCategory;
  /** Só em `text_in_transit_named_origin`: o parâmetro do chamador de onde o texto veio. */
  origin?: string;
  /** Só em `composed_by_*`: o compositor, já conferido contra os verificados. */
  composer?: string;
  /** Só em `literal_text_at_link`: o literal escrito na fonte, para a suíte enumerar. */
  literalText?: string;
  /** Preenchida quando o ramo termina neste elo; ausente enquanto o texto segue em trânsito. */
  root?: SendTextChainRoot;
}

/** Um ciclo encontrado pelo percurso: a continuação do elo já tinha sido visitada. */
export interface SendTextChainCycle {
  /** Onde está o elo que fecharia o ciclo. */
  filePath: string;
  line: number;
  /** A função já visitada, cuja segunda visita foi recusada. */
  functionName: string;
  /** O parâmetro dela que carrega o texto — é o par função/parâmetro que identifica um elo. */
  originParameter: string;
  reason: string;
}

/** Como o elo seguinte consome a origem: o próprio valor, ou a propriedade `text` dele. */
type TransitOriginAccess = "value" | "text_property";

/** Uma continuação pendente do percurso: a função que carrega o texto e por qual parâmetro. */
interface PendingTransitLink {
  /** Arquivo onde a função está declarada. */
  filePath: string;
  functionName: string;
  originParameter: string;
  /** Posição do parâmetro de origem na lista de parâmetros — é por ela que o argumento do chamador é lido. */
  parameterIndex: number;
  originAccess: TransitOriginAccess;
  depth: number;
  /** Índice do "(" da lista de parâmetros, para reconhecer raiz de entrada quando não houver chamador. */
  definitionParenIndex: number;
  /** O elo que pediu esta continuação — recebe a raiz quando o ramo termina aqui. */
  sourceLink?: SendTextChainLink;
  /** Onde aquele elo está, para nomear arquivo e linha em resíduo e em ciclo. */
  fromFilePath: string;
  fromLine: number;
}

/** Palavras de método HTTP que registram rota; o primeiro argumento precisa ser um caminho literal. */
const HTTP_ROUTE_REGISTRATION_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
  "route",
]);

/** Registros que fazem o relógio chamar a função, sem chamador nomeado na árvore. */
const TIMER_REGISTRATION_FUNCTIONS = new Set(["setInterval", "setTimeout"]);

/** Classe cujo nome diz que ela é disparada por worker ou job. */
const WORKER_OR_JOB_CLASS_NAME = /(?:Worker|Job)$/;

/** Classe ou porta do canal de teste de ativação. */
const ACTIVATION_TEST_NAME = /^ActivationTest/;

/** Divide uma expressão nas somas de nível superior, ignorando `+` dentro de literais e de `()`/`[]`/`{}`. */
function splitTopLevelConcatenation(expression: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];
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
    if (char === "+" && depth === 0) {
      parts.push(expression.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(expression.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

/** Conteúdo de um literal de texto (`"..."`, `'...'` ou crase), ou `undefined` se a expressão não for um literal só. */
function readStringLiteral(expression: string): string | undefined {
  const doubleQuoted = expression.match(/^"((?:[^"\\]|\\[\s\S])*)"$/);
  if (doubleQuoted) return doubleQuoted[1];
  const singleQuoted = expression.match(/^'((?:[^'\\]|\\[\s\S])*)'$/);
  if (singleQuoted) return singleQuoted[1];
  const templated = expression.match(/^`((?:[^`\\]|\\[\s\S])*)`$/);
  if (templated) return templated[1];
  return undefined;
}

/** Expressão atribuída a `const <identifier>` no **nível do módulo** de `source`, ou `undefined` se não houver. */
function resolveModuleLevelConstExpression(
  source: string,
  identifier: string,
): string | undefined {
  const pattern = new RegExp(
    `\\bconst\\s+${identifier}\\s*(?::[^=]+)?=`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (findEnclosingFunctionBodyStart(source, match.index) !== 0) continue;
    const start = match.index + match[0].length;
    let depth = 0;
    let quote: string | undefined;
    for (let i = start; i < source.length; i += 1) {
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
      if (char === "(" || char === "[" || char === "{") {
        depth += 1;
        continue;
      }
      if (char === ")" || char === "]" || char === "}") {
        depth -= 1;
        continue;
      }
      if (char === ";" && depth === 0) return source.slice(start, i).trim();
    }
  }
  return undefined;
}

/**
 * O texto literal que `expression` escreve na fonte, ou `undefined` quando a
 * expressão não é literal. Reconhece literal simples, concatenação de
 * literais e `const` de módulo ligado a um deles; template com interpolação
 * volta como está escrito, porque é a prosa da fonte que interessa enumerar.
 */
function resolveLiteralText(
  source: string,
  expression: string,
): string | undefined {
  const parts = splitTopLevelConcatenation(expression);
  if (parts.length > 1) {
    const values = parts.map((part) => readStringLiteral(part));
    if (values.every((value) => value !== undefined)) return values.join("");
    return undefined;
  }
  const direct = readStringLiteral(expression);
  if (direct !== undefined) return direct;
  if (!/^[A-Za-z_$][\w$]*$/.test(expression)) return undefined;
  const moduleLevel = resolveModuleLevelConstExpression(source, expression);
  if (moduleLevel === undefined) return undefined;
  const parsed = splitTopLevelConcatenation(moduleLevel).map((part) =>
    readStringLiteral(part),
  );
  if (parsed.every((value) => value !== undefined)) return parsed.join("");
  return undefined;
}

/**
 * Método do assistente da última `const <identifier> = await this.assistant.<método>(`
 * dentro do bloco de função que contém `beforeIndex`, ou `undefined` se não
 * houver. É a segunda forma de `assistant_decision_text`: a fala do modelo
 * chegando pela porta do assistente em vez de por `state.response.text`.
 */
function resolveBlockScopedAssistantDecision(
  source: string,
  identifier: string,
  beforeIndex: number,
): string | undefined {
  const blockStart = findEnclosingFunctionBodyStart(source, beforeIndex);
  const scope = source.slice(blockStart, beforeIndex);
  const pattern = new RegExp(
    `\\bconst\\s+${identifier}\\s*=\\s*await\\s+this\\.assistant\\.([A-Za-z_$][\\w$]*)\\s*\\(`,
    "g",
  );
  let match: RegExpExecArray | null;
  let method: string | undefined;
  while ((match = pattern.exec(scope))) {
    method = match[1];
  }
  return method;
}

/** Índice do "(" da chamada que envolve `index`, ou `undefined` se `index` não estiver dentro de uma lista de argumentos. */
function findEnclosingCallOpenParen(
  source: string,
  quoteMask: boolean[],
  index: number,
): number | undefined {
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (quoteMask[i]) continue;
    const char = source[i];
    if (char === ")" || char === "]" || char === "}") {
      depth += 1;
      continue;
    }
    if (char === "(") {
      if (depth === 0) return i;
      depth -= 1;
      continue;
    }
    if (char === "[" || char === "{") {
      if (depth === 0) return undefined;
      depth -= 1;
      continue;
    }
    if (char === ";" && depth === 0) return undefined;
  }
  return undefined;
}

/** Cabeçalho da classe que envolve `index` — nome e interfaces implementadas —, ou `undefined` fora de classe. */
function findEnclosingClassHeader(
  source: string,
  quoteMask: boolean[],
  index: number,
): { name: string; implementsNames: string[] } | undefined {
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (quoteMask[i]) continue;
    const char = source[i];
    if (char === "}") {
      depth += 1;
      continue;
    }
    if (char !== "{") continue;
    if (depth > 0) {
      depth -= 1;
      continue;
    }
    const header = /\bclass\s+([A-Za-z_$][\w$]*)([^{}();]*)$/.exec(
      source.slice(0, i),
    );
    if (!header) continue;
    const implemented = /\bimplements\s+([\s\S]*)$/.exec(header[2]);
    const implementsNames = implemented
      ? implemented[1]
          .split(",")
          .map((name) => name.trim().replace(/<[\s\S]*$/, "").trim())
          .filter((name) => name.length > 0)
      : [];
    return { name: header[1], implementsNames };
  }
  return undefined;
}

/**
 * A raiz de entrada da função cuja lista de parâmetros abre em
 * `openParenIndex`, ou `undefined` quando a função não é ponto de entrada
 * nenhum — e aí o ramo que morre nela é resíduo, não raiz.
 */
function resolveEntryPointRoot(
  source: string,
  openParenIndex: number,
): SendTextChainRoot | undefined {
  const quoteMask = computeQuoteMask(source, source.length);
  const callParenIndex = findEnclosingCallOpenParen(
    source,
    quoteMask,
    openParenIndex,
  );
  if (callParenIndex !== undefined) {
    const registrar = wordEndingAt(source, callParenIndex);
    if (TIMER_REGISTRATION_FUNCTIONS.has(registrar)) {
      return {
        kind: "worker_or_job",
        reason: `callback de ${registrar}(...) — quem dispara a função é o relógio, não um chamador na árvore`,
      };
    }
    if (HTTP_ROUTE_REGISTRATION_METHODS.has(registrar)) {
      const closeParenIndex = findMatchingDelimiterEnd(
        source,
        callParenIndex,
        "(",
        ")",
      );
      const firstArgument =
        splitTopLevelProperties(
          source.slice(callParenIndex + 1, closeParenIndex),
        )[0] ?? "";
      if (/^["'`]\//.test(firstArgument)) {
        return {
          kind: "http_route",
          reason: `handler de rota registrada em ${registrar}(${firstArgument}, ...) — quem chama é o servidor, a partir da requisição`,
        };
      }
    }
  }
  const classHeader = findEnclosingClassHeader(
    source,
    quoteMask,
    openParenIndex,
  );
  if (classHeader) {
    const activationTestPort = classHeader.implementsNames.find((name) =>
      ACTIVATION_TEST_NAME.test(name),
    );
    if (ACTIVATION_TEST_NAME.test(classHeader.name) || activationTestPort) {
      return {
        kind: "activation_test_entry",
        reason:
          `método de "${classHeader.name}"` +
          (activationTestPort ? `, que implementa "${activationTestPort}"` : "") +
          " — a entrada é a execução do canal de teste de ativação",
      };
    }
    if (WORKER_OR_JOB_CLASS_NAME.test(classHeader.name)) {
      return {
        kind: "worker_or_job",
        reason: `método de "${classHeader.name}" — quem dispara a função é o worker/job, não um chamador na árvore`,
      };
    }
  }
  return undefined;
}

/**
 * Classificação de um elo: ou o texto segue em trânsito, ou o ramo termina em
 * raiz nomeada, ou o elo é resíduo com o motivo já escrito — o terceiro caso
 * existe para que o resíduo nomeie o que viu (o compositor não verificado, por
 * exemplo) em vez de sair como "forma não reconhecida".
 */
type ChainLinkClassification =
  | {
      category: "text_in_transit_named_origin";
      origin: string;
      originAccess: TransitOriginAccess;
    }
  | {
      category: SendTextChainLinkCategory;
      root: SendTextChainRoot;
      composer?: string;
      literalText?: string;
    }
  | { residueDetail: string };

/** A classificação de um elo que não é resíduo. */
type SettledChainLinkClassification = Exclude<
  ChainLinkClassification,
  { residueDetail: string }
>;

/**
 * Classifica a expressão que um elo fornece como texto, no escopo da função
 * que o contém. Forma não prevista devolve `undefined` e vira resíduo
 * nomeado: nenhuma classificação acontece em silêncio.
 */
function classifyChainTextExpression(
  source: string,
  expression: string,
  callIndex: number,
  parameterNames: readonly string[],
  verifiedComposers: ReadonlySet<string>,
): ChainLinkClassification | undefined {
  if (expression === "state.response.text") {
    return {
      category: "assistant_decision_text",
      root: {
        kind: "assistant_decision_text",
        reason:
          "o texto é state.response.text — a decisão do assistente nasce neste elo",
      },
    };
  }

  const propertyAccess = expression.match(/^([A-Za-z_$][\w$]*)\.text$/);
  if (propertyAccess) {
    const [, origin] = propertyAccess;
    if (origin === "body") {
      return {
        category: "person_typed_text",
        root: {
          kind: "person_typed_text",
          reason:
            "o texto é body.text — digitado por uma pessoa no corpo da requisição",
        },
      };
    }
    if (parameterNames.includes(origin)) {
      return {
        category: "text_in_transit_named_origin",
        origin,
        originAccess: "text_property",
      };
    }
    const assistantMethod = resolveBlockScopedAssistantDecision(
      source,
      origin,
      callIndex,
    );
    if (assistantMethod) {
      return {
        category: "assistant_decision_text",
        root: {
          kind: "assistant_decision_text",
          reason:
            `"${origin}" vem de await this.assistant.${assistantMethod}(...) —` +
            " a decisão do assistente nasce neste elo",
        },
      };
    }
    return undefined;
  }

  if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
    const composer = resolveBlockScopedComposerName(
      source,
      expression,
      callIndex,
    );
    if (composer) {
      if (!verifiedComposers.has(composer)) {
        return {
          residueDetail:
            `compõe o texto na hora com "${composer}", que não está entre os compositores` +
            " cujo texto produzido está em VERIFIED_CLIENT_TEXTS",
        };
      }
      return {
        category: `composed_by_${composer}`,
        composer,
        root: {
          kind: "text_composed_at_link",
          reason:
            `o elo compõe o texto com "${composer}", cujo texto produzido está` +
            " em VERIFIED_CLIENT_TEXTS",
        },
      };
    }
    const assistantMethod = resolveBlockScopedAssistantDecision(
      source,
      expression,
      callIndex,
    );
    if (assistantMethod) {
      return {
        category: "assistant_decision_text",
        root: {
          kind: "assistant_decision_text",
          reason:
            `"${expression}" vem de await this.assistant.${assistantMethod}(...) —` +
            " a decisão do assistente nasce neste elo",
        },
      };
    }
    if (parameterNames.includes(expression)) {
      return {
        category: "text_in_transit_named_origin",
        origin: expression,
        originAccess: "value",
      };
    }
  }

  const literalText = resolveLiteralText(source, expression);
  if (literalText !== undefined) {
    return {
      category: "literal_text_at_link",
      literalText,
      root: {
        kind: "literal_text_at_link",
        reason:
          "o texto é literal escrito na fonte deste elo — não vem de nenhum chamador acima",
      },
    };
  }
  return undefined;
}

/** O que o percurso encontrou a partir de um sítio em trânsito. */
interface FollowedTransitChain {
  links: SendTextChainLink[];
  roots: SendTextChainRoot[];
  cycles: SendTextChainCycle[];
  excludedByDepth: { depth: number; occurrence: ExcludedTransitOccurrence }[];
}

/** Identidade de uma continuação: função e parâmetro que carrega o texto. É esta chave que o conjunto de visitados guarda. */
function pendingTransitLinkKey(pending: PendingTransitLink): string {
  return `${pending.filePath}::${pending.functionName}::${pending.originParameter}`;
}

/**
 * Sobe a cadeia a partir de `first`, de chamador em chamador, até que cada
 * ramo termine em raiz classificada (Goal041 / WU-02).
 *
 * Não há profundidade máxima: o que faz o percurso terminar é a raiz, e o
 * conjunto de visitados, que recusa a segunda visita ao mesmo par
 * função/parâmetro. Ciclo vira raiz `cycle` no elo que o fecharia, e sai
 * também em `cycles` — o ramo não some e nada é percorrido duas vezes.
 */
function followTransitChain(
  sources: ReadonlyMap<string, string>,
  first: PendingTransitLink,
  verifiedComposers: ReadonlySet<string>,
): FollowedTransitChain {
  const links: SendTextChainLink[] = [];
  const roots: SendTextChainRoot[] = [];
  const cycles: SendTextChainCycle[] = [];
  const excludedByDepth: {
    depth: number;
    occurrence: ExcludedTransitOccurrence;
  }[] = [];
  const visited = new Set<string>([pendingTransitLinkKey(first)]);
  const queue: PendingTransitLink[] = [first];

  while (queue.length > 0) {
    const pending = queue.shift() as PendingTransitLink;
    let callCount = 0;

    for (const [filePath, source] of sources) {
      const scanned = scanTransitOccurrences(
        source,
        filePath,
        pending.functionName,
      );
      for (const occurrence of scanned.excluded) {
        excludedByDepth.push({ depth: pending.depth, occurrence });
      }
      for (const call of scanned.calls) {
        callCount += 1;
        const closeParenIndex = findMatchingDelimiterEnd(
          source,
          call.openParenIndex,
          "(",
          ")",
        );
        const argumentsText = source.slice(
          call.openParenIndex + 1,
          closeParenIndex,
        );
        const span = resolveEnclosingFunctionSpan(source, call.index);
        const parameterNames = span?.parameterNames ?? [];
        const callerFunction =
          span && !isAnonymousFunctionName(span.name)
            ? span.name
            : "<função anônima>";
        // Anotada como `=> never` de propósito: é isso que deixa o
        // compilador estreitar o tipo depois de cada chamada, em vez de
        // exigir asserção em cada uso do valor já conferido.
        const residue: (detail: string) => never = (detail) => {
          throw new Error(
            `${filePath}:${call.line}: chamador de ${pending.functionName}(...) sem categoria — ${detail}`,
          );
        };

        const argument = splitTopLevelProperties(argumentsText)[
          pending.parameterIndex
        ];
        if (argument === undefined) {
          residue(
            `não há argumento na posição ${pending.parameterIndex} da chamada, que é a do` +
              ` parâmetro "${pending.originParameter}" de "${pending.functionName}"`,
          );
        }
        let expression: string | undefined;
        if (pending.originAccess === "text_property") {
          const objectMatch = argument.match(/^\{([\s\S]*)\}$/);
          if (objectMatch) {
            expression = findTextPropertyExpression(objectMatch[1]);
          } else if (/^[A-Za-z_$][\w$]*$/.test(argument)) {
            expression = `${argument}.text`;
          }
        } else {
          expression = argument;
        }
        if (expression === undefined) {
          residue(
            `o argumento "${argument}" não deixa ver que texto ele fornece ao` +
              ` parâmetro "${pending.originParameter}" de "${pending.functionName}"`,
          );
        }

        const classified = classifyChainTextExpression(
          source,
          expression,
          call.index,
          parameterNames,
          verifiedComposers,
        );
        if (!classified) {
          residue(
            `"${expression}" não é state.response.text, não é body.text, não é` +
              ` parâmetro de "${callerFunction}", não é texto literal da fonte e não é` +
              " variável local atribuída de um compositor verificado nem da porta do assistente",
          );
        }
        if ("residueDetail" in classified) residue(classified.residueDetail);
        const settled: SettledChainLinkClassification = classified;

        const link: SendTextChainLink = {
          depth: pending.depth,
          filePath,
          line: call.line,
          calleeFunction: pending.functionName,
          callerFunction,
          category: settled.category,
        };
        links.push(link);

        if (settled.category !== "text_in_transit_named_origin") {
          const terminal = settled;
          if (terminal.composer !== undefined) link.composer = terminal.composer;
          if (terminal.literalText !== undefined) {
            link.literalText = terminal.literalText;
          }
          link.root = terminal.root;
          roots.push(terminal.root);
          continue;
        }

        const transit = settled as Extract<
          SettledChainLinkClassification,
          { origin: string }
        >;
        link.origin = transit.origin;

        // O texto segue em trânsito: só dá para continuar se a função que o
        // carrega tiver nome pelo qual procurar chamadores. Sem nome — arrow
        // anônima —, o ramo tem que terminar em raiz de entrada.
        if (!span || callerFunction === "<função anônima>") {
          const root = span
            ? resolveEntryPointRoot(source, span.openParenIndex)
            : undefined;
          if (!root) {
            residue(
              `o texto segue em trânsito por "${transit.origin}", mas a função que o carrega não` +
                " tem nome para procurar chamadores nem é ponto de entrada reconhecido",
            );
          }
          link.root = root;
          roots.push(root);
          continue;
        }

        const parameterIndex = parameterNames.indexOf(transit.origin);
        if (parameterIndex === -1) {
          residue(
            `"${transit.origin}" não é parâmetro de "${callerFunction}", então não há por onde` +
              " seguir a cadeia acima deste elo",
          );
        }
        const next: PendingTransitLink = {
          filePath,
          functionName: callerFunction,
          originParameter: transit.origin,
          parameterIndex,
          originAccess: transit.originAccess,
          depth: pending.depth + 1,
          definitionParenIndex: span.openParenIndex,
          sourceLink: link,
          fromFilePath: filePath,
          fromLine: call.line,
        };
        const key = pendingTransitLinkKey(next);
        if (visited.has(key)) {
          const root: SendTextChainRoot = {
            kind: "cycle",
            reason:
              `a continuação "${callerFunction}" (parâmetro "${transit.origin}") já foi visitada` +
              " neste percurso — o ramo termina aqui e o ciclo é reportado, sem percorrer duas vezes",
          };
          link.root = root;
          roots.push(root);
          cycles.push({
            filePath,
            line: call.line,
            functionName: callerFunction,
            originParameter: transit.origin,
            reason: root.reason,
          });
          continue;
        }
        visited.add(key);
        queue.push(next);
      }
    }

    if (callCount === 0) {
      const source = sources.get(pending.filePath);
      const root =
        source === undefined
          ? undefined
          : resolveEntryPointRoot(source, pending.definitionParenIndex);
      if (!root) {
        throw new Error(
          `${pending.fromFilePath}:${pending.fromLine}: o ramo da cadeia de trânsito termina em` +
            ` "${pending.functionName}" (${pending.filePath}), que não tem chamador na árvore lida` +
            " e não é rota HTTP registrada, worker ou job, nem entrada do canal de teste de ativação" +
            " — ramo sem raiz classificada é resíduo.",
        );
      }
      if (pending.sourceLink) pending.sourceLink.root = root;
      roots.push(root);
    }
  }

  return { links, roots, cycles, excludedByDepth };
}

/** Converte o primeiro elo do percurso para o vocabulário de chamador do Goal040, que a suíte já afirma. */
function toClassifiedCaller(link: SendTextChainLink): ClassifiedSendTextCaller {
  const caller: ClassifiedSendTextCaller = {
    filePath: link.filePath,
    line: link.line,
    callerFunction: link.callerFunction,
    category: link.category,
  };
  if (link.origin !== undefined) caller.origin = link.origin;
  if (link.composer !== undefined) caller.composer = link.composer;
  return caller;
}

/**
 * Segue um sítio `text_in_transit_named_origin` até a raiz de cada ramo,
 * sobre as fontes já lidas — a função de trânsito é a que contém o sítio, e o
 * nome dela sai da própria fonte.
 */
function followChainFromSite(
  sources: ReadonlyMap<string, string>,
  site: ClassifiedSendTextSite,
  verifiedComposers: ReadonlySet<string>,
): SendTextTransitChain {
  const source = sources.get(site.filePath);
  if (!source) {
    throw new Error(
      `${site.filePath}:${site.line}: sítio em trânsito fora da árvore lida`,
    );
  }
  const siteIndex = findCarrierCallIndexAtLine(source, site.filePath, site.line);
  const enclosing = resolveEnclosingFunction(source, siteIndex);
  if (!enclosing) {
    throw new Error(
      `${site.filePath}:${site.line}: sítio em trânsito sem função nomeada em volta` +
        " — não há elo pelo qual seguir a cadeia até o chamador.",
    );
  }
  const originParameter = site.origin as string;
  const parameterIndex = enclosing.parameterNames.indexOf(originParameter);
  if (parameterIndex === -1) {
    throw new Error(
      `${site.filePath}:${site.line}: a origem "${originParameter}" do sítio em trânsito não é` +
        ` parâmetro de "${enclosing.name}" — não há por onde seguir a cadeia até o chamador.`,
    );
  }
  const followed = followTransitChain(
    sources,
    {
      filePath: site.filePath,
      functionName: enclosing.name,
      originParameter,
      parameterIndex,
      // O sítio consome a origem como `<origem>.text`: é essa a única forma
      // que produz a categoria `text_in_transit_named_origin`.
      originAccess: "text_property",
      depth: 1,
      definitionParenIndex: enclosing.openParenIndex,
      fromFilePath: site.filePath,
      fromLine: site.line,
    },
    verifiedComposers,
  );
  return {
    site,
    transitFunction: enclosing.name,
    callers: followed.links
      .filter((link) => link.depth === 1)
      .map(toClassifiedCaller),
    excludedOccurrences: followed.excludedByDepth
      .filter((entry) => entry.depth === 1)
      .map((entry) => entry.occurrence),
    links: followed.links,
    roots: followed.roots,
    cycles: followed.cycles,
    excludedOccurrencesBeyondFirstLink: followed.excludedByDepth
      .filter((entry) => entry.depth > 1)
      .map((entry) => entry.occurrence),
  };
}

/**
 * Segue cada sítio `text_in_transit_named_origin` das fontes dadas até a raiz
 * de cada ramo, transitivamente — nenhum arquivo, função, chamador ou raiz é
 * escrito à mão.
 *
 * Recebe a árvore já em memória para que o percurso possa ser exercitado
 * sobre uma árvore montada — é assim que ciclo e raiz de entrada ficam
 * demonstráveis sem depender de a árvore real ter um exemplo de cada.
 */
export function discoverSendTextTransitChainsFromSources(
  rawSources: ReadonlyMap<string, string>,
  verifiedComposers: ReadonlySet<string>,
): SendTextTransitChain[] {
  const sources = new Map<string, string>();
  for (const [filePath, raw] of rawSources) {
    sources.set(filePath, blankComments(raw));
  }
  const chains: SendTextTransitChain[] = [];
  for (const [filePath, raw] of rawSources) {
    for (const site of classifySendTextSites(raw, filePath)) {
      if (site.category !== "text_in_transit_named_origin") continue;
      chains.push(followChainFromSite(sources, site, verifiedComposers));
    }
  }
  return chains;
}

/**
 * Segue cada sítio `text_in_transit_named_origin` de `srcRoot` até a raiz de
 * cada ramo, lendo a árvore inteira a cada execução. O percurso é transitivo
 * e para por raiz classificada, nunca por profundidade fixa (Goal041 / WU-02).
 */
export function discoverSendTextTransitChains(
  srcRoot: string,
  verifiedComposers: ReadonlySet<string>,
): SendTextTransitChain[] {
  const rawSources = new Map<string, string>();
  for (const filePath of listTypeScriptSources(srcRoot)) {
    rawSources.set(filePath, readFileSync(filePath, "utf8"));
  }
  return discoverSendTextTransitChainsFromSources(rawSources, verifiedComposers);
}
