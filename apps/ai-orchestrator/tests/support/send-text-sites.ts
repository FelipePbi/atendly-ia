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
function buildSendTextTokenPattern(): RegExp {
  const names = resolveSendTextCarrierMethodNames();
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
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
 * derruba a descoberta, lançando erro que nomeia `filePath` e a linha.
 */
export function classifySendTextSites(
  rawSource: string,
  filePath: string,
): ClassifiedSendTextSite[] {
  const source = blankComments(rawSource);
  const sites: ClassifiedSendTextSite[] = [];
  const sendTextTokenPattern = buildSendTextTokenPattern();
  let match: RegExpExecArray | null;
  while ((match = sendTextTokenPattern.exec(source))) {
    const line = lineAt(source, match.index);
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
          `${filePath}:${line}: chamada sendText(...) com forma de "text:" não reconhecida` +
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
  category: SendTextCallerCategory;
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

/** Uma cadeia de emissão: o sítio em trânsito, a função que o contém e os chamadores dela. */
export interface SendTextTransitChain {
  /** Elo 1: o sítio de `sendText` cujo texto já vinha de fora da função. */
  site: ClassifiedSendTextSite;
  /** A função que contém o sítio — é pelo nome dela que os chamadores são procurados. */
  transitFunction: string;
  /** Elo 2: cada chamada real da função de trânsito em `srcRoot`, classificada. */
  callers: ClassifiedSendTextCaller[];
  /** Ocorrências do mesmo nome que não são chamada, cada uma com o motivo da exclusão. */
  excludedOccurrences: ExcludedTransitOccurrence[];
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

/** Função (nome e parâmetros) mais interna que contém `index`, ou `undefined` no nível do módulo. */
function resolveEnclosingFunction(
  source: string,
  index: number,
): { name: string; parameterNames: string[] } | undefined {
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
  const name = wordEndingAt(source, openParenIndex);
  if (NOT_A_FUNCTION_NAME.has(name) || CONTROL_FLOW_KEYWORDS.has(name)) {
    return undefined;
  }
  return {
    name,
    parameterNames: parseParameterNames(
      source.slice(openParenIndex + 1, closeParenIndex),
    ),
  };
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
  const quoteMask = computeQuoteMask(source, source.length);
  const callers: ClassifiedSendTextCaller[] = [];
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
    callers.push(
      classifyTransitCaller(
        source,
        filePath,
        line,
        index,
        after,
        transitFunction,
        verifiedComposers,
      ),
    );
  }
  return { callers, excluded };
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

/**
 * Segue cada sítio `text_in_transit_named_origin` de `srcRoot` até seus
 * chamadores, lendo a árvore inteira a cada execução — nenhum arquivo, função
 * ou chamador é escrito à mão. A função de trânsito é a que contém o sítio, e
 * o nome dela sai da própria fonte; sítio cuja função não se resolve é
 * resíduo, nomeando arquivo e linha.
 */
export function discoverSendTextTransitChains(
  srcRoot: string,
  verifiedComposers: ReadonlySet<string>,
): SendTextTransitChain[] {
  const sources = new Map<string, string>();
  for (const filePath of listTypeScriptSources(srcRoot)) {
    sources.set(filePath, blankComments(readFileSync(filePath, "utf8")));
  }
  const chains: SendTextTransitChain[] = [];
  for (const site of discoverSendTextSites(srcRoot)) {
    if (site.category !== "text_in_transit_named_origin") continue;
    const source = sources.get(site.filePath);
    if (!source) {
      throw new Error(
        `${site.filePath}:${site.line}: sítio em trânsito fora da árvore lida (${srcRoot})`,
      );
    }
    const siteIndex = findCarrierCallIndexAtLine(
      source,
      site.filePath,
      site.line,
    );
    const enclosing = resolveEnclosingFunction(source, siteIndex);
    if (!enclosing) {
      throw new Error(
        `${site.filePath}:${site.line}: sítio em trânsito sem função nomeada em volta` +
          " — não há elo pelo qual seguir a cadeia até o chamador.",
      );
    }
    const callers: ClassifiedSendTextCaller[] = [];
    const excludedOccurrences: ExcludedTransitOccurrence[] = [];
    for (const [filePath, fileSource] of sources) {
      const scanned = classifyTransitCallersInSource(
        fileSource,
        filePath,
        enclosing.name,
        verifiedComposers,
      );
      callers.push(...scanned.callers);
      excludedOccurrences.push(...scanned.excluded);
    }
    chains.push({
      site,
      transitFunction: enclosing.name,
      callers,
      excludedOccurrences,
    });
  }
  return chains;
}
