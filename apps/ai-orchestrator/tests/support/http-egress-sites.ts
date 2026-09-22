import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Descobridor de todo sítio de egresso HTTP sob `apps/ai-orchestrator/src` e
 * `apps/bff/src` (Goal041 / WU-01). Lê as duas árvores inteiras a cada
 * execução — nenhum arquivo, cliente ou URL é escrito à mão. Sítio que não
 * cai em categoria reconhecida é resíduo e derruba a leitura, nomeando
 * arquivo e linha.
 *
 * O destino de cada sítio é resolvido pelo que o código usa para montar a
 * URL — variável de ambiente (`env.NOME`), campo de instância vindo de
 * parâmetro de construtor (`this.baseUrl`), ou parâmetro em trânsito
 * resolvido nos chamadores (como o `baseUrl` de `checkHealth`) — nunca por
 * nome de arquivo, de pasta ou de função. Nenhum arquivo é pulado: o
 * primitivo HTTP genérico (`fetchJson`, hoje em `lib/http.ts`) é ele próprio
 * um sítio classificado, na categoria de destino decidido pelo chamador.
 *
 * Categorias:
 * - `` `env_var_${nome}` ``: a URL resolve, direto ou por uma variável local
 *   atribuída no mesmo escopo, a exatamente um `env.<NOME>`.
 * - `` `env_vars_${nomes}` ``: como acima, mas dois ou mais `env.<NOME>`
 *   (ex.: base + path) contribuem para a URL, unidos por "_and_" em ordem
 *   alfabética.
 * - `` `constructor_base_url_${metodo}` ``: a URL vem de um campo de
 *   instância (`this.baseUrl`) atribuído por parâmetro de construtor — a
 *   classe é reaproveitada por múltiplas audiências, então nenhum `env.*`
 *   fixo aparece na função; o nome do método que faz a chamada distingue o
 *   sítio.
 * - `` `caller_resolved_base_url_via_${funcao}` ``: a função que contém o
 *   `fetch` recebe a base da URL como parâmetro (não a lê de `env.*` nem de
 *   `this.*`); o destino só existe nos chamadores dessa função, na mesma
 *   árvore — resolvido seguindo cada chamada e extraindo o `env.<NOME>`
 *   passado no argumento correspondente.
 * - `` `generic_egress_destination_decided_by_caller_${funcao}` ``: como
 *   acima, mas nenhum chamador existe no próprio arquivo — a URL é decidida
 *   por quem chamar a função, de qualquer ponto da árvore. É a categoria do
 *   egresso genérico, e ela é **fail-closed**: a função precisa ter zero
 *   chamadores nas duas árvores, ou todos os chamadores caem em categoria
 *   nomeada por esta mesma resolução. O nome da função é computado da
 *   declaração que contém o `fetch`, nunca escrito à mão.
 * - `product_prose_to_client_number`: o corpo da requisição carrega, na
 *   mesma função construtora de corpo, uma propriedade `text:` atribuída de
 *   `<param>.text` e uma propriedade de destinatário (`to`/`number`/
 *   `recipient`/`phone`) atribuída de `<param>.to` — prosa do produto para o
 *   número da cliente, category dedicada por ser o único sítio que entrega
 *   texto de conversa a um canal externo (D-050 trata esse texto à parte de
 *   URL/binário).
 */
export type HttpEgressSiteCategory =
  | `env_var_${string}`
  | `env_vars_${string}`
  | `constructor_base_url_${string}`
  | `caller_resolved_base_url_via_${string}`
  | `generic_egress_destination_decided_by_caller_${string}`
  | "product_prose_to_client_number";

export interface ClassifiedHttpEgressSite {
  filePath: string;
  line: number;
  category: HttpEgressSiteCategory;
  reason: string;
}

/** Por que uma ocorrência textual de `fetch(` não é uma chamada de rede real. */
export type HttpEgressExclusionReason = "method_call_not_global_fetch";

export interface ExcludedHttpEgressOccurrence {
  filePath: string;
  line: number;
  reason: HttpEgressExclusionReason;
}

export interface HttpEgressDiscovery {
  sites: ClassifiedHttpEgressSite[];
  excluded: ExcludedHttpEgressOccurrence[];
  /**
   * Chamadores das funções classificadas na categoria de egresso genérico,
   * computados a cada execução — o nome de cada primitivo sai da árvore
   * (ver `genericEgressPrimitives`), nunca de uma lista escrita à mão.
   * Vazio hoje: nenhum código das duas árvores chama `fetchJson`. Se algum
   * aparecer, é classificado com a mesma lógica de resolução de destino;
   * sem resolver, é resíduo — a categoria genérica nunca aceita chamador
   * silencioso.
   */
  genericEgressCallers: ClassifiedHttpEgressSite[];
  /**
   * Os mesmos chamadores, separados pelo primitivo a que pertencem — o
   * motivo escrito de um sítio genérico cita o número deste primitivo,
   * nunca o total da árvore. Cada arquivo das duas árvores é varrido pelo
   * nome da declaração e, quando um import com alias liga a função a outro
   * nome local, também por esse nome. A chave de cada entrada é o sítio da
   * declaração (`filePath` + `line`), nunca só `functionName`: dois
   * primitivos homônimos declarados em arquivos diferentes são dois sítios
   * distintos, e uma chave por nome apagaria a varredura de um deles.
   */
  genericEgressCallersByPrimitive: {
    filePath: string;
    line: number;
    functionName: string;
    callers: ClassifiedHttpEgressSite[];
  }[];
  /**
   * Os sítios de egresso genérico da árvore (a função cujo `fetch` tem
   * destino decidido por quem chamar), com o nome computado da declaração
   * que os contém. É a lista sobre a qual a regra fail-closed roda.
   */
  genericEgressPrimitives: { filePath: string; line: number; functionName: string }[];
}

/* =========================================================================
 * Utilitários de árvore e de fonte (mesmo padrão de send-text-sites.ts,
 * duplicados aqui de propósito — este módulo não importa daquele para não
 * acoplar duas Work Units do mesmo Goal que tocam arquivos em paralelo).
 * ========================================================================= */

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

/** Apaga comentários de `source` preservando índices e quebras de linha. */
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

/** Divide o conteúdo de uma lista (args de chamada, ou objeto) em itens de topo, ignorando delimitadores/aspas aninhados. */
function splitTopLevelItems(content: string): string[] {
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

/** Primeiro caractere não-espaço depois de `index`, ou `undefined` no fim do arquivo. */
function firstNonWhitespaceCharAfter(source: string, index: number): string | undefined {
  let i = index + 1;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  return i < source.length ? source[i] : undefined;
}

/** Primeiro caractere não-espaço, andando para trás a partir de (excluindo) `index`. */
function firstNonWhitespaceCharBefore(source: string, index: number): string | undefined {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  return i >= 0 ? source[i] : undefined;
}

/** Modificadores conhecidos que podem preceder o nome de um método declarado, sem indicar chamada. */
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

/** true se o identificador em `index` estiver em posição de declaração/implementação de membro, não de chamada — mesmo critério de send-text-sites.ts. */
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
  const closeParenIndex = findMatchingDelimiterEnd(source, openParenIndex, "(", ")");
  const afterParams = firstNonWhitespaceCharAfter(source, closeParenIndex);
  return afterParams === ":" || afterParams === "{";
}

/** Palavras-chave de controle de fluxo cujo "(...)" é seguido de "{" sem ser corpo de função. */
const CONTROL_FLOW_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "with"]);

/** Palavras que `wordEndingAt` pode devolver antes de um "(" sem que haja função nomeada ali. */
const NOT_A_FUNCTION_NAME = new Set(["", "function", "return", "await", "new"]);

/** Modificadores de parâmetro de construtor, que precedem o nome. */
const PARAMETER_MODIFIER = /^(?:public|private|protected|readonly)\s+/;

/**
 * Para cada índice de `source` até `uptoIndex` (exclusivo), o caractere de
 * aspas que abriu a região em que o índice está, ou `undefined` fora de
 * aspas. É a mesma varredura de `computeQuoteMask`, guardando **qual**
 * delimitador abriu a região: quem precisa distinguir template literal com
 * crase de string comum não pode decidir isso a partir de um booleano.
 */
function computeQuoteOpenerMask(source: string, uptoIndex: number): (string | undefined)[] {
  const mask: (string | undefined)[] = new Array<string | undefined>(uptoIndex).fill(undefined);
  let quote: string | undefined;
  for (let i = 0; i < uptoIndex; i += 1) {
    const char = source[i];
    if (quote) {
      mask[i] = quote;
      if (char === "\\") {
        const escaped = quote;
        i += 1;
        if (i < uptoIndex) mask[i] = escaped;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      mask[i] = char;
    }
  }
  return mask;
}

/** Máscara "dentro de aspas/crase" para cada índice de `source` até `uptoIndex` (exclusivo). */
function computeQuoteMask(source: string, uptoIndex: number): boolean[] {
  return computeQuoteOpenerMask(source, uptoIndex).map((opener) => opener !== undefined);
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
  throw new Error(`delimitador "${closeChar}" sem abertura correspondente até o índice ${closeIndex}`);
}

/** Palavra (identificador) que termina em `index` (exclusivo), ignorando espaço antes. */
function wordEndingAt(source: string, index: number): string {
  let end = index;
  while (end > 0 && /\s/.test(source[end - 1])) end -= 1;
  let start = end;
  while (start > 0 && /[\w$]/.test(source[start - 1])) start -= 1;
  return source.slice(start, end);
}

/** true se o "{" em `braceIndex` abre corpo de função (declaração, método ou arrow), não bloco de controle. */
function isFunctionBodyOpenBrace(source: string, quoteMask: boolean[], braceIndex: number): boolean {
  let i = braceIndex - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  if (i < 0) return false;

  if (source[i] === ">" && source[i - 1] === "=") return true;

  if (source[i] === ")") {
    const openParenIndex = findMatchingDelimiterStart(source, quoteMask, i, "(", ")");
    return !CONTROL_FLOW_KEYWORDS.has(wordEndingAt(source, openParenIndex));
  }

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
      const openParenIndex = findMatchingDelimiterStart(source, quoteMask, k, "(", ")");
      return !CONTROL_FLOW_KEYWORDS.has(wordEndingAt(source, openParenIndex));
    }
    if (/[\w$.\s|&?]/.test(char)) continue;
    return false;
  }
  return false;
}

/** Início (logo após o "{") do corpo da função mais interna que contém `index`, ou `0` no nível superior do módulo. */
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

/** Índice do ")" que fecha a lista de parâmetros da função cujo corpo abre em `braceIndex`. */
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
  for (const parameter of splitTopLevelItems(paramsText)) {
    let text = parameter.trim();
    while (PARAMETER_MODIFIER.test(text)) text = text.replace(PARAMETER_MODIFIER, "").trim();
    if (text.startsWith("...")) text = text.slice(3).trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      const closeChar = text.startsWith("{") ? "}" : "]";
      const closeIndex = findMatchingDelimiterEnd(text, 0, text[0], closeChar);
      for (const entry of splitTopLevelItems(text.slice(1, closeIndex))) {
        const bound = entry.match(/^([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/);
        if (bound) names.push(bound[2] ?? bound[1]);
      }
      continue;
    }
    const named = text.match(/^([A-Za-z_$][\w$]*)/);
    if (named) names.push(named[1]);
  }
  return names;
}

/** Se `index` cair logo depois de `<...>` (parâmetro de tipo genérico, ex.: `perform<T>(`), devolve o índice do "<" que abre — para que `wordEndingAt` ache o nome do método, não uma string vazia. */
function skipGenericParametersBackward(
  source: string,
  quoteMask: boolean[],
  index: number,
): number {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  if (i < 0 || source[i] !== ">") return index;
  let depth = 0;
  for (let j = i; j >= 0; j -= 1) {
    if (quoteMask[j]) continue;
    const char = source[j];
    if (char === ">") depth += 1;
    else if (char === "<") {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return index;
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
  const closeParenIndex = findParameterListCloseParen(source, quoteMask, braceIndex);
  if (closeParenIndex === undefined) return undefined;
  const openParenIndex = findMatchingDelimiterStart(source, quoteMask, closeParenIndex, "(", ")");
  const name = wordEndingAt(source, skipGenericParametersBackward(source, quoteMask, openParenIndex));
  if (NOT_A_FUNCTION_NAME.has(name) || CONTROL_FLOW_KEYWORDS.has(name)) return undefined;
  return {
    name,
    parameterNames: parseParameterNames(source.slice(openParenIndex + 1, closeParenIndex)),
  };
}

/* =========================================================================
 * Resolução de destino (env var / base URL de construtor / parâmetro em
 * trânsito resolvido nos chamadores) — núcleo desta Work Unit.
 * ========================================================================= */

/** Nomes de `env.<NOME>` referenciados diretamente em `text`, únicos e ordenados. */
function matchEnvVars(text: string): string[] {
  const names = new Set<string>();
  const pattern = /\benv\.([A-Z][A-Z0-9_]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) names.add(match[1]);
  return Array.from(names).sort();
}

/** Identificadores candidatos a resolver a URL: o próprio argumento (se for um identificador solto) ou os nomes interpolados em um template literal (`${nome...}`). */
function extractLeadingIdentifiers(urlArgText: string): string[] {
  const trimmed = urlArgText.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return [trimmed];
  const identifiers = new Set<string>();
  const pattern = /\$\{\s*([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(trimmed))) identifiers.add(match[1]);
  return Array.from(identifiers);
}

/** Extrai o valor de uma propriedade `<nome>: <expressão>` de dentro do texto (sem chaves) de um objeto, ou `undefined` se a propriedade não existir. */
function findObjectPropertyExpression(objectBody: string, propertyName: string): string | undefined {
  const pattern = new RegExp(`^${propertyName}\\s*:\\s*([\\s\\S]+)$`);
  for (const property of splitTopLevelItems(objectBody)) {
    const match = property.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}

/** Corpo da última declaração `const <identifier> = <expressão>;` que começa antes de `beforeIndex` em `source`, ou `undefined` se não houver. */
function findNearestPrecedingDeclarationRhs(
  source: string,
  beforeIndex: number,
  identifier: string,
): string | undefined {
  const pattern = new RegExp(`\\b(?:const|let)\\s+${identifier}\\s*=\\s*`, "g");
  let match: RegExpExecArray | null;
  let rhsStart: number | undefined;
  while ((match = pattern.exec(source))) {
    if (match.index >= beforeIndex) break;
    rhsStart = match.index + match[0].length;
  }
  if (rhsStart === undefined) return undefined;
  return extractStatementRhs(source, rhsStart);
}

/** Texto de uma expressão de atribuição a partir de `start`, até o ";" de topo (fora de `()`/`[]`/`{}` e de aspas/crase). */
function extractStatementRhs(source: string, start: number): string {
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
    if (char === ";" && depth === 0) return source.slice(start, i);
  }
  return source.slice(start);
}

interface DestinationResolution {
  envVars: string[];
  constructorFieldReference: boolean;
  /** Parâmetros da função que contém o `fetch` dos quais a URL depende, sem resolver dentro da própria função. */
  unresolvedParams: string[];
}

/** Resolve o destino de `urlArgText` (o primeiro argumento de uma chamada de rede) a `env.<NOME>`, a campo de instância, ou a parâmetro não resolvido localmente. */
function resolveDestination(
  source: string,
  callIndex: number,
  urlArgText: string,
  parameterNames: string[],
): DestinationResolution {
  const direct = matchEnvVars(urlArgText);
  if (direct.length > 0) {
    return { envVars: direct, constructorFieldReference: false, unresolvedParams: [] };
  }

  const envVars = new Set<string>();
  let constructorFieldReference = false;
  const unresolvedParams = new Set<string>();

  for (const identifier of extractLeadingIdentifiers(urlArgText)) {
    if (parameterNames.includes(identifier)) {
      unresolvedParams.add(identifier);
      continue;
    }
    const rhs = findNearestPrecedingDeclarationRhs(source, callIndex, identifier);
    if (rhs === undefined) {
      unresolvedParams.add(identifier);
      continue;
    }
    const rhsEnvVars = matchEnvVars(rhs);
    if (rhsEnvVars.length > 0) {
      rhsEnvVars.forEach((name) => envVars.add(name));
      continue;
    }
    if (/\bthis\.[A-Za-z_$][\w$]*\b/.test(rhs)) {
      constructorFieldReference = true;
      continue;
    }
    const mentionedParam = parameterNames.find((name) => new RegExp(`\\b${name}\\b`).test(rhs));
    if (mentionedParam) {
      unresolvedParams.add(mentionedParam);
      continue;
    }
    unresolvedParams.add(identifier);
  }

  return {
    envVars: Array.from(envVars).sort(),
    constructorFieldReference,
    unresolvedParams: Array.from(unresolvedParams),
  };
}

/** Uma chamada real de uma função: onde ela está, e os textos de argumento de topo já separados. */
interface RealCallSite {
  index: number;
  line: number;
  args: string[];
}

/** Chamadas reais (não a própria declaração) de `functionName` em `source`, com posição e argumentos. */
function findRealCallSites(source: string, functionName: string): RealCallSite[] {
  const pattern = new RegExp(`\\b${functionName}\\(`, "g");
  const calls: RealCallSite[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const openParenIndex = match.index + match[0].length - 1;
    if (isMemberDeclarationOrImplementationPosition(source, match.index, openParenIndex)) continue;
    const closeParenIndex = findMatchingDelimiterEnd(source, openParenIndex, "(", ")");
    calls.push({
      index: match.index,
      line: lineAt(source, match.index),
      args: splitTopLevelItems(source.slice(openParenIndex + 1, closeParenIndex)),
    });
  }
  return calls;
}

/** Os argumentos de cada chamada real de `functionName` em `source` — a mesma varredura de `findRealCallSites`, sem a posição. */
function findRealCallArguments(source: string, functionName: string): string[][] {
  return findRealCallSites(source, functionName).map((call) => call.args);
}

/** Resolve `env.<NOME>` a partir dos argumentos passados, nos chamadores reais de `functionName` em `source`, para as posições de `paramPositions`. */
function resolveViaCallers(
  source: string,
  functionName: string,
  paramPositions: Map<string, number>,
): string[] {
  const envVars = new Set<string>();
  for (const args of findRealCallArguments(source, functionName)) {
    for (const position of paramPositions.values()) {
      const argExpression = args[position];
      if (!argExpression) continue;
      matchEnvVars(argExpression).forEach((name) => envVars.add(name));
    }
  }
  return Array.from(envVars).sort();
}

/* =========================================================================
 * Conteúdo do corpo da requisição: sítio que carrega prosa do produto ao
 * número da cliente é categoria própria, verificada antes da resolução de
 * destino — o que importa aqui é a FORMA do payload (uma propriedade
 * `text:` pareada com uma propriedade de destinatário), nunca o arquivo.
 * ========================================================================= */

const RECIPIENT_PROPERTY_PATTERN =
  /\b(?:to|number|recipient|phone)\s*:\s*[A-Za-z_$][\w$]*\.to\b/;
const TEXT_PROPERTY_PATTERN = /\btext\s*:\s*[A-Za-z_$][\w$]*\.text\b/;

/** true se `objectBody` (conteúdo de um objeto, sem chaves) tiver, ao mesmo tempo, uma propriedade `text:` e uma de destinatário, no formato acima. */
function hasTextToRecipientShape(objectBody: string): boolean {
  return TEXT_PROPERTY_PATTERN.test(objectBody) && RECIPIENT_PROPERTY_PATTERN.test(objectBody);
}

/** Valor da propriedade `body:` dentro do texto (sem chaves) de um objeto de opções de `fetch`, ou `undefined` se não houver. */
function findBodyPropertyExpression(optionsObjectBody: string): string | undefined {
  return findObjectPropertyExpression(optionsObjectBody, "body");
}

/**
 * true se o sítio de `fetch` em `callIndex` envia, no corpo, uma prosa do
 * produto pareada com o número da cliente: `body:` é `JSON.stringify(<expr>)`
 * e `<expr>` — direto (objeto inline) ou por uma função construtora de corpo
 * no mesmo arquivo — declara `text: <param>.text` e uma propriedade de
 * destinatário `<param>.to`.
 */
function siteCarriesProductProseToClientNumber(
  source: string,
  callIndex: number,
  callArgsText: string,
): boolean {
  const callArgs = splitTopLevelItems(callArgsText);
  const optionsArg = callArgs[1];
  if (!optionsArg) return false;
  const optionsMatch = optionsArg.match(/^\{([\s\S]*)\}$/);
  if (!optionsMatch) return false;
  const bodyExpression = findBodyPropertyExpression(optionsMatch[1]);
  if (!bodyExpression) return false;
  const stringifyMatch = bodyExpression.match(/^JSON\.stringify\(([\s\S]+)\)$/);
  const inner = stringifyMatch ? stringifyMatch[1].trim() : bodyExpression;

  const inlineObjectMatch = inner.match(/^\{([\s\S]*)\}$/);
  if (inlineObjectMatch) return hasTextToRecipientShape(inlineObjectMatch[1]);

  const builderCallMatch = inner.match(/^([A-Za-z_$][\w$]*)\(\s*[A-Za-z_$][\w$]*\s*\)$/);
  if (!builderCallMatch) return false;
  const builderName = builderCallMatch[1];
  const declarationPattern = new RegExp(`\\bfunction\\s+${builderName}\\s*\\(`);
  const declarationMatch = declarationPattern.exec(source);
  if (!declarationMatch) return false;
  void callIndex;
  const braceIndex = source.indexOf("{", declarationMatch.index);
  if (braceIndex === -1) return false;
  const braceEnd = findMatchingDelimiterEnd(source, braceIndex, "{", "}");
  return hasTextToRecipientShape(source.slice(braceIndex + 1, braceEnd));
}

/* =========================================================================
 * Sítios de `fetch` crus (candidatura por forma computada).
 * ========================================================================= */

interface RawFetchOccurrence {
  index: number;
  line: number;
}

/** Toda ocorrência de `fetch(` em `source` (comentários já apagados), separando chamada real de ocorrência excluída (ex.: `algumObjeto.fetch(...)`, que não é o `fetch` global). */
function findRawFetchOccurrences(
  source: string,
  filePath: string,
): { calls: RawFetchOccurrence[]; excluded: ExcludedHttpEgressOccurrence[] } {
  const calls: RawFetchOccurrence[] = [];
  const excluded: ExcludedHttpEgressOccurrence[] = [];
  const pattern = /\bfetch\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const line = lineAt(source, match.index);
    if (firstNonWhitespaceCharBefore(source, match.index) === ".") {
      excluded.push({ filePath, line, reason: "method_call_not_global_fetch" });
      continue;
    }
    calls.push({ index: match.index, line });
  }
  return { calls, excluded };
}

/** Classifica um sítio já localizado (chamada de `fetch(...)` ou de `fetchJson(...)`), resolvendo destino e, se aplicável, prosa do produto. */
function classifySite(
  source: string,
  filePath: string,
  callToken: string,
  callIndex: number,
  line: number,
): ClassifiedHttpEgressSite {
  const openParenIndex = callIndex + callToken.length - 1;
  const closeParenIndex = findMatchingDelimiterEnd(source, openParenIndex, "(", ")");
  const callArgsText = source.slice(openParenIndex + 1, closeParenIndex);
  const callArgs = splitTopLevelItems(callArgsText);
  const urlArgText = callArgs[0] ?? "";

  if (siteCarriesProductProseToClientNumber(source, callIndex, callArgsText)) {
    return {
      filePath,
      line,
      category: "product_prose_to_client_number",
      reason:
        "corpo da requisição declara text: <param>.text pareado com destinatário <param>.to — prosa do produto entregue ao número da cliente",
    };
  }

  const enclosing = resolveEnclosingFunction(source, callIndex);
  const parameterNames = enclosing?.parameterNames ?? [];
  const destination = resolveDestination(source, callIndex, urlArgText, parameterNames);

  if (destination.envVars.length === 1) {
    return {
      filePath,
      line,
      category: `env_var_${destination.envVars[0]}`,
      reason: `destino resolvido de env.${destination.envVars[0]}`,
    };
  }
  if (destination.envVars.length > 1) {
    return {
      filePath,
      line,
      category: `env_vars_${destination.envVars.join("_and_")}`,
      reason: `destino resolvido de env.${destination.envVars.join(" e env.")}`,
    };
  }
  if (destination.constructorFieldReference) {
    const methodName = enclosing?.name ?? "<função anônima>";
    return {
      filePath,
      line,
      category: `constructor_base_url_${methodName}`,
      reason: `destino resolvido de this.baseUrl (campo de instância vindo de parâmetro de construtor), no método "${methodName}"`,
    };
  }
  if (destination.unresolvedParams.length > 0 && enclosing) {
    const positions = new Map<string, number>();
    destination.unresolvedParams.forEach((name) => {
      const position = enclosing.parameterNames.indexOf(name);
      if (position !== -1) positions.set(name, position);
    });
    if (positions.size > 0) {
      const callerEnvVars = resolveViaCallers(source, enclosing.name, positions);
      if (callerEnvVars.length > 0) {
        return {
          filePath,
          line,
          category: `caller_resolved_base_url_via_${enclosing.name}`,
          reason: `parâmetro(s) "${destination.unresolvedParams.join(", ")}" de "${enclosing.name}" não resolvem na própria função; resolvidos nos chamadores para env.${callerEnvVars.join(" e env.")}`,
        };
      }
      // A URL é um parâmetro da função e nenhum chamador do próprio arquivo
      // a resolve: o destino é decidido por quem chamar, de qualquer lugar
      // da árvore. Egresso genérico — categoria fail-closed, cujos
      // chamadores são varridos nas duas árvores por
      // `discoverHttpEgressSites`.
      return {
        filePath,
        line,
        category: `generic_egress_destination_decided_by_caller_${enclosing.name}`,
        reason: `a URL vem do(s) parâmetro(s) "${Array.from(positions.keys()).join(", ")}" de "${enclosing.name}" e nenhum chamador no mesmo arquivo a resolve — destino decidido por quem chamar; a categoria exige zero chamadores na árvore ou todos os chamadores em categoria nomeada`,
      };
    }
  }

  throw new Error(
    `${filePath}:${line}: sítio de egresso HTTP sem categoria — a URL "${urlArgText}" não resolve a env.<NOME>, a this.<campo> nem a parâmetro resolvível nos chamadores.`,
  );
}

/** Classifica todo sítio de `fetch(...)` global de `rawSource`. Sítio sem categoria derruba a leitura, nomeando arquivo e linha. */
export function classifyHttpEgressSitesInSource(
  rawSource: string,
  filePath: string,
): { sites: ClassifiedHttpEgressSite[]; excluded: ExcludedHttpEgressOccurrence[] } {
  const source = blankComments(rawSource);
  const { calls, excluded } = findRawFetchOccurrences(source, filePath);
  const sites = calls.map((call) => classifySite(source, filePath, "fetch(", call.index, call.line));
  return { sites, excluded };
}

/* =========================================================================
 * Egresso genérico — fail-closed pelos chamadores.
 * ========================================================================= */

/** Prefixo da categoria de egresso genérico; o que vem depois dele é o nome da função computado da árvore. */
const GENERIC_EGRESS_CATEGORY_PREFIX = "generic_egress_destination_decided_by_caller_";

/** Nome da função de um sítio já classificado como egresso genérico, ou `undefined` se ele for de outra categoria. */
function genericEgressFunctionName(site: ClassifiedHttpEgressSite): string | undefined {
  return site.category.startsWith(GENERIC_EGRESS_CATEGORY_PREFIX)
    ? site.category.slice(GENERIC_EGRESS_CATEGORY_PREFIX.length)
    : undefined;
}

/** Toda chamada real (nunca a própria declaração) das funções de `functionNames` em `rawSource`, classificada pela mesma resolução de destino usada para `fetch` cru. */
function classifyGenericEgressCallersInSource(
  rawSource: string,
  filePath: string,
  functionNames: string[],
): ClassifiedHttpEgressSite[] {
  const source = blankComments(rawSource);
  const sites: ClassifiedHttpEgressSite[] = [];
  for (const functionName of functionNames) {
    const pattern = new RegExp(`\\b${functionName}\\(`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      const openParenIndex = match.index + match[0].length - 1;
      if (isMemberDeclarationOrImplementationPosition(source, match.index, openParenIndex)) continue;
      const line = lineAt(source, match.index);
      sites.push(classifySite(source, filePath, `${functionName}(`, match.index, line));
    }
  }
  return sites;
}

/* =========================================================================
 * Descoberta sobre as duas árvores.
 * ========================================================================= */

/**
 * Descobre e classifica todo sítio de egresso HTTP sob `aiOrchestratorSrcRoot`
 * e `bffSrcRoot`, lendo as duas árvores a cada execução. Nenhum arquivo é
 * pulado e nenhum nome de arquivo, pasta ou função aparece como allowlist:
 * o `fetch` interno do primitivo genérico é classificado como qualquer
 * outro, na categoria de destino decidido pelo chamador.
 *
 * A passada é dupla, porque a segunda depende do resultado da primeira:
 *
 * 1. classifica todo sítio de `fetch(` das duas árvores. Sítio sem
 *    categoria derruba a descoberta, nomeando arquivo e linha;
 * 2. para cada função classificada como egresso genérico na passada 1 (o
 *    nome sai da declaração, não de uma lista), varre as duas árvores atrás
 *    de chamadores reais e classifica cada um pela mesma resolução de
 *    destino. Zero chamadores é permitido; chamador que não resolve é
 *    resíduo e derruba a descoberta — é o lado fail-closed da categoria.
 *    Chamador que ele próprio repassa a URL recebida vira um primitivo
 *    genérico novo, e a varredura continua até ponto fixo, com conjunto de
 *    nomes já visitados — repasse em cadeia não escapa, e ciclo não trava.
 */
export function discoverHttpEgressSites(
  aiOrchestratorSrcRoot: string,
  bffSrcRoot: string,
): HttpEgressDiscovery {
  const sites: ClassifiedHttpEgressSite[] = [];
  const excluded: ExcludedHttpEgressOccurrence[] = [];
  const genericEgressCallers: ClassifiedHttpEgressSite[] = [];

  const sources: { filePath: string; rawSource: string }[] = [];
  for (const root of [aiOrchestratorSrcRoot, bffSrcRoot]) {
    for (const filePath of listTypeScriptSources(root)) {
      sources.push({ filePath, rawSource: readFileSync(filePath, "utf8") });
    }
  }

  for (const { filePath, rawSource } of sources) {
    const classified = classifyHttpEgressSitesInSource(rawSource, filePath);
    sites.push(...classified.sites);
    excluded.push(...classified.excluded);
  }

  const genericEgressPrimitives: HttpEgressDiscovery["genericEgressPrimitives"] = [];
  const genericEgressCallersByPrimitive: HttpEgressDiscovery["genericEgressCallersByPrimitive"] = [];
  const pendingPrimitives: { filePath: string; line: number; functionName: string }[] = [];

  /** Registra um sítio genérico como primitivo a varrer, se o nome ainda não tiver sido varrido. */
  const enqueuePrimitive = (site: ClassifiedHttpEgressSite): void => {
    const functionName = genericEgressFunctionName(site);
    if (functionName === undefined) return;
    const primitive = { filePath: site.filePath, line: site.line, functionName };
    genericEgressPrimitives.push(primitive);
    pendingPrimitives.push(primitive);
  };

  sites.forEach(enqueuePrimitive);

  const allSources = sources.map(({ filePath, rawSource }) => ({ filePath, source: rawSource }));
  const sourcesByPath = new Map(sources.map(({ filePath, rawSource }) => [filePath, rawSource]));

  // Chave pela DECLARAÇÃO (arquivo + linha), não pelo nome: dois primitivos
  // homônimos em arquivos diferentes são dois sítios distintos, e uma chave
  // por nome faz o segundo ser pulado inteiro — a varredura de alias nunca
  // roda para ele, e o motivo escrito no relatório afirma uma varredura que
  // não aconteceu.
  const scannedPrimitiveDeclarations = new Set<string>();
  while (pendingPrimitives.length > 0) {
    const primitive = pendingPrimitives.shift() as { filePath: string; line: number; functionName: string };
    const { functionName } = primitive;
    const declarationKey = `${primitive.filePath}:${primitive.line}`;
    if (scannedPrimitiveDeclarations.has(declarationKey)) continue;
    scannedPrimitiveDeclarations.add(declarationKey);

    // O nome pelo qual outro arquivo chama o primitivo pode não ser o nome
    // da declaração: um import com alias liga a mesma função a outro nome
    // local. Varrer só o nome solto deixaria esse chamador invisível e o
    // motivo escrito afirmaria zero chamador onde existe um.
    const primitiveSource = sourcesByPath.get(primitive.filePath);
    const aliasNamesByFilePath = new Map<string, Set<string>>();
    if (primitiveSource !== undefined) {
      const exportBindings = resolveModuleExportBindings(
        primitiveSource,
        functionName,
        primitive.filePath,
        primitive.line,
      );
      for (const binding of exportBindings) {
        for (const callerBinding of findCrossFileCallerBindings(
          primitive.filePath,
          functionName,
          binding,
          allSources,
          sourcesByPath,
        )) {
          if (callerBinding.localName === functionName) continue;
          const names = aliasNamesByFilePath.get(callerBinding.filePath) ?? new Set<string>();
          names.add(callerBinding.localName);
          aliasNamesByFilePath.set(callerBinding.filePath, names);
        }
      }
    }

    const callersOfPrimitive: ClassifiedHttpEgressSite[] = [];
    for (const { filePath, rawSource } of sources) {
      const names = [functionName, ...(aliasNamesByFilePath.get(filePath) ?? [])];
      const callers = classifyGenericEgressCallersInSource(rawSource, filePath, names);
      callersOfPrimitive.push(...callers);
      genericEgressCallers.push(...callers);
      callers.forEach(enqueuePrimitive);
    }
    genericEgressCallersByPrimitive.push({
      filePath: primitive.filePath,
      line: primitive.line,
      functionName,
      callers: callersOfPrimitive,
    });
  }

  return {
    sites,
    excluded,
    genericEgressCallers,
    genericEgressCallersByPrimitive,
    genericEgressPrimitives,
  };
}

/**
 * O valor que atravessa a fronteira de serviço (Goal042 / §3, lado
 * TypeScript).
 *
 * O produto não entrega texto ao WhatsApp: entrega ao serviço Go, e o
 * encontro entre os dois é **um valor** — o caminho da rota de envio de
 * texto. Cada lado lê esse valor na sua própria língua: o guard Go lê
 * `apps/ai-orchestrator/.env.example` como `CHAVE=VALOR` e confere que o
 * valor é rota registrada; daqui, o default declarado em
 * `src/config/env.ts` é computado do próprio schema e comparado ao
 * `.env.example`.
 *
 * Nada aqui parseia Go, e o valor não é escrito dentro de teste nenhum:
 * ele é lido das duas fontes. Chave ausente em qualquer das duas
 * **reprova** — nunca pula —, e divergência entre as duas reprova.
 */
export interface BoundaryValueReading {
  /** Caminho do arquivo de onde o valor foi lido. */
  filePath: string;
  /** Linha, 1-based, em que a chave aparece. */
  line: number;
  /** O valor lido, já sem aspas. */
  value: string;
}

/** As duas leituras do mesmo valor, uma por fonte. */
export interface BoundaryValueCrossing {
  key: string;
  envSchema: BoundaryValueReading;
  envExample: BoundaryValueReading;
}

/**
 * Lê o default declarado para `key` no schema de ambiente. A forma
 * reconhecida é a única que o schema usa: a chave, dois-pontos, uma
 * chamada de helper e um literal de string como argumento. O nome do
 * helper não é comparado com lista nenhuma — o que importa é a forma.
 */
export function readEnvSchemaDefault(envSchemaPath: string, key: string): BoundaryValueReading {
  const source = readFileSync(envSchemaPath, "utf8");
  // A forma é: início de linha, a chave, dois-pontos, um identificador de
  // helper, e entre parênteses um único literal de string. As três aspas
  // são alternativas escritas à parte porque retrovisor em regex de
  // linha única não acrescenta nada aqui e atrapalha a leitura.
  const quoted = ["\"((?:\\\\.|[^\"\\\\])*)\"", "'((?:\\\\.|[^'\\\\])*)'", "`((?:\\\\.|[^`\\\\])*)`"];
  const declaration = new RegExp(
    "^[ \\t]*" +
      key +
      ":[ \\t]*[A-Za-z_$][\\w$]*\\([ \\t]*(?:" +
      quoted.join("|") +
      ")[ \\t]*\\)",
    "u",
  );
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const match = declaration.exec(lines[index] as string);
    if (match === null) continue;
    const captured = [match[1], match[2], match[3]].find((group) => group !== undefined);
    if (captured === undefined) continue;
    return { filePath: envSchemaPath, line: index + 1, value: captured };
  }
  throw new Error(
    `${envSchemaPath}: ${key} não é declarada com default literal no schema de ambiente, então o valor que atravessa a fronteira não pode ser computado deste lado`,
  );
}

/** Lê o valor de `key` de um arquivo `CHAVE=VALOR`. Chave ausente reprova. */
export function readEnvFileValue(envFilePath: string, key: string): BoundaryValueReading {
  const source = readFileSync(envFilePath, "utf8");
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] as string).trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    if (trimmed.slice(0, separator).trim() !== key) continue;
    return {
      filePath: envFilePath,
      line: index + 1,
      value: unquoteEnvValue(trimmed.slice(separator + 1).trim()),
    };
  }
  throw new Error(
    `${envFilePath}: não define ${key}, então o valor que atravessa a fronteira não pode ser lido`,
  );
}

/** Tira as aspas de um valor de arquivo de ambiente, quando houver. */
function unquoteEnvValue(value: string): string {
  if (value.length < 2) return value;
  const first = value[0] as string;
  const last = value[value.length - 1] as string;
  if (first !== last || (first !== '"' && first !== "'")) return value;
  return value.slice(1, -1);
}

/**
 * Computa as duas leituras do valor de fronteira e **reprova** quando
 * elas divergem, nomeando os dois arquivos e as duas linhas. O valor em
 * si não é escrito em lugar nenhum: ele vem das fontes.
 */
export function computeBoundaryValueCrossing(
  envSchemaPath: string,
  envExamplePath: string,
  key: string,
): BoundaryValueCrossing {
  const envSchema = readEnvSchemaDefault(envSchemaPath, key);
  const envExample = readEnvFileValue(envExamplePath, key);
  if (envSchema.value !== envExample.value) {
    throw new Error(
      `${key} diverge entre os dois lados da fronteira: ${envSchema.filePath}:${envSchema.line} declara o default ${JSON.stringify(envSchema.value)} e ${envExample.filePath}:${envExample.line} traz ${JSON.stringify(envExample.value)}`,
    );
  }
  return { key, envSchema, envExample };
}

/* =========================================================================
 * Toda requisição das duas árvores cujo destino é o serviço Go (Goal043 /
 * WU-01) — método e expressão de caminho, não só o egresso bruto.
 *
 * Reusa `discoverHttpEgressSites` para os sítios de `fetch(` cru (resíduo
 * zero já garantido ali) e estende a mesma resolução de destino por forma
 * para dois casos que o descobridor de egresso não alcança sozinho:
 *
 * 1. `fetch(` cru cuja URL é `<helper>(<base>, <caminho>)` — separa qual dos
 *    dois argumentos é a base (resolve a uma das chaves de ambiente do
 *    serviço Go) e qual é o caminho, e computa o valor do caminho quando ele
 *    vem de `env.<NOME>`, pela declaração em `config/env.ts` (nunca digitado
 *    aqui).
 * 2. Requisição feita por um cliente HTTP interno (`InternalHttpClient` hoje,
 *    mas o nome da classe é lido da declaração, nunca escrito à mão): o sítio
 *    de `fetch(` dentro do cliente já cai em `constructor_base_url_*`
 *    (destino vem de `this.baseUrl`, atribuído por parâmetro de construtor).
 *    Daqui, a classe que contém esse `fetch` é localizada, toda instanciação
 *    dela nas duas árvores é encontrada, e o primeiro argumento de cada
 *    instanciação é resolvido pela mesma forma — só uma delas resolve a uma
 *    chave do serviço Go. A superfície chamável da classe do cliente (quais
 *    membros alcançam `fetch`, direto ou por delegação a outro membro da
 *    mesma classe) é computada da própria declaração, não escrita à mão; um
 *    membro fora dessa superfície (não alcança, ou alcança mas é `private`)
 *    é enumerado com o motivo, nunca descartado em silêncio. Para essa
 *    instância, cada método da classe que a guarda é varrido: o que chama
 *    `this.<campo>.<membro da superfície>(...)` vira uma requisição, com
 *    método e caminho extraídos do objeto de opções; o que só referencia
 *    uma chave de
 *    ambiente sem chamar o cliente monta um valor para ser entregue em
 *    outro lugar (ex.: `webhookUrl()`, que monta a URL de entrada que o Go
 *    recebe dentro do corpo de outra requisição) — categoria própria, fora
 *    do conjunto alcançado.
 *
 * Forma não reconhecida em qualquer um dos dois casos derruba a leitura,
 * nomeando arquivo e linha — a mesma politica de resíduo zero de
 * `discoverHttpEgressSites`.
 */

/**
 * As chaves de ambiente cujo valor é a base da URL do serviço Go. As duas
 * apontam, por default declarado, para o mesmo host (`evolution-go:8080`) —
 * a mesma fronteira que `computeBoundaryValueCrossing` já verifica para o
 * caminho de envio de texto (Goal042/§3). É a chave, não o nome do arquivo,
 * da classe ou do cliente, que decide o destino.
 */
const GO_SERVICE_BASE_URL_ENV_VARS = new Set(["EVOLUTION_BASE_URL", "EVOLUTION_GO_BASE_URL"]);

/** Arquivo e linha do sítio de egresso classificado (`ClassifiedHttpEgressSite`) que originou uma entrada — campo próprio, distinto do `filePath`/`line` da própria entrada. Quando a entrada é o próprio sítio, os dois pares coincidem em valor, mas o campo continua escrito. */
export type HttpEgressSiteOrigin = Pick<ClassifiedHttpEgressSite, "filePath" | "line">;

export interface GoBoundHttpRequest {
  filePath: string;
  line: number;
  method: string;
  /** Caminho computado; segmento interpolado (`${...}`) vira um buraco `{}`. */
  pathExpression: string;
  category: HttpEgressSiteCategory;
  /** Sítio de egresso classificado que originou esta requisição. */
  originSite: HttpEgressSiteOrigin;
  reason: string;
}

export type AssembledUrlCategory = `assembled_url_for_delivery_${string}`;

/** Valor de URL montado a partir de uma chave de ambiente, mas nunca entregue diretamente ao transporte (nenhum `fetch`/`.request` na mesma função) — carregado como dado por outra requisição, não é ele próprio uma rota alcançada. */
export interface AssembledUrlForDelivery {
  filePath: string;
  line: number;
  functionName: string;
  urlExpression: string;
  category: AssembledUrlCategory;
  /** Sítio `constructor_base_url_*` classificado cujo cliente HTTP interno originou esta montagem de URL. */
  originSite: HttpEgressSiteOrigin;
  reason: string;
}

/**
 * O que a resolução de chamadores de um sítio `caller_resolved_base_url_via_*`
 * de fato leu: a forma de exportação da ligação, os arquivos das duas árvores
 * varridos atrás dela, os que a importam, os que têm chamada real e quantas
 * requisições saíram daí. É a enumeração que o motivo escrito resume — e a
 * prova de que ele só afirma o que foi lido.
 */
export interface CallerResolutionReport {
  siteFilePath: string;
  siteLine: number;
  functionName: string;
  /** `named+default` quando o mesmo nome sai do módulo pelas duas ligações — a varredura segue as duas, nunca só a primeira. */
  exportForm: "named" | "default" | "named+default" | "not_exported";
  /** Todo arquivo das duas árvores varrido atrás de um import dessa ligação. */
  scannedFilePaths: string[];
  /** Arquivos, fora o do sítio, que importam a ligação por import resolvido. */
  importingFilePaths: string[];
  /** Arquivos em que uma chamada real da ligação foi lida. */
  callerFilePaths: string[];
  callerCount: number;
  requestCount: number;
}

/** Forma pela qual o nome local de um arquivo candidato chega à declaração da classe. */
export type ClassBindingForm =
  | "local_declaration"
  | "named_import"
  | "aliased_named_import"
  | "default_import";

/** Uma ligação resolvida até a declaração de uma classe: o arquivo, o nome pelo qual a declaração é referenciada lá, e a forma que produziu esse nome. */
export interface ClassInstantiationBindingReport {
  filePath: string;
  /** Nome local — o alias, quando a ligação vem de um import com alias. */
  localName: string;
  form: ClassBindingForm;
}

/** A superfície derivada da declaração de um cliente HTTP interno: quem alcança `fetch` e, com motivo escrito, quem não alcança. */
export interface InternalClientSurfaceReport {
  className: string;
  filePath: string;
  /** Linha (1-based) da declaração `class <Nome>` — a identidade da classe, nunca o nome isolado. */
  classLine: number;
  reachingMembers: string[];
  excludedMembers: NonReachingClassMember[];
  /** Rótulo da forma pela qual a declaração sai do módulo, no mesmo vocabulário de `CallerResolutionReport`. */
  exportForm: CallerResolutionReport["exportForm"];
  /** Todo arquivo das duas árvores varrido atrás de uma ligação que instancie esta declaração. */
  scannedFilePathsForInstantiation: string[];
  /** Cada ligação que a varredura de fato resolveu até esta declaração — a prova do que o motivo escrito afirma. */
  instantiationBindings: ClassInstantiationBindingReport[];
}

/** Chamada `this.<campo>.<membro>(` sobre um cliente apontado ao serviço Go cujo membro está fora da superfície de transporte: lida e contada fora com motivo, nunca ignorada. */
export interface NonTransportMemberCall {
  filePath: string;
  line: number;
  className: string;
  fieldName: string;
  memberName: string;
  /** Sítio `constructor_base_url_*` classificado cujo cliente HTTP interno originou esta chamada. */
  originSite: HttpEgressSiteOrigin;
  reason: string;
}

/**
 * Instanciação de um cliente HTTP interno cujo primeiro argumento de
 * construtor resolve a uma chave de ambiente, mas nenhuma delas é chave do
 * serviço Go — lida e contada fora do conjunto alcançado, com a chave que a
 * exclui, nunca descartada em silêncio.
 */
export interface NonGoBoundClassInstantiation {
  filePath: string;
  line: number;
  className: string;
  /** Sítio `constructor_base_url_*` classificado cujo cliente HTTP interno originou esta instanciação. */
  originSite: HttpEgressSiteOrigin;
  reason: string;
}

export interface GoServiceHttpRequestDiscovery {
  requests: GoBoundHttpRequest[];
  assembledUrls: AssembledUrlForDelivery[];
  /** Sítios de egresso lidos e contados fora do conjunto alcançado, com o motivo escrito — nenhum sítio é descartado em silêncio. */
  notGoBound: NonGoBoundEgressSite[];
  /** A superfície derivada de cada cliente HTTP interno, com os membros de fora e o motivo de cada um. */
  internalClientSurfaces: InternalClientSurfaceReport[];
  /** Toda chamada a membro fora da superfície, sobre um cliente apontado ao serviço Go. */
  nonTransportMemberCalls: NonTransportMemberCall[];
  /** Instanciação de cliente interno cujo destino resolve a uma chave que não é do serviço Go — contada fora do conjunto alcançado, com a chave que a exclui. */
  nonGoBoundInstantiations: NonGoBoundClassInstantiation[];
  /** O que a resolução de chamadores leu, por sítio resolvido no chamador. */
  callerResolutions: CallerResolutionReport[];
}

/** Resolve o texto de um argumento de caminho a um valor: `env.<NOME>` vira o default computado do schema de ambiente; literal de string/crase vira seu conteúdo com todo `${...}` trocado por `{}`. Forma não reconhecida derruba a leitura. */
function resolvePathExpression(
  pathText: string,
  envSchemaPath: string,
  filePath: string,
  line: number,
): string {
  const trimmed = pathText.trim();
  const envMatch = trimmed.match(/^env\.([A-Z][A-Z0-9_]*)$/);
  if (envMatch) return readEnvSchemaDefault(envSchemaPath, envMatch[1]).value;
  const literalMatch = trimmed.match(/^(["'`])([\s\S]*)\1$/);
  if (literalMatch) return literalMatch[2].replace(/\$\{[^}]*\}/g, "{}");
  throw new Error(
    `${filePath}:${line}: expressão de caminho "${trimmed}" não é literal nem env.<NOME> reconhecível`,
  );
}

/** Tira as aspas (ou crases) de um literal de string, ou derruba a leitura se o texto não for um literal. */
function normalizeStringLiteral(text: string, filePath: string, line: number): string {
  const match = text.trim().match(/^(["'`])([\s\S]*)\1$/);
  if (!match) {
    throw new Error(`${filePath}:${line}: valor "${text.trim()}" não é um literal de string reconhecível`);
  }
  return match[2];
}

/** Separa `<algo>(<argA>, <argB>)` em base/caminho: `argA` resolve só a chaves de `baseEnvVars` e `argB` resolve a exatamente uma chave fora desse conjunto. Devolve o texto de `argB`, ou `undefined` se a forma não bater. */
function splitBaseAndPathArguments(rhsText: string, baseEnvVars: Set<string>): string | undefined {
  const callMatch = rhsText.trim().match(/^[A-Za-z_$][\w$]*\(([\s\S]*)\)$/);
  if (!callMatch) return undefined;
  const args = splitTopLevelItems(callMatch[1]);
  if (args.length !== 2) return undefined;
  const [argA, argB] = args;
  const varsA = matchEnvVars(argA);
  const varsB = matchEnvVars(argB);
  const baseIsA = varsA.length > 0 && varsA.every((name) => baseEnvVars.has(name));
  const pathIsB = varsB.length === 1 && !baseEnvVars.has(varsB[0]);
  return baseIsA && pathIsB ? argB.trim() : undefined;
}

/**
 * Método HTTP de uma chamada de `fetch`: o que a propriedade `method:` das
 * opções disser, ou `GET` quando as opções não trazem `method` — que é o
 * default do próprio `fetch`, lido da especificação da plataforma, não uma
 * suposição desta leitura. Segundo argumento presente mas sem forma de
 * objeto reconhecível derruba a leitura, porque aí o método é ilegível, não
 * ausente.
 */
function resolveFetchMethod(
  optionsArgText: string | undefined,
  filePath: string,
  line: number,
): string {
  const trimmed = (optionsArgText ?? "").trim();
  if (trimmed === "") return "GET";
  const objectMatch = trimmed.match(/^\{([\s\S]*)\}$/);
  if (objectMatch === null) {
    throw new Error(
      `${filePath}:${line}: opções de fetch "${trimmed}" não estão em forma de objeto reconhecível, então o método da requisição não pode ser lido`,
    );
  }
  const methodText = findObjectPropertyExpression(objectMatch[1], "method");
  if (methodText === undefined) return "GET";
  return normalizeStringLiteral(methodText, filePath, line);
}

/** Uma parte de um literal de crase: texto estático, ou uma expressão `${...}` (sem as chaves). */
interface TemplateLiteralPart {
  text: string;
  expression?: string;
}

/** Separa um literal de crase em partes estáticas e expressões `${...}`, respeitando aspas e chaves aninhadas. Devolve `undefined` se o texto não for um literal de crase fechado. */
function splitTemplateLiteralParts(text: string): TemplateLiteralPart[] | undefined {
  const trimmed = text.trim();
  if (trimmed.length < 2 || !trimmed.startsWith("`") || !trimmed.endsWith("`")) return undefined;
  const body = trimmed.slice(1, -1);
  const parts: TemplateLiteralPart[] = [];
  let staticText = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "\\") {
      staticText += body.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (body[i] === "$" && body[i + 1] === "{") {
      let depth = 1;
      let quote: string | undefined;
      let j = i + 2;
      while (j < body.length) {
        const char = body[j];
        if (quote !== undefined) {
          if (char === "\\") j += 1;
          else if (char === quote) quote = undefined;
        } else if (char === '"' || char === "'" || char === "`") {
          quote = char;
        } else if (char === "{") {
          depth += 1;
        } else if (char === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        j += 1;
      }
      if (depth !== 0) return undefined;
      parts.push({ text: staticText });
      staticText = "";
      parts.push({ text: "", expression: body.slice(i + 2, j) });
      i = j + 1;
      continue;
    }
    staticText += body[i];
    i += 1;
  }
  parts.push({ text: staticText });
  return parts;
}

/** Parâmetro de que `identifier` depende: ele próprio, quando já é parâmetro, ou o parâmetro citado na declaração local mais próxima que o define. `undefined` quando não depende de parâmetro algum. */
function resolveIdentifierToParameter(
  source: string,
  callIndex: number,
  identifier: string,
  parameterNames: string[],
): string | undefined {
  if (parameterNames.includes(identifier)) return identifier;
  const rhs = findNearestPrecedingDeclarationRhs(source, callIndex, identifier);
  if (rhs === undefined) return undefined;
  return parameterNames.find((name) => new RegExp(`\\b${name}\\b`).test(rhs));
}

/* =========================================================================
 * Chamador seguido por ligação importada, atravessando arquivo (Goal044 /
 * WU-01): a função que contém o `fetch` pode ser chamada de fora do próprio
 * arquivo, se esse outro arquivo importar a ligação que o módulo exporta. A
 * resolução é só pela forma — especificador relativo, resolvido a caminho de
 * arquivo; alias local, lido da cláusula de import — nunca por nome igual
 * solto entre arquivos. Forma que esta resolução não converte em um único
 * arquivo conhecido (reexportação, import dinâmico, alias de caminho não
 * relativo, referência importada e reexportada adiante) derruba a leitura.
 * ========================================================================= */

/** Nome importado e, se houver, o alias local a que ele é ligado. */
interface NamedImportBinding {
  name: string;
  alias?: string;
}

/** Uma declaração `import ... from "especificador"` já separada em clara, com os nomes que ela liga. */
interface ParsedImportDeclaration {
  line: number;
  index: number;
  /** Índice logo após o especificador: com `index`, o intervalo de texto que a declaração ocupa. */
  endIndex: number;
  specifier: string;
  typeOnly: boolean;
  defaultAlias?: string;
  namespaceAlias?: string;
  named: NamedImportBinding[];
}

/** Item de uma lista `{ a, b as c }` (de import ou de export), sem o modificador `type` de item. */
function parseBindingListItem(raw: string): NamedImportBinding | undefined {
  const bare = raw.replace(/^type\s+/, "").trim();
  const match = bare.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
  return match ? { name: match[1], alias: match[2] } : undefined;
}

/** Toda declaração `import ... from "especificador"` de `source` (import só de efeito colateral, sem cláusula, não liga nome algum e é ignorado). */
function findImportDeclarations(source: string): ParsedImportDeclaration[] {
  const pattern = /\bimport\s+(type\s+)?([\s\S]+?)\s+from\s+(["'])((?:(?!\3)[^\\]|\\.)*)\3/g;
  const declarations: ParsedImportDeclaration[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const [, typeFlag, clauseText, , specifier] = match;
    let defaultAlias: string | undefined;
    let namespaceAlias: string | undefined;
    const named: NamedImportBinding[] = [];
    for (const part of splitTopLevelItems(clauseText)) {
      if (part.startsWith("{") && part.endsWith("}")) {
        for (const item of splitTopLevelItems(part.slice(1, -1))) {
          const binding = parseBindingListItem(item);
          if (binding) named.push(binding);
        }
        continue;
      }
      const namespaceMatch = part.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (namespaceMatch) {
        namespaceAlias = namespaceMatch[1];
        continue;
      }
      const defaultMatch = part.match(/^([A-Za-z_$][\w$]*)$/);
      if (defaultMatch) defaultAlias = defaultMatch[1];
    }
    declarations.push({
      line: lineAt(source, match.index),
      index: match.index,
      endIndex: match.index + match[0].length,
      specifier,
      typeOnly: typeFlag !== undefined,
      defaultAlias,
      namespaceAlias,
      named,
    });
  }
  return declarations;
}

/** Todo `import("especificador")` dinâmico de `source`, com a linha onde ele aparece. */
function findDynamicImportSpecifiers(source: string): { line: number; specifier: string }[] {
  const pattern = /\bimport\s*\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/g;
  const occurrences: { line: number; specifier: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    occurrences.push({ line: lineAt(source, match.index), specifier: match[2] });
  }
  return occurrences;
}

/** Toda linha de `source` que reexporta de outro módulo (`export { ... } from "spec"` ou `export * from "spec"`), com o especificador e — para a forma nomeada — os nomes reexportados. */
function findReexportDeclarations(
  source: string,
): { line: number; specifier: string; names: string[] }[] {
  const declarations: { line: number; specifier: string; names: string[] }[] = [];
  const namedPattern = /\bexport\s*\{([\s\S]*?)\}\s*from\s*(["'])((?:(?!\2)[^\\]|\\.)*)\2/g;
  let namedMatch: RegExpExecArray | null;
  while ((namedMatch = namedPattern.exec(source))) {
    const names = splitTopLevelItems(namedMatch[1])
      .map(parseBindingListItem)
      .filter((binding): binding is NamedImportBinding => binding !== undefined)
      .map((binding) => binding.name);
    declarations.push({ line: lineAt(source, namedMatch.index), specifier: namedMatch[3], names });
  }
  const starPattern = /\bexport\s*\*(?:\s+as\s+[A-Za-z_$][\w$]*)?\s*from\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/g;
  let starMatch: RegExpExecArray | null;
  while ((starMatch = starPattern.exec(source))) {
    declarations.push({ line: lineAt(source, starMatch.index), specifier: starMatch[2], names: [] });
  }
  return declarations;
}

/** Toda ligação de uma lista `export { ... }` local (sem `from`) de `source`, com a linha da lista. */
function findLocalExportListBindings(
  source: string,
): { line: number; binding: NamedImportBinding }[] {
  const bindings: { line: number; binding: NamedImportBinding }[] = [];
  const pattern = /\bexport\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const after = source.slice(match.index + match[0].length).trimStart();
    if (after.startsWith("from")) continue;
    for (const item of splitTopLevelItems(match[1])) {
      const binding = parseBindingListItem(item);
      if (binding) bindings.push({ line: lineAt(source, match.index), binding });
    }
  }
  return bindings;
}

/** Linha da primeira `export { ... }` local (sem `from`) ou `export default` de `source` que reexporta `localAlias` adiante, ou `undefined` se não houver. */
function findForwardedExportLine(source: string, localAlias: string): number | undefined {
  const listed = findLocalExportListBindings(source).find(
    ({ binding }) => binding.name === localAlias,
  );
  if (listed !== undefined) return listed.line;
  const defaultExportMatch = new RegExp(`\\bexport\\s+default\\s+${localAlias}\\s*;`).exec(source);
  return defaultExportMatch ? lineAt(source, defaultExportMatch.index) : undefined;
}

/**
 * Texto do cabeçalho da construção `export` que começa em
 * `exportKeywordIndex`: a lista `{ ... }` de uma cláusula de export entra
 * inteira, para que os nomes que ela liga sejam lidos; o corpo de função, de
 * classe ou de arrow, não — o que está dentro do corpo não é forma de
 * exportação.
 */
function exportConstructText(source: string, exportKeywordIndex: number): string {
  let depth = 0;
  let i = exportKeywordIndex + "export".length;
  for (; i < source.length; i += 1) {
    const char = source[i];
    if (char === "(" || char === "[") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]") {
      depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (char === "{") {
      const header = source.slice(exportKeywordIndex, i);
      if (/\b(?:function|class)\b/.test(header) || header.includes("=>")) break;
      i = findMatchingDelimiterEnd(source, i, "{", "}");
      continue;
    }
    if (char === ";" || char === "\n") break;
  }
  return source.slice(exportKeywordIndex, i);
}

/** Toda construção `export ...` de `source` (fora de aspas), com o índice, a linha e o texto do cabeçalho. */
function findExportConstructs(source: string): { index: number; line: number; text: string }[] {
  const quoteMask = computeQuoteMask(source, source.length);
  const constructs: { index: number; line: number; text: string }[] = [];
  const pattern = /\bexport\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (quoteMask[match.index]) continue;
    constructs.push({
      index: match.index,
      line: lineAt(source, match.index),
      text: exportConstructText(source, match.index),
    });
  }
  return constructs;
}

/**
 * Uma ligação pela qual `functionName` sai do módulo: o nome exportado de
 * uma exportação nomeada, ou a exportação default. Lista vazia é uma
 * afirmação, não um silêncio: só é devolvida depois de conferir que o nome
 * está declarado no arquivo e que nenhuma construção `export` o menciona.
 * Forma de exportação que esta resolução não converte em ligação importável
 * derruba a leitura com `arquivo:linha` — desligar a varredura entre
 * arquivos por não reconhecer a forma é a borda que este Goal fecha.
 */
type ModuleExportBinding = { kind: "named"; exportedName: string } | { kind: "default" };

/**
 * **Todas** as ligações pelas quais `functionName` sai de `source`,
 * computadas das construções `export` do arquivo. O mesmo nome pode sair
 * por mais de uma ligação (`export function f` mais
 * `export { f as g };`, por exemplo), e cada uma alcança chamadores
 * diferentes em outros arquivos — por isso a resolução não para na
 * primeira. Toda construção `export` que menciona o nome é convertida em
 * ligação ou derruba a leitura: reconhecer a primeira nunca silencia as
 * seguintes.
 */
function resolveModuleExportBindings(
  source: string,
  functionName: string,
  filePath: string,
  line: number,
): ModuleExportBinding[] {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isDeclared = new RegExp(
    `\\b(?:function|class|const|let|var)\\s+${escapedName}\\b`,
  ).test(source);
  if (!isDeclared) {
    throw new Error(
      `${filePath}:${line}: "${functionName}" não corresponde a declaração alguma (function/class/const/let/var) reconhecível em ${filePath}; sem a declaração não dá para decidir se a ligação é exportada, e os chamadores em outros arquivos não podem ser nem confirmados nem descartados`,
    );
  }

  const mentionsName = new RegExp(`\\b${escapedName}\\b`);
  const bindings: ModuleExportBinding[] = [];
  /** Acrescenta a ligação, sem repetir uma já computada de outra construção. */
  const addBinding = (binding: ModuleExportBinding): void => {
    const key = binding.kind === "named" ? `named:${binding.exportedName}` : "default";
    const already = bindings.some(
      (other) => (other.kind === "named" ? `named:${other.exportedName}` : "default") === key,
    );
    if (!already) bindings.push(binding);
  };

  for (const construct of findExportConstructs(source)) {
    if (!mentionsName.test(construct.text)) continue;
    const text = construct.text.trim();

    if (
      new RegExp(`^export\\s+default\\s+(?:async\\s+)?function\\s+${escapedName}\\b`).test(text)
    ) {
      addBinding({ kind: "default" });
      continue;
    }
    if (new RegExp(`^export\\s+default\\s+${escapedName}$`).test(text)) {
      addBinding({ kind: "default" });
      continue;
    }
    // `class` entra pelas mesmas duas formas de `function`: a declaração de
    // classe é a ligação que o Goal045 resolve até a instanciação, e sem esta
    // conversão a própria declaração do cliente HTTP interno cairia como
    // "forma de exportação não convertida".
    if (new RegExp(`^export\\s+default\\s+(?:abstract\\s+)?class\\s+${escapedName}\\b`).test(text)) {
      addBinding({ kind: "default" });
      continue;
    }
    if (new RegExp(`^export\\s+(?:abstract\\s+)?class\\s+${escapedName}\\b`).test(text)) {
      addBinding({ kind: "named", exportedName: functionName });
      continue;
    }
    if (new RegExp(`^export\\s+(?:async\\s+)?function\\s+${escapedName}\\b`).test(text)) {
      addBinding({ kind: "named", exportedName: functionName });
      continue;
    }
    if (new RegExp(`^export\\s+(?:const|let|var)\\s+${escapedName}\\b`).test(text)) {
      addBinding({ kind: "named", exportedName: functionName });
      continue;
    }

    const listMatch = text.match(/^export\s*\{([\s\S]*)\}$/);
    const listedBindings = listMatch
      ? splitTopLevelItems(listMatch[1])
          .map(parseBindingListItem)
          .filter(
            (binding): binding is NamedImportBinding => binding?.name === functionName,
          )
      : [];
    if (listedBindings.length > 0) {
      // Uma mesma lista pode exportar o nome mais de uma vez, com aliases
      // diferentes (`export { f, f as g };`): cada item é uma ligação.
      for (const listed of listedBindings) {
        addBinding(
          listed.alias === undefined
            ? { kind: "named", exportedName: functionName }
            : listed.alias === "default"
              ? { kind: "default" }
              : { kind: "named", exportedName: listed.alias },
        );
      }
      continue;
    }

    throw new Error(
      `${filePath}:${construct.line}: "${functionName}" é mencionado por "${text.replace(/\s+/gu, " ").slice(0, 120)}", uma forma de exportação que esta resolução não converte em ligação importável — a varredura de chamadores em outros arquivos não pode ser nem feita nem descartada`,
    );
  }
  return bindings;
}

/** O rótulo com que um conjunto de ligações entra no relatório: `not_exported` quando vazio, a forma quando é uma só, `named+default` quando o nome sai pelos dois caminhos. */
function describeExportBindings(
  bindings: ModuleExportBinding[],
): CallerResolutionReport["exportForm"] {
  if (bindings.length === 0) return "not_exported";
  const hasNamed = bindings.some((binding) => binding.kind === "named");
  const hasDefault = bindings.some((binding) => binding.kind === "default");
  if (hasNamed && hasDefault) return "named+default";
  return hasNamed ? "named" : "default";
}

/** Caminho de arquivo (de `sourcesByPath`) a que `specifier` resolve, relativo a `importingFilePath` — tentando `<caminho>.ts` e `<caminho>/index.ts`. `undefined` se `specifier` não for relativo, ou não resolver a arquivo conhecido das duas árvores. */
function resolveModuleSpecifierToFilePath(
  specifier: string,
  importingFilePath: string,
  sourcesByPath: Map<string, string>,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const withoutExtension = specifier.replace(/\.(js|ts)$/, "");
  const base = join(dirname(importingFilePath), withoutExtension);
  return [`${base}.ts`, join(base, "index.ts")].find((candidate) => sourcesByPath.has(candidate));
}

/** Um arquivo, com o nome pelo qual `functionName` é chamado nele — o próprio nome no arquivo de origem, ou o alias local ligado por um import resolvido. */
interface CallerFileBinding {
  filePath: string;
  source: string;
  localName: string;
}

/** As mesmas ligações sem repetição de arquivo+nome local — duas ligações exportadas podem chegar ao mesmo arquivo pelo mesmo nome, e a chamada lá é uma só. */
function dedupeCallerFileBindings(bindings: CallerFileBinding[]): CallerFileBinding[] {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    const key = `${binding.filePath} ${binding.localName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Todo arquivo das duas árvores, além de `siteFilePath`, que importa a
 * ligação `functionName` exportada por ele — resolvida por especificador
 * relativo e alias de cláusula de import, nunca por nome igual solto. Forma
 * não resolvida (reexportação, import dinâmico, alias de caminho não
 * relativo, referência importada e reexportada adiante) derruba a leitura,
 * nomeando arquivo e linha. Vazio quando `functionName` não é exportado do
 * jeito que esta resolução reconhece — nesse caso só o próprio arquivo tem
 * chamador.
 *
 * `scannedFilePaths`, quando passado, recebe o caminho de cada arquivo no
 * momento em que esta varredura o abre. É a varredura que registra o que
 * varreu: quem só chama esta função não pode afirmar por fora quais arquivos
 * foram abertos, porque o laço abaixo pode nem chegar a executar.
 */
function findCrossFileCallerBindings(
  siteFilePath: string,
  functionName: string,
  exportForm: ModuleExportBinding,
  allSources: { filePath: string; source: string }[],
  sourcesByPath: Map<string, string>,
  scannedFilePaths?: string[],
): CallerFileBinding[] {
  const bindings: CallerFileBinding[] = [];
  // O nome pelo qual os outros arquivos importam a ligação é o nome
  // exportado, que pode diferir do nome da declaração (`export { f as g }`).
  const exportedName = exportForm.kind === "named" ? exportForm.exportedName : "default";

  for (const { filePath: otherFilePath, source: otherSource } of allSources) {
    if (otherFilePath === siteFilePath) continue;
    if (scannedFilePaths !== undefined && !scannedFilePaths.includes(otherFilePath)) {
      scannedFilePaths.push(otherFilePath);
    }

    for (const dynamicImport of findDynamicImportSpecifiers(otherSource)) {
      if (resolveModuleSpecifierToFilePath(dynamicImport.specifier, otherFilePath, sourcesByPath) === siteFilePath) {
        throw new Error(
          `${otherFilePath}:${dynamicImport.line}: import dinâmico de "${dynamicImport.specifier}" pode carregar "${functionName}" (exportado por ${siteFilePath}), e um import dinâmico não é seguido por esta resolução — o chamador não pode ser confirmado nem descartado`,
        );
      }
    }

    for (const reexport of findReexportDeclarations(otherSource)) {
      if (resolveModuleSpecifierToFilePath(reexport.specifier, otherFilePath, sourcesByPath) !== siteFilePath) continue;
      const isStarReexport = reexport.names.length === 0;
      if (isStarReexport || reexport.names.includes(exportedName)) {
        throw new Error(
          `${otherFilePath}:${reexport.line}: "${functionName}" (exportado por ${siteFilePath}) é reexportado daqui, estendendo o alcance da ligação a chamadores que esta resolução não percorre`,
        );
      }
    }

    for (const importDecl of findImportDeclarations(otherSource)) {
      if (importDecl.typeOnly) continue;
      const namesFunctionInClause = importDecl.named.some((item) => item.name === exportedName);

      if (!importDecl.specifier.startsWith(".")) {
        if (namesFunctionInClause) {
          throw new Error(
            `${otherFilePath}:${importDecl.line}: "${functionName}" é importado de "${importDecl.specifier}", um especificador não relativo (pacote ou alias de caminho) que esta resolução não converte em arquivo — não é possível confirmar se aponta para ${siteFilePath}`,
          );
        }
        continue;
      }

      if (resolveModuleSpecifierToFilePath(importDecl.specifier, otherFilePath, sourcesByPath) !== siteFilePath) {
        continue;
      }

      if (importDecl.namespaceAlias !== undefined) {
        throw new Error(
          `${otherFilePath}:${importDecl.line}: import de namespace ("* as ${importDecl.namespaceAlias}") de "${importDecl.specifier}", que resolve a ${siteFilePath} — chamada por "${importDecl.namespaceAlias}.${functionName}(...)" não é uma forma que esta resolução segue`,
        );
      }

      const localAlias =
        exportForm.kind === "named"
          ? importDecl.named.find((item) => item.name === exportedName)?.alias ??
            (namesFunctionInClause ? exportedName : undefined)
          : importDecl.defaultAlias;
      if (localAlias === undefined) continue;

      const forwardedLine = findForwardedExportLine(otherSource, localAlias);
      if (forwardedLine !== undefined) {
        throw new Error(
          `${otherFilePath}:${forwardedLine}: "${localAlias}" (importado de "${functionName}" em ${siteFilePath}) é reexportado daqui, estendendo o alcance da ligação a chamadores que esta resolução não percorre`,
        );
      }

      bindings.push({ filePath: otherFilePath, source: otherSource, localName: localAlias });
    }
  }

  return bindings;
}

/**
 * Requisições ao serviço Go escondidas atrás de um parâmetro em trânsito
 * (categoria `caller_resolved_base_url_via_*`): a função que contém o
 * `fetch` recebe a base da URL como parâmetro, então o destino não está
 * escrito na expressão da URL — ele só existe nos chamadores, e é lá que
 * esta resolução vai. Os chamadores são os do mesmo arquivo mais os de todo
 * arquivo, nas duas árvores, que importa a ligação exportada do módulo
 * (`findCrossFileCallerBindings`). Para cada chamada real, os argumentos são
 * casados às posições dos parâmetros; a chamada cujo argumento de base
 * resolve a uma chave do serviço Go vira uma requisição, e o caminho é
 * computado parte por parte da própria expressão de URL do `fetch` — a parte
 * que vem do parâmetro de base é o host, e não entra no caminho; a que vem
 * de outro parâmetro é substituída pelo argumento daquele chamador. Parte
 * que não resolve a parâmetro algum derruba a leitura, nunca vira caminho
 * vazio.
 */
function discoverCallerResolvedGoBoundRequests(
  source: string,
  site: ClassifiedHttpEgressSite,
  call: RawFetchOccurrence,
  urlArgText: string,
  optionsArgText: string | undefined,
  envSchemaPath: string,
  allSources: { filePath: string; source: string }[],
  sourcesByPath: Map<string, string>,
): { requests: GoBoundHttpRequest[]; resolution: CallerResolutionReport } {
  const enclosing = resolveEnclosingFunction(source, call.index);
  if (enclosing === undefined) {
    throw new Error(
      `${site.filePath}:${site.line}: sítio "${site.category}" sem função envolvente reconhecível, e sem ela os chamadores que decidem o destino não podem ser seguidos`,
    );
  }
  const destination = resolveDestination(source, call.index, urlArgText, enclosing.parameterNames);
  const transitParams = destination.unresolvedParams.filter((name) =>
    enclosing.parameterNames.includes(name),
  );
  if (transitParams.length === 0) {
    throw new Error(
      `${site.filePath}:${site.line}: sítio "${site.category}" cuja URL "${urlArgText}" não depende de parâmetro algum de "${enclosing.name}", então o destino não pode ser resolvido nos chamadores`,
    );
  }
  const parts = splitTemplateLiteralParts(urlArgText);
  if (parts === undefined) {
    throw new Error(
      `${site.filePath}:${site.line}: a URL "${urlArgText}" vem de parâmetro em trânsito e não é um literal de crase, então o caminho da requisição não pode ser separado da base`,
    );
  }

  const exportBindings = resolveModuleExportBindings(
    source,
    enclosing.name,
    site.filePath,
    site.line,
  );
  // Cada ligação exportada alcança chamadores próprios em outros arquivos:
  // seguir só a primeira deixaria de fora quem importa pela outra.
  const callerFiles: CallerFileBinding[] = [
    { filePath: site.filePath, source, localName: enclosing.name },
    ...dedupeCallerFileBindings(
      exportBindings.flatMap((binding) =>
        findCrossFileCallerBindings(
          site.filePath,
          enclosing.name,
          binding,
          allSources,
          sourcesByPath,
        ),
      ),
    ),
  ];

  const requests: GoBoundHttpRequest[] = [];
  let callerCount = 0;
  const filesWithCallers = new Set<string>();

  for (const { filePath: callerFilePath, source: callerSource, localName } of callerFiles) {
    for (const callerCall of findRealCallSites(callerSource, localName)) {
      callerCount += 1;
      filesWithCallers.add(callerFilePath);

      const argumentOf = (parameterName: string): string | undefined =>
        callerCall.args[enclosing.parameterNames.indexOf(parameterName)];
      // Qual parâmetro em trânsito carrega a base, e qual carrega caminho, é
      // decidido pelo argumento deste chamador: base é o que resolve a uma
      // chave de base do serviço Go; os demais entram no caminho.
      let baseParam: string | undefined;
      let goEnvVar: string | undefined;
      for (const parameterName of transitParams) {
        const found = matchEnvVars(argumentOf(parameterName) ?? "").find((name) =>
          GO_SERVICE_BASE_URL_ENV_VARS.has(name),
        );
        if (found !== undefined) {
          baseParam = parameterName;
          goEnvVar = found;
          break;
        }
      }
      if (baseParam === undefined || goEnvVar === undefined) continue;

      let pathExpression = "";
      for (const part of parts) {
        if (part.expression === undefined) {
          pathExpression += part.text;
          continue;
        }
        const identifier = part.expression.trim().match(/^[A-Za-z_$][\w$]*/)?.[0];
        const parameterName =
          identifier === undefined
            ? undefined
            : resolveIdentifierToParameter(source, call.index, identifier, enclosing.parameterNames);
        if (parameterName === undefined) {
          throw new Error(
            `${site.filePath}:${site.line}: a parte interpolada "${part.expression}" da URL não resolve a parâmetro algum de "${enclosing.name}", então o caminho da requisição ao serviço Go ficaria incompleto`,
          );
        }
        if (parameterName === baseParam) continue;
        const argumentText = argumentOf(parameterName);
        if (argumentText === undefined) {
          throw new Error(
            `${callerFilePath}:${callerCall.line}: a chamada de "${localName}" não passa argumento para o parâmetro "${parameterName}", de que o caminho da URL depende`,
          );
        }
        pathExpression += resolvePathExpression(
          argumentText,
          envSchemaPath,
          callerFilePath,
          callerCall.line,
        );
      }

      requests.push({
        filePath: callerFilePath,
        line: callerCall.line,
        method: resolveFetchMethod(optionsArgText, site.filePath, site.line),
        pathExpression,
        category: `env_var_${goEnvVar}`,
        originSite: { filePath: site.filePath, line: site.line },
        reason: `chamada de "${localName}" (${enclosing.name}, exportado por ${site.filePath}) cujo argumento de base é env.${goEnvVar} (serviço Go); o fetch está em ${site.filePath}:${site.line}, e o caminho vem das partes da URL que não são a base`,
      });
    }
  }

  return {
    requests,
    resolution: {
      siteFilePath: site.filePath,
      siteLine: site.line,
      functionName: enclosing.name,
      exportForm: describeExportBindings(exportBindings),
      scannedFilePaths: allSources.map(({ filePath }) => filePath),
      importingFilePaths: callerFiles
        .filter(({ filePath }) => filePath !== site.filePath)
        .map(({ filePath }) => filePath),
      callerFilePaths: Array.from(filesWithCallers),
      callerCount,
      requestCount: requests.length,
    },
  };
}

/**
 * Um sítio de egresso que foi lido e não entra no conjunto alcançado, com o
 * motivo escrito. Nenhum sítio some em silêncio: ou ele vira requisição ao
 * serviço Go, ou vira uma destas contagens, ou derruba a leitura.
 */
export interface NonGoBoundEgressSite {
  filePath: string;
  line: number;
  category: HttpEgressSiteCategory;
  /** Sítio de egresso classificado que originou esta entrada — sempre ela mesma, escrita de forma explícita. */
  originSite: HttpEgressSiteOrigin;
  reason: string;
}

/**
 * Toda requisição das duas árvores cujo destino é o serviço Go, entre os
 * sítios de `fetch(` cru já classificados por `discoverHttpEgressSites` — a
 * resolução de base/caminho e de método é própria, o resto (existência do
 * sítio, resíduo do egresso bruto) já veio de lá.
 *
 * A leitura é fail-closed em cada sítio. O destino pode não estar escrito na
 * expressão da URL — um campo de construtor, um parâmetro em trânsito, um
 * primitivo genérico —, e nesse caso a categoria que `discoverHttpEgressSites`
 * já computou decide o que fazer: resolver nos chamadores, deixar para a
 * varredura de instanciação do cliente interno, ou contar fora do conjunto
 * com o motivo escrito. Categoria não prevista derruba a leitura, nomeando
 * arquivo e linha; nenhum sítio é pulado sem registro.
 */
function discoverGoBoundRawFetchRequests(
  discovery: HttpEgressDiscovery,
  sourcesByPath: Map<string, string>,
  allSources: { filePath: string; source: string }[],
  envSchemaPath: string,
): {
  requests: GoBoundHttpRequest[];
  notGoBound: NonGoBoundEgressSite[];
  callerResolutions: CallerResolutionReport[];
} {
  const requests: GoBoundHttpRequest[] = [];
  const notGoBound: NonGoBoundEgressSite[] = [];
  const callerResolutions: CallerResolutionReport[] = [];
  const countOut = (site: ClassifiedHttpEgressSite, reason: string): void => {
    notGoBound.push({
      filePath: site.filePath,
      line: site.line,
      category: site.category,
      originSite: { filePath: site.filePath, line: site.line },
      reason,
    });
  };

  for (const site of discovery.sites) {
    const source = sourcesByPath.get(site.filePath);
    if (source === undefined) {
      throw new Error(
        `${site.filePath}:${site.line}: sítio de egresso classificado em arquivo que não aparece na releitura das duas árvores`,
      );
    }
    const { calls } = findRawFetchOccurrences(source, site.filePath);
    const call = calls.find((candidate) => candidate.line === site.line);
    if (call === undefined) {
      throw new Error(
        `${site.filePath}:${site.line}: sítio de egresso classificado sem chamada de fetch correspondente na releitura do arquivo`,
      );
    }

    const openParenIndex = call.index + "fetch(".length - 1;
    const closeParenIndex = findMatchingDelimiterEnd(source, openParenIndex, "(", ")");
    const callArgs = splitTopLevelItems(source.slice(openParenIndex + 1, closeParenIndex));
    const urlArgText = (callArgs[0] ?? "").trim();
    const optionsArgText = callArgs[1];
    const isBareIdentifier = /^[A-Za-z_$][\w$]*$/.test(urlArgText);
    // Um identificador sem declaração local não é um sítio perdido: ele pode
    // ser um parâmetro, e aí o destino vive nos chamadores. O texto do
    // próprio argumento segue adiante, e é a categoria do sítio que decide.
    const rhs =
      (isBareIdentifier
        ? findNearestPrecedingDeclarationRhs(source, call.index, urlArgText)
        : urlArgText) ?? urlArgText;

    // O destino é resolvido pela mesma leitura que classificou o sítio —
    // `env.<NOME>` escrito na URL, ou alcançado pelas declarações locais que
    // ela usa — e não por uma varredura textual só da expressão.
    const enclosing = resolveEnclosingFunction(source, call.index);
    const destination = resolveDestination(
      source,
      call.index,
      urlArgText,
      enclosing?.parameterNames ?? [],
    );
    const goEnvVar = destination.envVars.find((name) => GO_SERVICE_BASE_URL_ENV_VARS.has(name));
    if (goEnvVar !== undefined) {
      const pathArgText = splitBaseAndPathArguments(rhs, GO_SERVICE_BASE_URL_ENV_VARS);
      if (pathArgText === undefined) {
        throw new Error(
          `${site.filePath}:${site.line}: destino resolve a env.${goEnvVar} (serviço Go), mas "${rhs}" não separa base e caminho em forma reconhecível`,
        );
      }
      requests.push({
        filePath: site.filePath,
        line: site.line,
        method: resolveFetchMethod(optionsArgText, site.filePath, site.line),
        pathExpression: resolvePathExpression(pathArgText, envSchemaPath, site.filePath, site.line),
        category: site.category,
        originSite: { filePath: site.filePath, line: site.line },
        reason: `fetch cru cujo destino resolve a env.${goEnvVar}; caminho resolvido de ${pathArgText.trim()}`,
      });
      continue;
    }

    if (destination.envVars.length > 0) {
      countOut(
        site,
        `destino resolve a env.${destination.envVars.join(" e env.")}, e nenhuma dessas chaves é base do serviço Go`,
      );
      continue;
    }

    // Daqui para baixo o destino não está escrito na expressão da URL. Cada
    // categoria tem um tratamento nomeado; não existe caminho de saída sem
    // registro.
    if (site.category.startsWith("constructor_base_url_")) {
      countOut(
        site,
        "destino vem de campo de instância atribuído por parâmetro de construtor; este sítio é resolvido pela varredura de instanciação do cliente, não aqui",
      );
      continue;
    }

    const callerResolvedPrefix = "caller_resolved_base_url_via_";
    if (site.category.startsWith(callerResolvedPrefix)) {
      const resolved = discoverCallerResolvedGoBoundRequests(
        source,
        site,
        call,
        urlArgText,
        optionsArgText,
        envSchemaPath,
        allSources,
        sourcesByPath,
      );
      callerResolutions.push(resolved.resolution);
      if (resolved.requests.length > 0) {
        requests.push(...resolved.requests);
        continue;
      }
      const functionName = site.category.slice(callerResolvedPrefix.length);
      countOut(
        site,
        `os chamadores de "${functionName}" decidem o destino: ${resolved.resolution.callerCount} chamador(es) lido(s) em ${resolved.resolution.callerFilePaths.length} arquivo(s), depois de varrer ${resolved.resolution.scannedFilePaths.length} arquivo(s) das duas árvores atrás da ligação (forma de exportação: ${resolved.resolution.exportForm}), e nenhum deles passa uma chave de base do serviço Go`,
      );
      continue;
    }

    if (site.category.startsWith(GENERIC_EGRESS_CATEGORY_PREFIX)) {
      const functionName = site.category.slice(GENERIC_EGRESS_CATEGORY_PREFIX.length);
      // Casado pelo sítio da declaração (arquivo + linha), não pelo nome:
      // dois primitivos homônimos em arquivos diferentes têm entradas
      // separadas, e casar por nome devolveria a varredura errada para um
      // dos dois.
      const scanned = discovery.genericEgressCallersByPrimitive.find(
        (entry) => entry.filePath === site.filePath && entry.line === site.line,
      );
      if (scanned === undefined) {
        throw new Error(
          `${site.filePath}:${site.line}: o egresso genérico "${functionName}" não tem varredura de chamadores registrada, e sem ela não dá para afirmar quantos chamadores existem nas duas árvores`,
        );
      }
      const goBoundCallers = scanned.callers.filter((caller) =>
        Array.from(GO_SERVICE_BASE_URL_ENV_VARS).some((name) => caller.category.includes(name)),
      );
      if (goBoundCallers.length > 0) {
        throw new Error(
          `${site.filePath}:${site.line}: o egresso genérico "${functionName}" tem chamador com destino no serviço Go (${goBoundCallers
            .map((caller) => `${caller.filePath}:${caller.line}`)
            .join(", ")}), e o método e o caminho dessa forma ainda não são computados aqui`,
        );
      }
      countOut(
        site,
        `egresso genérico "${functionName}": ${scanned.callers.length} chamador(es) nas duas árvores (varridos pelo nome da declaração e pelo nome local de cada import com alias que liga a função), nenhum com destino no serviço Go`,
      );
      continue;
    }

    throw new Error(
      `${site.filePath}:${site.line}: sítio na categoria "${site.category}" cuja URL "${urlArgText}" não nomeia env.<NOME>; o destino não pode ser decidido, e um sítio sem destino decidido não é descartado`,
    );
  }
  return { requests, notGoBound, callerResolutions };
}

/** Índice do primeiro caractere da linha `line` (1-based) em `source`. */
function indexAtLineStart(source: string, line: number): number {
  if (line <= 1) return 0;
  return source.split("\n").slice(0, line - 1).join("\n").length + 1;
}

interface ClassSpan {
  name: string;
  /** Linha (1-based) da declaração `class <Nome>`, chave de identidade da classe — nunca o nome isolado. */
  line: number;
  bodyStart: number;
  bodyEnd: number;
}

/** Classe (nome e corpo) mais interna que contém `index`, computada da declaração `class <Nome> ... {`, nunca de uma lista. */
function findEnclosingClassSpan(source: string, index: number): ClassSpan | undefined {
  const pattern = /\bclass\s+([A-Za-z_$][\w$]*)[^{]*\{/g;
  let match: RegExpExecArray | null;
  let found: { name: string; declIndex: number; braceIndex: number } | undefined;
  while ((match = pattern.exec(source))) {
    if (match.index >= index) break;
    found = { name: match[1], declIndex: match.index, braceIndex: match.index + match[0].length - 1 };
  }
  if (found === undefined) return undefined;
  const bodyEnd = findMatchingDelimiterEnd(source, found.braceIndex, "{", "}");
  if (bodyEnd < index) return undefined;
  return { name: found.name, line: lineAt(source, found.declIndex), bodyStart: found.braceIndex + 1, bodyEnd };
}

/* =========================================================================
 * Prova do alvo da atribuição (Goal047 / WU-02) — depois de provar QUAL
 * classe é instanciada (Goal045), esta leitura prova se a instância é
 * guardada num campo da classe dona, em vez de casar `<nome> = new` numa
 * janela textual solta, que aceitava igualmente uma variável local, uma
 * propriedade de outro objeto ou um elemento de array.
 *
 * Só duas formas provam campo da classe dona: `this.<campo> = new ...` (em
 * qualquer profundidade dentro do corpo dela) e declaração de propriedade de
 * classe com inicializador (`<campo> = new ...`, direto no corpo da classe,
 * fora de todo método). Toda outra forma recusa com `arquivo:linha` e
 * categoria nomeada — nenhum caminho devolve nome de campo não provado.
 * ========================================================================= */

/** Categorias nomeadas com que a resolução do alvo de atribuição da instanciação recusa. Toda recusa deste caminho sai sob uma delas. Array em runtime: a suíte e a documentação permanente conferem contra ele, em vez de contra união escrita à mão. */
export const INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES = [
  /** A instância é guardada numa variável local (`const`/`let`/`var`), não num campo da classe dona. */
  "instance_field_assignment_local_variable",
  /** O alvo da atribuição é um padrão de desestruturação: o membro sai da instância aqui, não vira campo. */
  "instance_field_assignment_destructured",
  /** A instância é atribuída a uma propriedade de outro objeto (`<id>.<campo> = new ...`), não a `this.<campo>`. */
  "instance_field_assignment_foreign_object_property",
  /** A instância é atribuída a um elemento de array (`<id>[<expr>] = new ...`). */
  "instance_field_assignment_array_element",
  /** A instanciação é devolvida diretamente (`return new ...`), sem atribuição a campo algum. */
  "instance_field_assignment_returned_directly",
  /** Nenhuma das formas acima casa, e a instanciação também não está em `this.<campo> = new ...` nem em declaração de propriedade de classe: forma não reconhecida. */
  "instance_field_assignment_form_not_recognized",
] as const;

/** Categoria nomeada com que a resolução do alvo de atribuição recusa, derivada de {@link INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES}. */
export type InstanceFieldAssignmentRefusalCategory =
  (typeof INSTANCE_FIELD_ASSIGNMENT_REFUSAL_CATEGORIES)[number];

/** Recusa deste caminho: `arquivo:linha`, o trecho de contexto e a categoria nomeada da forma. */
function instanceFieldAssignmentRefusal(
  filePath: string,
  line: number,
  detail: string,
  category: InstanceFieldAssignmentRefusalCategory,
): Error {
  return new Error(`${filePath}:${line}: ${detail} [categoria: ${category}]`);
}

/** Profundidade de chaves entre `classSpan.bodyStart` e `index` (exclusive), ignorando aspas/crase. Zero é o corpo da classe dona no nível mais alto (posição de declaração de propriedade); acima de zero está dentro de um método ou bloco aninhado. */
function classBodyNestingDepthAt(source: string, classSpan: ClassSpan, index: number): number {
  const quoteMask = computeQuoteMask(source, index);
  let depth = 0;
  for (let i = classSpan.bodyStart; i < index; i += 1) {
    if (quoteMask[i]) continue;
    const char = source[i];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
  }
  return depth;
}

/**
 * Nome do campo, provado pela FORMA da atribuição que guarda `new <Classe>(`
 * que termina em `classNameMatchIndex` — nunca por janela textual solta.
 * Recusa com `arquivo:linha` e categoria nomeada quando a forma não prova
 * campo da classe dona (`ownerClassSpan`).
 */
function resolveProvenClassFieldAssignment(
  source: string,
  filePath: string,
  classNameMatchIndex: number,
  line: number,
  ownerClassSpan: ClassSpan,
): string {
  const windowStart = Math.max(ownerClassSpan.bodyStart, classNameMatchIndex - 200);
  const window = source.slice(windowStart, classNameMatchIndex);
  const context = source
    .slice(windowStart, Math.min(source.length, classNameMatchIndex + 40))
    .replace(/\s+/g, " ")
    .trim();

  const thisFieldMatch = /\bthis\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*new\s*$/.exec(window);
  if (thisFieldMatch) return thisFieldMatch[1];

  const propertyDeclarationMatch =
    /(?:(?:private|public|protected|readonly|static|declare|override)\s+)*([A-Za-z_$][\w$]*)\s*(?:\?|!)?\s*(?::\s*[^=;{}]+)?=\s*new\s*$/.exec(
      window,
    );
  if (
    propertyDeclarationMatch &&
    classBodyNestingDepthAt(source, ownerClassSpan, classNameMatchIndex) === 0
  ) {
    return propertyDeclarationMatch[1];
  }

  const localVariableMatch =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;{}]+)?=\s*new\s*$/.exec(window);
  if (localVariableMatch) {
    throw instanceFieldAssignmentRefusal(
      filePath,
      line,
      `a instância é guardada na variável local "${localVariableMatch[1]}" ("${context}"), não num campo da classe dona`,
      "instance_field_assignment_local_variable",
    );
  }

  if (/[}\]]\s*=\s*new\s*$/.test(window)) {
    throw instanceFieldAssignmentRefusal(
      filePath,
      line,
      `o alvo da atribuição é um padrão de desestruturação ("${context}"), não um campo da classe dona`,
      "instance_field_assignment_destructured",
    );
  }

  const foreignPropertyMatch = /\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*new\s*$/.exec(window);
  if (foreignPropertyMatch && foreignPropertyMatch[1] !== "this") {
    throw instanceFieldAssignmentRefusal(
      filePath,
      line,
      `a instância é atribuída a "${foreignPropertyMatch[1]}.${foreignPropertyMatch[2]}" ("${context}"), propriedade de outro objeto, não de "this"`,
      "instance_field_assignment_foreign_object_property",
    );
  }

  if (/\b[A-Za-z_$][\w$]*\s*\[[^\]]*\]\s*=\s*new\s*$/.test(window)) {
    throw instanceFieldAssignmentRefusal(
      filePath,
      line,
      `a instância é atribuída a um elemento de array ("${context}"), não a um campo da classe dona`,
      "instance_field_assignment_array_element",
    );
  }

  if (/\breturn\s*$/.test(window)) {
    throw instanceFieldAssignmentRefusal(
      filePath,
      line,
      `a instanciação é devolvida diretamente ("${context}"), sem atribuição a campo algum`,
      "instance_field_assignment_returned_directly",
    );
  }

  throw instanceFieldAssignmentRefusal(
    filePath,
    line,
    `a instanciação não está na forma "this.<campo> = new ..." nem em declaração de propriedade de classe ("${context}")`,
    "instance_field_assignment_form_not_recognized",
  );
}

interface ClassInstantiationSite {
  filePath: string;
  callIndex: number;
  line: number;
  argsText: string[];
  /** Identificador de fato escrito em `new <Id>(` — o alias, quando a ligação daquele arquivo vier de um import com alias. */
  localName: string;
  /** A ligação por que esse identificador chega à declaração da classe. */
  bindingForm: ClassBindingForm;
}

/**
 * Toda instanciação real (`new <localName>(...)`, nunca a declaração da
 * classe) do identificador `localName` em `source`. `localName` **não** é o
 * nome da classe escolhido pelo chamador: é o nome que a resolução de
 * ligação (`resolveClassInstantiationBindings`) provou estar ligado, naquele
 * arquivo, à declaração procurada. Chamar esta função com um nome que não
 * saiu dessa resolução volta a casar por texto e é exatamente a borda que o
 * Goal045 fecha.
 */
function findClassInstantiations(
  source: string,
  filePath: string,
  binding: ClassInstantiationBindingReport,
): ClassInstantiationSite[] {
  const pattern = new RegExp(`\\b${binding.localName}\\(`, "g");
  const sites: ClassInstantiationSite[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (wordEndingAt(source, match.index) !== "new") continue;
    const openParenIndex = match.index + match[0].length - 1;
    if (isMemberDeclarationOrImplementationPosition(source, match.index, openParenIndex)) continue;
    const closeParenIndex = findMatchingDelimiterEnd(source, openParenIndex, "(", ")");
    sites.push({
      filePath,
      callIndex: match.index,
      line: lineAt(source, match.index),
      argsText: splitTopLevelItems(source.slice(openParenIndex + 1, closeParenIndex)),
      localName: binding.localName,
      bindingForm: binding.form,
    });
  }
  return sites;
}

/* =========================================================================
 * Instanciação reconhecida por ligação resolvida (Goal045 / WU-02) — o
 * identificador de `new <Id>(` só conta como instanciação de uma declaração
 * de classe quando a ligação do arquivo candidato chega àquela declaração:
 * import nomeado, import nomeado sob alias, import default, ou a própria
 * declaração local. Nome igual sem ligação resolvida não é instanciação
 * dela; alias resolvido é.
 *
 * A resolução **reusa** a máquina de ligação do Goal044
 * (`resolveModuleExportBindings`, `findCrossFileCallerBindings`, e por
 * dentro dela `resolveModuleSpecifierToFilePath`, `findImportDeclarations`,
 * `findDynamicImportSpecifiers`, `findReexportDeclarations`): não existe
 * cópia paralela dela aqui. O que este caminho acrescenta é a categoria
 * nomeada com que recusa — toda forma que a máquina não converte em arquivo
 * e nome local derruba a leitura com `arquivo:linha`, nunca com um
 * `continue` mudo.
 * ========================================================================= */

/** Categorias nomeadas com que a resolução de ligação de instanciação recusa. Toda recusa deste caminho sai sob uma delas. Array em runtime: a suíte e a documentação permanente conferem contra ele, em vez de contra união escrita à mão. */
export const CLASS_BINDING_REFUSAL_CATEGORIES = [
  /** Duas declarações do mesmo nome no arquivo da classe: o nome exportado não identifica qual delas é instanciada. */
  "class_binding_homonymous_declarations",
  /** A classe sai do módulo por uma forma que a resolução não converte em ligação importável (`export =`, cláusula nova). */
  "class_binding_export_form_not_resolved",
  /** A classe sai do módulo por CommonJS (`module.exports` / `exports.<nome>`), que esta resolução não segue. */
  "class_binding_commonjs_export",
  /** A ligação atravessa o arquivo por forma não seguida: reexportação em cadeia, import dinâmico, alias de caminho não relativo, import de namespace. */
  "class_binding_cross_file_form_not_resolved",
  /** O nome ligado à declaração aparece num arquivo candidato fora de `new <Id>(`: a classe é passada adiante como valor. */
  "class_binding_reference_forwarded_as_value",
  /** O nome ligado aparece dentro de uma construção `export` cuja forma não está na allowlist de `exportConstructBindingRange`: sem forma reconhecida, a ocorrência não pode ser confirmada como ligação exportada. */
  "class_binding_export_construct_form_unrecognized",
] as const;

/** Categoria nomeada com que a resolução de ligação de instanciação recusa, derivada de {@link CLASS_BINDING_REFUSAL_CATEGORIES}. */
export type ClassBindingRefusalCategory = (typeof CLASS_BINDING_REFUSAL_CATEGORIES)[number];

/** Recusa deste caminho: `arquivo:linha`, o que a leitura não converteu, e a categoria nomeada da forma. */
function classBindingRefusal(
  filePath: string,
  line: number,
  detail: string,
  category: ClassBindingRefusalCategory,
): Error {
  return new Error(`${filePath}:${line}: ${detail} [categoria: ${category}]`);
}

/** A mesma recusa quando o texto vem da máquina de ligação do Goal044, que já nomeia o `arquivo:linha` da forma recusada: a categoria é acrescentada sem reescrever o que ela leu. */
function categorizedBindingRefusal(error: unknown, category: ClassBindingRefusalCategory): Error {
  return new Error(`${(error as Error).message} [categoria: ${category}]`);
}

/** Linha (1-based) de cada declaração `class <name>` de `source`, fora de aspas. */
function findClassDeclarationLines(source: string, name: string): number[] {
  const quoteMask = computeQuoteMask(source, source.length);
  const pattern = new RegExp(`\\bclass\\s+${name}\\b`, "g");
  const lines: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (quoteMask[match.index]) continue;
    lines.push(lineAt(source, match.index));
  }
  return lines;
}

/** O que a resolução de ligação de instanciação leu: a forma de exportação, os arquivos varridos e as ligações que ela de fato resolveu. */
interface ClassInstantiationBindingResolution {
  exportForm: CallerResolutionReport["exportForm"];
  scannedFilePaths: string[];
  bindings: ClassInstantiationBindingReport[];
}

/**
 * Toda ligação das duas árvores que chega à declaração `classSpan` de
 * `classFilePath`. O próprio arquivo da declaração entra sempre (ligação
 * local); os outros entram só quando a resolução do Goal044 converte o
 * import em arquivo e nome local. `scannedFilePaths` é a enumeração do que
 * foi varrido — é ela que sustenta qualquer afirmação escrita sobre a
 * varredura.
 */
function resolveClassInstantiationBindings(
  classFilePath: string,
  classSpan: ClassSpan,
  allSources: { filePath: string; source: string }[],
  sourcesByPath: Map<string, string>,
): ClassInstantiationBindingResolution {
  const classSource = sourcesByPath.get(classFilePath);
  if (classSource === undefined) {
    throw classBindingRefusal(
      classFilePath,
      classSpan.line,
      `a declaração de "${classSpan.name}" está num arquivo fora das duas árvores lidas, e sem o texto dele nenhuma ligação até ela pode ser resolvida`,
      "class_binding_export_form_not_resolved",
    );
  }

  // A ligação exportada é resolvida pelo NOME; com duas declarações
  // homônimas no mesmo arquivo o nome não diz qual delas sai do módulo, e
  // contar a instanciação para uma das duas seria escolher no escuro.
  const declarationLines = findClassDeclarationLines(classSource, classSpan.name);
  if (declarationLines.length > 1) {
    throw classBindingRefusal(
      classFilePath,
      classSpan.line,
      `"${classSpan.name}" é declarada ${declarationLines.length} vezes neste arquivo (linhas ${declarationLines.join(", ")}), e a ligação exportada sob esse nome não identifica qual declaração é instanciada`,
      "class_binding_homonymous_declarations",
    );
  }

  // `module.exports` / `exports.<nome>`: a classe sairia do módulo por uma
  // forma CommonJS que `findImportDeclarations` não vê. Sem esta recusa,
  // nenhum arquivo candidato seria varrido e a ausência de instanciação
  // passaria por leitura.
  const commonJsExport = new RegExp(
    `\\b(?:module\\.exports\\b[^\\n]*\\b${classSpan.name}\\b|exports\\.[A-Za-z_$][\\w$]*\\s*=\\s*${classSpan.name}\\b)`,
  ).exec(classSource);
  if (commonJsExport !== null) {
    throw classBindingRefusal(
      classFilePath,
      lineAt(classSource, commonJsExport.index),
      `"${classSpan.name}" sai do módulo por "${commonJsExport[0].trim()}", uma exportação CommonJS que esta resolução não converte em import reconhecido — os arquivos que a instanciam não podem ser nem confirmados nem descartados`,
      "class_binding_commonjs_export",
    );
  }

  let exportBindings: ModuleExportBinding[];
  try {
    exportBindings = resolveModuleExportBindings(
      classSource,
      classSpan.name,
      classFilePath,
      classSpan.line,
    );
  } catch (error) {
    throw categorizedBindingRefusal(error, "class_binding_export_form_not_resolved");
  }

  const bindings: ClassInstantiationBindingReport[] = [
    { filePath: classFilePath, localName: classSpan.name, form: "local_declaration" },
  ];
  // O arquivo da declaração é o único que esta resolução abre por conta
  // própria (`classSource`, acima). Todo outro arquivo só é aberto dentro de
  // `findCrossFileCallerBindings`, que roda no laço abaixo — e o laço não
  // executa quando `exportBindings` está vazio. Por isso a lista é acumulada
  // pela própria varredura, em vez de afirmada de antemão a partir de
  // `allSources`: sem ligação exportada, nenhum outro arquivo é varrido, e
  // relatar a lista inteira seria afirmar varredura não exercida.
  const scannedFilePaths = [classFilePath];
  for (const exportBinding of exportBindings) {
    let fileBindings: CallerFileBinding[];
    try {
      fileBindings = findCrossFileCallerBindings(
        classFilePath,
        classSpan.name,
        exportBinding,
        allSources,
        sourcesByPath,
        scannedFilePaths,
      );
    } catch (error) {
      throw categorizedBindingRefusal(error, "class_binding_cross_file_form_not_resolved");
    }
    for (const fileBinding of fileBindings) {
      const already = bindings.some(
        (other) =>
          other.filePath === fileBinding.filePath && other.localName === fileBinding.localName,
      );
      if (already) continue;
      bindings.push({
        filePath: fileBinding.filePath,
        localName: fileBinding.localName,
        form:
          exportBinding.kind === "default"
            ? "default_import"
            : fileBinding.localName === classSpan.name
              ? "named_import"
              : "aliased_named_import",
      });
    }
  }

  return {
    exportForm: describeExportBindings(exportBindings),
    // O que a varredura de fato abriu, registrado por ela enquanto abria —
    // nunca a lista de `allSources` afirmada sem a varredura ter rodado.
    scannedFilePaths,
    bindings,
  };
}

/** Caractere que, imediatamente antes do nome, o põe em posição de TIPO: anotação e tipo de retorno (`:`), argumento de genérico (`<`), união e interseção (`|`, `&`). */
const TYPE_POSITION_PRECEDING_CHARS = new Set([":", "<", "|", "&"]);

/** Palavra que, imediatamente antes do nome, o põe em posição de TIPO. `extends` não está aqui de propósito: herança de classe é posição de valor e estende a superfície. */
const TYPE_POSITION_PRECEDING_WORDS = new Set([
  "as",
  "satisfies",
  "typeof",
  "keyof",
  "implements",
  "interface",
]);

/**
 * A parte de uma construção `export` em que o nome está em posição de
 * **ligação**, e não de valor. Só essa parte isenta o nome da recusa de
 * `refuseClassReferencesOutsideInstantiation`.
 *
 * A construção inteira não serve como isenção: o lado DIREITO de
 * `export const X = <Classe>;` e o que vem depois de `extends` em
 * `export class Sub extends <Classe> {` estão dentro do texto da construção,
 * mas ali o nome é um valor repassado adiante — exatamente a referência que
 * `class_binding_reference_forwarded_as_value` existe para recusar. Isentar
 * por estar "dentro de um `export`" apagaria essa recusa em silêncio.
 *
 * A forma é reconhecida contra uma allowlist fechada; fora dela o resultado
 * é explícito (`recognized: false`), nunca um `whole` silencioso — quem
 * consome decide, por ocorrência, se isso vira recusa.
 *
 * Por forma:
 * - `export type` / `export interface`: posição de tipo do começo ao fim
 *   (inclusive o `extends` de uma interface, que não captura construtor);
 *   a construção inteira isenta.
 * - `export class` / `export default class`: isenta até o `extends`; a
 *   superclasse fica de fora, como ficaria fora de qualquer `export`.
 * - `export const` / `let` / `var`: isenta até o `=`; o valor atribuído
 *   fica de fora. Quando não atribui valor algum (`export const enum`, uma
 *   `declare const` ambiente), a construção inteira isenta. Quando atribui
 *   mas o `=` de topo não é localizado, não é reconhecida — é forma não
 *   resolvida, não isenção.
 * - `export function` / `export async function` / `export default function`:
 *   a construção é a própria ligação exportada; isenta inteira (o cabeçalho
 *   já para antes do corpo, em `exportConstructText`).
 * - `export default <identificador>`: reexporta o identificador como
 *   ligação de módulo; isenta inteira. Qualquer outro `export default`
 *   (expressão, literal, chamada) não casa aqui e cai fora da allowlist.
 * - `export { X as Y }` / `export * from "..."`: a lista ou o repasse é a
 *   própria ligação exportada; isenta inteira.
 * - todas as formas acima valem com `declare` na frente.
 * - qualquer outra forma (`export =`, `export namespace`, `export default`
 *   de expressão, etc.): não reconhecida.
 */
function exportConstructBindingRange(construct: {
  index: number;
  text: string;
}):
  | { recognized: true; start: number; end: number }
  | { recognized: false; start: number; end: number } {
  const { index, text } = construct;
  const whole = { start: index, end: index + text.length };

  if (/^export\s+(?:declare\s+)?(?:type|interface)\b/.test(text)) {
    return { recognized: true, ...whole };
  }

  if (/^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\b/.test(text)) {
    const heritage = /\bextends\b/.exec(text);
    return heritage === null
      ? { recognized: true, ...whole }
      : { recognized: true, start: index, end: index + heritage.index };
  }

  if (/^export\s+(?:default\s+)?(?:declare\s+)?(?:const|let|var)\b/.test(text)) {
    const assignment = findTopLevelAssignmentIndex(text);
    if (assignment.found) {
      return { recognized: true, start: index, end: index + assignment.index + 1 };
    }
    return assignment.resolved ? { recognized: true, ...whole } : { recognized: false, ...whole };
  }

  if (/^export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\b/.test(text)) {
    return { recognized: true, ...whole };
  }

  if (/^export\s+default\s+[A-Za-z_$][\w$]*\s*$/.test(text)) {
    return { recognized: true, ...whole };
  }

  if (/^export\s+(?:declare\s+)?\{/.test(text)) return { recognized: true, ...whole };

  if (/^export\s+\*/.test(text)) return { recognized: true, ...whole };

  return { recognized: false, ...whole };
}

/** Resultado da busca pelo `=` de atribuição de topo de uma construção `const`/`let`/`var`. */
type TopLevelAssignmentSearch =
  | { found: true; index: number }
  | { found: false; resolved: true }
  | { found: false; resolved: false };

/**
 * Busca o `=` de atribuição de `text`, fora de aspas e fora de qualquer par
 * `()`/`[]`/`{}`/`<>`. Comparações (`==`, `===`, `!=`, `<=`, `>=`) e a seta de
 * arrow (`=>`) não são atribuição e não contam.
 *
 * `{ found: false, resolved: true }` é a construção que de fato não atribui
 * valor algum: todo par de bracket fechou (profundidade volta a zero) e
 * nenhum `=` de topo apareceu — `export const enum`, uma `declare const`
 * ambiente.
 *
 * `{ found: false, resolved: false }` é quando a profundidade nunca volta a
 * zero: sinal de que um `<`/`>` foi contado como par de bracket sem ser um, e
 * o `=` de topo pode estar escondido atrás dessa contagem errada — forma não
 * resolvida, não isenção.
 */
function findTopLevelAssignmentIndex(text: string): TopLevelAssignmentSearch {
  const quoteMask = computeQuoteMask(text, text.length);
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (quoteMask[i]) continue;
    const char = text[i];
    if (char === "(" || char === "[" || char === "{" || char === "<") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}" || char === ">") {
      if (depth > 0) depth -= 1;
      continue;
    }
    if (depth > 0 || char !== "=") continue;
    if (text[i + 1] === "=" || text[i + 1] === ">") continue;
    if (i > 0 && ["=", "!", "<", ">", "+", "-", "*", "/", "%", "&", "|", "^"].includes(text[i - 1])) {
      continue;
    }
    return { found: true, index: i };
  }
  return { found: false, resolved: depth === 0 };
}

/**
 * Toda ocorrência do nome ligado, num arquivo candidato, que **não** é a
 * instanciação. Ficam de fora da recusa, cada uma por um motivo próprio: a
 * cláusula de import que liga o nome, o lado de ligação da construção
 * `export` que o exporta (nunca o lado de valor dela — ver
 * `exportConstructBindingRange`), a
 * própria declaração `class`, e a posição de tipo — anotação, tipo de
 * retorno, argumento de genérico, união ou interseção, `as`/`satisfies`/
 * `typeof`/`keyof`/`implements` —, que não captura o construtor como valor e
 * portanto não alcança instanciação alguma.
 *
 * Toda outra ocorrência é posição de valor: atribuição a outro nome,
 * argumento passado adiante, `extends`. Por ela a classe alcança
 * instanciações que esta leitura não percorre, e isso recusa em voz alta,
 * com `arquivo:linha` e categoria nomeada.
 *
 * A ordem das isenções importa e é fail-closed: a ocorrência que cai dentro
 * de uma construção `export` de forma **não reconhecida** recusa antes de a
 * heurística de posição de tipo ser consultada. Dentro de uma forma que a
 * leitura não sabe recortar, os caracteres em que essa heurística se apoia
 * não são confiáveis — o `:` de `export default { C: <Classe> };` separa
 * chave de valor num literal de objeto, não anota tipo. Só a declaração
 * `class` local e a cláusula de import, que independem da forma do `export`
 * que as envolva, são conferidas antes.
 */
function refuseClassReferencesOutsideInstantiation(
  source: string,
  filePath: string,
  localName: string,
  instantiationIndexes: Set<number>,
): void {
  const quoteMask = computeQuoteMask(source, source.length);
  const importRanges = findImportDeclarations(source).map((declaration) => ({
    start: declaration.index,
    end: declaration.endIndex,
  }));
  const exportConstructResults = findExportConstructs(source).map(exportConstructBindingRange);
  const exportRanges = exportConstructResults.filter((result) => result.recognized);
  const unrecognizedExportRanges = exportConstructResults.filter((result) => !result.recognized);
  const pattern = new RegExp(`\\b${localName}\\b`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const { index } = match;
    if (quoteMask[index]) continue;
    if (instantiationIndexes.has(index)) continue;
    // A declaração da classe no próprio arquivo é a ligação local, não uma
    // referência a ela.
    const precedingWord = wordEndingAt(source, index);
    if (precedingWord === "class") continue;
    const inRange = (range: { start: number; end: number }): boolean =>
      index >= range.start && index < range.end;
    if (importRanges.some(inRange)) continue;

    const line = lineAt(source, index);
    const context = source
      .slice(Math.max(0, index - 40), index + localName.length + 20)
      .replace(/\s+/gu, " ")
      .trim();
    // A recusa por forma não reconhecida vem ANTES da heurística de posição
    // de tipo, e é essa ordem que a torna fail-closed. Dentro de uma forma
    // que a leitura não sabe recortar, o `:` de `export default { C: X };` e
    // o `<` de uma construção cuja profundidade não fecha são indistinguíveis
    // de anotação de tipo por caractere anterior: ali `C: X` é propriedade de
    // objeto literal, posição de VALOR. Consultar a heurística primeiro
    // isentaria justamente o repasse que esta categoria existe para recusar.
    // A isenção de posição de tipo continua intacta fora dessas formas —
    // `TYPE_POSITION_PRECEDING_CHARS` e `TYPE_POSITION_PRECEDING_WORDS` não
    // mudaram, e forma reconhecida continua consultando as duas.
    if (unrecognizedExportRanges.some(inRange)) {
      throw classBindingRefusal(
        filePath,
        line,
        `"${localName}" aparece dentro de uma construção "export" cuja forma não está na allowlist reconhecida ("${context}") — sem forma reconhecida, a ocorrência não pode ser confirmada como ligação exportada`,
        "class_binding_export_construct_form_unrecognized",
      );
    }
    if (TYPE_POSITION_PRECEDING_WORDS.has(precedingWord)) continue;
    let before = index;
    while (before > 0 && /\s/.test(source[before - 1])) before -= 1;
    if (before > 0 && TYPE_POSITION_PRECEDING_CHARS.has(source[before - 1])) continue;
    if (exportRanges.some(inRange)) continue;

    throw classBindingRefusal(
      filePath,
      line,
      `"${localName}" está ligado à declaração da classe, mas aparece aqui em posição de valor, fora de "new ${localName}(" ("${context}") — por essa referência a classe alcança instanciações que esta leitura não percorre`,
      "class_binding_reference_forwarded_as_value",
    );
  }
}

/** Toda instanciação da declaração `classSpan` nas duas árvores, reconhecida só por ligação resolvida, mais o que a varredura leu para poder afirmá-lo. */
function findInstantiationsOfClassDeclaration(
  classFilePath: string,
  classSpan: ClassSpan,
  allSources: { filePath: string; source: string }[],
  sourcesByPath: Map<string, string>,
): { sites: ClassInstantiationSite[]; resolution: ClassInstantiationBindingResolution } {
  const resolution = resolveClassInstantiationBindings(
    classFilePath,
    classSpan,
    allSources,
    sourcesByPath,
  );
  const sites: ClassInstantiationSite[] = [];
  for (const binding of resolution.bindings) {
    const source = sourcesByPath.get(binding.filePath);
    if (source === undefined) {
      throw classBindingRefusal(
        binding.filePath,
        classSpan.line,
        `a ligação de "${binding.localName}" até a declaração de "${classSpan.name}" foi resolvida, mas o texto de ${binding.filePath} não está entre os arquivos lidos`,
        "class_binding_cross_file_form_not_resolved",
      );
    }
    const found = findClassInstantiations(source, binding.filePath, binding);
    refuseClassReferencesOutsideInstantiation(
      source,
      binding.filePath,
      binding.localName,
      new Set(found.map((site) => site.callIndex)),
    );
    sites.push(...found);
  }
  return { sites, resolution };
}

interface ClassMethodBody {
  braceIndex: number;
  bodyStart: number;
  bodyEnd: number;
  line: number;
}

/** Todo método (corpo de função) diretamente no nível do corpo de classe `[bodyStart, bodyEnd)` — não desce a função aninhada dentro de outro método. */
function findTopLevelMethodBodies(source: string, bodyStart: number, bodyEnd: number): ClassMethodBody[] {
  const quoteMask = computeQuoteMask(source, bodyEnd);
  const methods: ClassMethodBody[] = [];
  let i = bodyStart;
  while (i < bodyEnd) {
    if (quoteMask[i]) {
      i += 1;
      continue;
    }
    if (source[i] === "{") {
      if (isFunctionBodyOpenBrace(source, quoteMask, i)) {
        const methodBodyEnd = findMatchingDelimiterEnd(source, i, "{", "}");
        methods.push({ braceIndex: i, bodyStart: i + 1, bodyEnd: methodBodyEnd, line: lineAt(source, i) });
        i = methodBodyEnd + 1;
        continue;
      }
      i = findMatchingDelimiterEnd(source, i, "{", "}") + 1;
      continue;
    }
    i += 1;
  }
  return methods;
}

/** Palavra imediatamente antes de `index` (espaços pulados), com o intervalo de onde ela sai. */
function wordSpanEndingAt(
  source: string,
  index: number,
): { name: string; start: number; end: number } {
  let end = index;
  while (end > 0 && /\s/.test(source[end - 1])) end -= 1;
  let start = end;
  while (start > 0 && /[\w$]/.test(source[start - 1])) start -= 1;
  return { name: source.slice(start, end), start, end };
}

/** Palavras a que a derivação do nome pode chegar sem que haja nome de membro ali — chegar a uma delas é forma não reconhecida, não nome. */
const NOT_A_CLASS_MEMBER_NAME = new Set([
  ...NOT_A_FUNCTION_NAME,
  ...CONTROL_FLOW_KEYWORDS,
  "async",
  "function",
  "static",
  "readonly",
  "public",
  "private",
  "protected",
]);

/**
 * Nome do membro de classe cujo corpo abre em `braceIndex`, e o índice em que
 * esse nome começa. O nome é derivado da declaração, andando para trás a
 * partir da lista de parâmetros: método comum (`nome(…) {}`), método
 * assíncrono, genérico (`nome<T>(…) {}`) e membro em forma de
 * propriedade-arrow (`nome = async (…) => {}`) caem todos no mesmo nome. O
 * nome derivado é conferido: forma que não produz identificador — nome
 * computado, ou qualquer forma nova — derruba a leitura com `arquivo:linha`,
 * em vez de classificar o membro sob um nome errado (`async`) ou vazio.
 */
function methodNameSpanAtBrace(
  source: string,
  braceIndex: number,
  filePath: string,
  line: number,
): { name: string; nameStartIndex: number } {
  const quoteMask = computeQuoteMask(source, braceIndex);
  const closeParenIndex = findParameterListCloseParen(source, quoteMask, braceIndex);
  if (closeParenIndex === undefined) {
    throw new Error(`${filePath}:${line}: método de classe sem lista de parâmetros reconhecível`);
  }
  const openParenIndex = findMatchingDelimiterStart(source, quoteMask, closeParenIndex, "(", ")");
  const nameEndIndex = skipGenericParametersBackward(source, quoteMask, openParenIndex);

  let span = wordSpanEndingAt(source, nameEndIndex);
  // `nome = async function (…) {}` / `nome = async (…) => {}`: entre o nome e
  // a lista de parâmetros há palavras que não são nome de membro.
  for (let step = 0; step < 2 && (span.name === "async" || span.name === "function"); step += 1) {
    span = wordSpanEndingAt(source, span.start);
  }
  if (span.name === "") {
    // Forma de propriedade: o nome está do outro lado do "=" da atribuição.
    let i = span.start;
    while (i > 0 && /\s/.test(source[i - 1])) i -= 1;
    const isPlainAssignment =
      i > 0 && source[i - 1] === "=" && !"=!<>+-*/%&|^".includes(source[i - 2] ?? "");
    if (isPlainAssignment) span = wordSpanEndingAt(source, i - 1);
  }

  if (!/^[A-Za-z_$][\w$]*$/u.test(span.name) || NOT_A_CLASS_MEMBER_NAME.has(span.name)) {
    throw new Error(
      `${filePath}:${line}: membro de classe cuja forma não dá nome derivável da declaração (a derivação chegou a "${span.name}") — um membro sem nome derivado não é classificado em silêncio`,
    );
  }
  return { name: span.name, nameStartIndex: span.start };
}

/** Nome do método cujo corpo abre em `braceIndex`, computado da lista de parâmetros — nunca escrito à mão. */
function methodNameAtBrace(source: string, braceIndex: number, filePath: string, line: number): string {
  return methodNameSpanAtBrace(source, braceIndex, filePath, line).name;
}

/** true se a declaração do método em `braceIndex` tiver o modificador `private`/`protected` antes do nome. */
function isNonPublicClassMember(
  source: string,
  braceIndex: number,
  filePath: string,
  line: number,
): boolean {
  const { nameStartIndex } = methodNameSpanAtBrace(source, braceIndex, filePath, line);
  let boundary = nameStartIndex - 1;
  while (boundary >= 0 && !"{};".includes(source[boundary])) boundary -= 1;
  const modifiers = source.slice(boundary + 1, nameStartIndex).trim().split(/\s+/);
  return modifiers.includes("private") || modifiers.includes("protected");
}

/** Um membro de topo da classe fora da superfície alcançável de fora, com o motivo de estar fora. */
export interface NonReachingClassMember {
  name: string;
  reason: string;
}

/** Superfície de um cliente HTTP interno: membros de topo que alcançam `fetch`, direto ou por delegação transitiva a outro membro público da mesma classe, e todo membro fora dela com o motivo escrito. */
interface InternalClientMemberSurface {
  reachingMembers: string[];
  excludedMembers: NonReachingClassMember[];
  /** Método HTTP default de um membro, só quando o próprio `fetch(` dentro dele tem um `method:` estático (ou ausente, GET por spec) — nunca escrito à mão por nome de membro. */
  staticMethodDefaults: Map<string, string>;
}

/** Método HTTP do único `fetch(` direto de `method`, se estático (literal ou ausente = GET), ou `undefined` se dinâmico ou ambíguo. */
function staticFetchMethodOfMember(
  source: string,
  method: ClassMethodBody,
  rawFetchCalls: RawFetchOccurrence[],
): string | undefined {
  const callsInBody = rawFetchCalls.filter(
    (call) => call.index >= method.bodyStart && call.index < method.bodyEnd,
  );
  if (callsInBody.length !== 1) return undefined;
  const call = callsInBody[0];
  const openParenIndex = call.index + "fetch(".length - 1;
  const closeParenIndex = findMatchingDelimiterEnd(source, openParenIndex, "(", ")");
  const callArgs = splitTopLevelItems(source.slice(openParenIndex + 1, closeParenIndex));
  const optionsArgText = (callArgs[1] ?? "").trim();
  if (optionsArgText === "") return "GET";
  const objectMatch = optionsArgText.match(/^\{([\s\S]*)\}$/);
  if (objectMatch === null) return undefined;
  const methodText = findObjectPropertyExpression(objectMatch[1], "method");
  if (methodText === undefined) return "GET";
  const literalMatch = methodText.trim().match(/^(["'`])([\s\S]*)\1$/);
  return literalMatch ? literalMatch[2] : undefined;
}

/**
 * Computa, da declaração da classe (nunca de nome de método escrito à mão),
 * quais membros de topo alcançam `fetch` — direto, ou por delegação
 * transitiva via `this.<membro>(` a outro membro da mesma classe — e filtra
 * dessa alcançabilidade os membros `private`/`protected`: eles não são
 * chamáveis como `this.<campo>.<membro>(` de fora da classe, então não
 * integram a superfície mesmo quando alcançam `fetch`. Delegação em ciclo
 * derruba a leitura, nomeando o membro; nenhum membro sai do cálculo sem
 * entrar na superfície ou na lista de excluídos com motivo.
 */
function computeInternalClientMemberSurface(
  source: string,
  classSpan: ClassSpan,
  filePath: string,
): InternalClientMemberSurface {
  const methods = findTopLevelMethodBodies(source, classSpan.bodyStart, classSpan.bodyEnd);
  const spans = methods.map((method) => ({
    method,
    ...methodNameSpanAtBrace(source, method.braceIndex, filePath, method.line),
  }));
  const byName = new Map(spans.map((span) => [span.name, span]));

  const { calls: rawFetchCalls } = findRawFetchOccurrences(source, filePath);
  const reachesFetchDirectly = (method: ClassMethodBody): boolean =>
    rawFetchCalls.some((call) => call.index >= method.bodyStart && call.index < method.bodyEnd);

  const delegateNames = (method: ClassMethodBody): string[] => {
    const body = source.slice(method.bodyStart, method.bodyEnd);
    const pattern = /\bthis\.([A-Za-z_$][\w$]*)\(/g;
    const names = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body))) {
      if (byName.has(match[1])) names.add(match[1]);
    }
    return Array.from(names);
  };

  const resolving = new Set<string>();
  const resolved = new Map<string, boolean>();
  const reachesFetch = (name: string): boolean => {
    const cached = resolved.get(name);
    if (cached !== undefined) return cached;
    const span = byName.get(name);
    if (span === undefined) return false;
    if (resolving.has(name)) {
      throw new Error(
        `${filePath}:${span.method.line}: delegação entre membros da classe forma ciclo em "${name}" — um ciclo não é resolvido em silêncio`,
      );
    }
    resolving.add(name);
    const result =
      reachesFetchDirectly(span.method) || delegateNames(span.method).some((delegate) => reachesFetch(delegate));
    resolving.delete(name);
    resolved.set(name, result);
    return result;
  };

  const reachingMembers: string[] = [];
  const excludedMembers: NonReachingClassMember[] = [];
  const staticMethodDefaults = new Map<string, string>();
  for (const { name, method } of spans) {
    if (!reachesFetch(name)) {
      const delegates = delegateNames(method);
      excludedMembers.push({
        name,
        reason:
          delegates.length === 0
            ? `"${name}" não chama fetch nem delega (via this.<membro>(...)) a outro membro da classe`
            : `"${name}" delega a ${delegates.map((delegate) => `"${delegate}"`).join(", ")}, e nenhum desses membros alcança fetch`,
      });
      continue;
    }
    if (isNonPublicClassMember(source, method.braceIndex, filePath, method.line)) {
      excludedMembers.push({
        name,
        reason: `"${name}" alcança fetch, mas é membro private/protected da classe: não é chamável como this.<campo>.${name}(...) de fora dela`,
      });
      continue;
    }
    reachingMembers.push(name);
    const staticMethod = staticFetchMethodOfMember(source, method, rawFetchCalls);
    if (staticMethod !== undefined) staticMethodDefaults.set(name, staticMethod);
  }

  if (reachingMembers.length === 0) {
    throw new Error(
      `${filePath}: nenhum membro público da classe alcança fetch — a superfície do cliente HTTP interno ficaria vazia`,
    );
  }

  return { reachingMembers, excludedMembers, staticMethodDefaults };
}

/* =========================================================================
 * Uso do campo cliente lido por enumeração fail-closed (Goal047 / WU-01) —
 * depois de provar que aquela instanciação é daquela classe e que a
 * instância foi guardada num campo, o uso do campo deixa de ser reconhecido
 * por uma expressão regular sobre `this.<campo>.<membro>(`.
 *
 * A enumeração é do **receptor**, não do texto `this.<campo>`: toda
 * ocorrência de `this` dentro do corpo da classe dona é lida, e só a forma
 * `this.<identificador>` deixa a leitura decidir de qual campo se trata.
 * Procurar o texto `this.<campo>` seria fail-open de novo, porque o campo
 * também é alcançado sem esse texto aparecer: `this["<campo>"]`,
 * `this?.<campo>`, `const { <campo> } = this` e `const alias = this` chegam
 * ao mesmo campo, e cada um deles faria a rota sumir sem recusa alguma.
 *
 * Cada ocorrência cai em exatamente uma saída: chamada de transporte,
 * chamada de membro fora da superfície, recusa com `arquivo:linha`,
 * contexto e categoria nomeada, ou — só quando a leitura prova que o
 * receptor alcança **outro** campo (`this.<outro>`) — nada. Não existe
 * saída que ignore ocorrência por não reconhecê-la.
 *
 * A recusa é escopada à ocorrência sobre `this`, não ao nome solto:
 * propriedade homônima de outro objeto (`outro.<campo>`) não tem `this` como
 * receptor e não entra, ocorrência dentro de aspas é descartada pela
 * máscara de `computeQuoteMask`, e comentário já veio apagado por
 * `blankComments` — nenhuma das três conta nem recusa.
 * ========================================================================= */

/** Categorias nomeadas com que a leitura do uso do campo cliente recusa. Toda recusa deste caminho sai sob uma delas. Array em runtime: a suíte e a documentação permanente conferem contra ele, em vez de contra união escrita à mão. */
export const CLIENT_FIELD_USE_REFUSAL_CATEGORIES = [
  /** A ocorrência do campo está no corpo da classe mas fora de todo corpo de método de topo: inicializador de campo, bloco estático, ou forma que `findTopLevelMethodBodies` não devolve. */
  "client_field_use_outside_top_level_method_body",
  /** `this.<campo>?.<membro>(`: o encadeamento opcional não é a forma de chamada que esta leitura converte em requisição. */
  "client_field_use_optional_chaining",
  /** `this.<campo>["<membro>"]` e demais acessos computados: o membro não é um identificador escrito na própria chamada. */
  "client_field_use_computed_member_access",
  /** `const { <membro> } = this.<campo>`: o membro sai do campo por desestruturação e é invocado depois, fora desta ocorrência. */
  "client_field_use_destructured",
  /** `this.<campo>.<membro>` sem `(` imediato: o membro é lido como valor (repasse de referência, forma genérica), não invocado aqui. */
  "client_field_use_member_not_invoked",
  /** Depois do `.` não há identificador de membro derivável — nome privado, forma nova. */
  "client_field_use_member_name_not_derivable",
  /** A ocorrência não é acesso a membro: alias em variável local, argumento passado adiante, `as`/`!` sobre o campo. Por ela o campo alcança chamadas que esta leitura não percorre. */
  "client_field_use_field_forwarded_as_value",
  /** `this?.<campo>`: o encadeamento opcional está no **receptor**, antes do nome do campo, e o texto `this.<campo>` nunca aparece. */
  "client_field_use_receiver_optional_chaining",
  /** `this["<campo>"]` e demais acessos computados sobre `this`: qual campo o receptor alcança não é um identificador escrito no próprio acesso. */
  "client_field_use_receiver_computed_member_access",
  /** `const { <campo> } = this`: o próprio `this` é desestruturado, e o campo sai dele por ligação que esta leitura não percorre. */
  "client_field_use_receiver_destructured",
  /** `const alias = this`, `entregar(this)`, `this` em posição de valor ou de tipo: a instância inteira escapa, e com ela todo campo dela. */
  "client_field_use_receiver_forwarded_as_value",
  /** Depois do `.` sobre `this` não há identificador de campo derivável — nome privado, forma nova: a leitura não decide se o receptor alcança o campo cliente. */
  "client_field_use_receiver_field_name_not_derivable",
] as const;

/** Categoria nomeada com que a leitura do uso do campo cliente recusa, derivada de {@link CLIENT_FIELD_USE_REFUSAL_CATEGORIES}. */
export type ClientFieldUseRefusalCategory = (typeof CLIENT_FIELD_USE_REFUSAL_CATEGORIES)[number];

/** Recusa deste caminho: `arquivo:linha`, o trecho de contexto da ocorrência, e a categoria nomeada da forma. */
function clientFieldUseRefusal(
  filePath: string,
  line: number,
  detail: string,
  category: ClientFieldUseRefusalCategory,
): Error {
  return new Error(`${filePath}:${line}: ${detail} [categoria: ${category}]`);
}

/** Uma ocorrência de `this.<campo>` reconhecida como chamada de membro do cliente, com o membro invocado e o corpo de método de topo em que ela está. */
interface ClientFieldMemberCall {
  line: number;
  memberName: string;
  /** Índice do `(` que abre a lista de argumentos da chamada. */
  openParenIndex: number;
  method: ClassMethodBody;
}

/** Primeiro índice não-espaço a partir de (inclusive) `from`, limitado a `limit`. É o índice, não o caractere de `firstNonWhitespaceCharAfter`: a leitura precisa da posição do `(` para recortar a lista de argumentos com `findMatchingDelimiterEnd`. */
function nextNonWhitespaceIndex(source: string, from: number, limit: number): number {
  let i = from;
  while (i < limit && /\s/u.test(source[i])) i += 1;
  return i;
}

/**
 * Desmarca, na máscara de aspas, as faixas `${...}` **de template literal**
 * do intervalo dado: o que está dentro delas é código, não texto.
 * `computeQuoteMask` marca o template inteiro, e uma chamada interpolada
 * (`${this.<campo>.<membro>(...)}`) ficaria invisível — o mesmo fail-open
 * que esta leitura existe para fechar.
 *
 * Só desmarca faixa aberta por **crase**: `${` é interpolação apenas dentro
 * de template literal. Dentro de string comum (`"..."`, `'...'`) o mesmo
 * texto é texto, e desmarcá-lo faria uma ocorrência do campo escrita dentro
 * de uma string passar a contar e a recusar — o oposto do escopo declarado,
 * em que texto de string não conta nem recusa. Quem decide é
 * `computeQuoteOpenerMask`, que guarda o delimitador que abriu cada região.
 *
 * A máscara interna de cada faixa é a que a mesma varredura computa para
 * ela, então texto de template ou de string aninhado dentro da interpolação
 * continua marcado — e a interpolação de um template aninhado, por ter
 * crase como delimitador de abertura próprio, é desmarcada pela iteração
 * seguinte do mesmo laço.
 */
function unmaskTemplateInterpolations(
  source: string,
  quoteMask: boolean[],
  from: number,
  to: number,
): void {
  const openerMask = computeQuoteOpenerMask(source, to);
  for (let i = from; i < to - 1; i += 1) {
    if (!quoteMask[i] || openerMask[i] !== "`") continue;
    if (source[i] !== "$" || source[i + 1] !== "{") continue;
    const closeIndex = findMatchingDelimiterEnd(source, i + 1, "{", "}");
    const innerStart = i + 2;
    const innerOpenerMask = computeQuoteOpenerMask(
      source.slice(innerStart, closeIndex),
      closeIndex - innerStart,
    );
    for (let j = innerStart; j < closeIndex && j < to; j += 1) {
      const opener = innerOpenerMask[j - innerStart];
      openerMask[j] = opener;
      quoteMask[j] = opener !== undefined;
    }
  }
}

/**
 * Toda ocorrência de `this` no corpo da classe `classSpan`, reduzida às que
 * são chamada de membro do campo cliente. Qualquer outra forma **recusa**
 * com `arquivo:linha`, contexto e categoria nomeada — é essa recusa, e não um
 * `continue` mudo, que faz a leitura ser fail-closed: pela leitura anterior,
 * por formato de texto, uma rota saía do conjunto sem acrescentar sítio de
 * `fetch` algum sempre que a chamada estivesse numa forma não casada.
 *
 * A enumeração é do **receptor**: o laço percorre o token `this`, não o texto
 * `this.<campo>`. Procurar `this.<campo>` seria fail-open de novo, porque o
 * campo é alcançado sem esse texto aparecer — `this?.<campo>`,
 * `this["<campo>"]`, `const { <campo> } = this` e `const alias = this`
 * chegam todos ao mesmo campo, e cada um deles faria a rota sumir sem recusa
 * alguma.
 *
 * A ordem de decisão é: forma do receptor, depois localização, depois forma
 * do uso. A forma do receptor vem primeiro porque é ela que decide se a
 * ocorrência sequer alcança este campo.
 *
 * A única ocorrência isenta é a atribuição que guarda a própria instância no
 * campo (`this.<campo> = new <Classe>(`): ela é a instanciação já provada,
 * não um uso do campo. Ocorrência que prova alcançar **outro** campo
 * (`this.<outro>`) não recusa e não conta: a recusa é escopada à ocorrência
 * deste campo, não ao nome solto.
 *
 * Ocorrência dentro de corpo de função aninhada a um método de topo continua
 * sendo chamada daquele método — o corpo aninhado está dentro da faixa que
 * `findTopLevelMethodBodies` devolve, e é a faixa que decide. Fora de toda
 * faixa (inicializador de campo, bloco estático) a ocorrência recusa.
 */
function enumerateClientFieldMemberCalls(
  source: string,
  filePath: string,
  classSpan: ClassSpan,
  fieldName: string,
  methods: ClassMethodBody[],
  instantiationCallIndex: number,
): ClientFieldMemberCall[] {
  // `blankComments` preserva índices: todo índice de `scan` vale igual em
  // `source`, de onde sai o trecho de contexto da recusa. A leitura percorre
  // `scan` para que `this` citado em comentário não conte nem recuse.
  const scan = blankComments(source);
  const quoteMask = computeQuoteMask(scan, classSpan.bodyEnd);
  unmaskTemplateInterpolations(scan, quoteMask, classSpan.bodyStart, classSpan.bodyEnd);
  const pattern = /\bthis\b/gu;
  pattern.lastIndex = classSpan.bodyStart;
  const calls: ClientFieldMemberCall[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(scan)) && match.index < classSpan.bodyEnd) {
    const index = match.index;
    if (quoteMask[index]) continue;

    const line = lineAt(source, index);
    const context = source
      .slice(Math.max(0, index - 40), Math.min(source.length, index + 80))
      .replace(/\s+/gu, " ")
      .trim();
    const refuse = (detail: string, category: ClientFieldUseRefusalCategory): Error =>
      clientFieldUseRefusal(filePath, line, `${detail} ("${context}")`, category);

    // --- Forma do receptor: por onde esta ocorrência de `this` alcança (ou
    // deixa de alcançar) um campo nomeado.
    const afterThisIndex = nextNonWhitespaceIndex(scan, index + "this".length, classSpan.bodyEnd);
    const afterThisChar = scan[afterThisIndex];
    let fieldAccessStart: number;
    let optionalReceiver = false;
    if (afterThisChar === "?") {
      const afterQuestionIndex = nextNonWhitespaceIndex(scan, afterThisIndex + 1, classSpan.bodyEnd);
      if (scan[afterQuestionIndex] !== ".") {
        throw refuse(
          "this aparece em posição de valor (condição de ternário), fora de acesso a campo: a instância inteira escapa, e com ela todo campo dela",
          "client_field_use_receiver_forwarded_as_value",
        );
      }
      optionalReceiver = true;
      fieldAccessStart = afterQuestionIndex + 1;
    } else if (afterThisChar === "[") {
      throw refuse(
        `this é acessado por índice computado, e qual campo o receptor alcança não é identificador escrito no acesso: a leitura não decide se ele alcança ${fieldName}`,
        "client_field_use_receiver_computed_member_access",
      );
    } else if (afterThisChar === ".") {
      fieldAccessStart = afterThisIndex + 1;
    } else {
      const receiverDestructured = /\}\s*=\s*$/u.test(scan.slice(Math.max(0, index - 200), index));
      throw receiverDestructured
        ? refuse(
            `this é desestruturado: o campo sai da instância aqui por ligação que esta leitura não percorre, e o texto this.${fieldName} nunca aparece`,
            "client_field_use_receiver_destructured",
          )
        : refuse(
            "this aparece em posição de valor, fora de acesso a campo: a instância inteira escapa, e com ela todo campo dela",
            "client_field_use_receiver_forwarded_as_value",
          );
    }

    const receiverFieldStart = nextNonWhitespaceIndex(scan, fieldAccessStart, classSpan.bodyEnd);
    if (scan[receiverFieldStart] === "[") {
      throw refuse(
        `this é acessado por índice computado, e qual campo o receptor alcança não é identificador escrito no acesso: a leitura não decide se ele alcança ${fieldName}`,
        "client_field_use_receiver_computed_member_access",
      );
    }
    const receiverFieldMatch = /^[A-Za-z_$][\w$]*/u.exec(
      scan.slice(receiverFieldStart, classSpan.bodyEnd),
    );
    if (receiverFieldMatch === null) {
      throw refuse(
        `this é seguido de "." sem nome de campo derivável: a leitura não decide se o receptor alcança ${fieldName}`,
        "client_field_use_receiver_field_name_not_derivable",
      );
    }
    const receiverFieldName = receiverFieldMatch[0];
    // Ocorrência que prova alcançar OUTRO campo não é uso deste campo: não
    // recusa e não conta. É aqui que a recusa fica escopada à ocorrência.
    if (receiverFieldName !== fieldName) continue;
    if (optionalReceiver) {
      throw refuse(
        `this?.${fieldName}: o encadeamento opcional está no receptor, antes do nome do campo`,
        "client_field_use_receiver_optional_chaining",
      );
    }
    const occurrenceEnd = receiverFieldStart + receiverFieldName.length;
    // A atribuição que guarda a instância no campo não é uso do campo: é a
    // instanciação que esta leitura já provou, algumas linhas acima.
    if (/^\s*=\s*new\s+$/u.test(scan.slice(occurrenceEnd, instantiationCallIndex))) continue;

    // --- Localização: dentro de qual corpo de método de topo a ocorrência do
    // campo está.
    const method = methods.find(
      (candidate) => index >= candidate.bodyStart && index < candidate.bodyEnd,
    );
    if (method === undefined) {
      throw refuse(
        `this.${fieldName} aparece no corpo da classe fora de todo corpo de método de topo`,
        "client_field_use_outside_top_level_method_body",
      );
    }

    // --- Forma do uso: o que a ocorrência do campo faz.
    const afterFieldIndex = nextNonWhitespaceIndex(scan, occurrenceEnd, classSpan.bodyEnd);
    const afterFieldChar = scan[afterFieldIndex];
    if (afterFieldChar === "?") {
      throw refuse(
        `this.${fieldName} é usado com encadeamento opcional`,
        "client_field_use_optional_chaining",
      );
    }
    if (afterFieldChar === "[") {
      throw refuse(
        `this.${fieldName} é usado com acesso computado`,
        "client_field_use_computed_member_access",
      );
    }
    if (afterFieldChar !== ".") {
      const isDestructuring = /\}\s*=\s*$/u.test(scan.slice(Math.max(0, index - 200), index));
      throw isDestructuring
        ? refuse(
            `this.${fieldName} é desestruturado: o membro sai do campo aqui e é invocado fora desta ocorrência`,
            "client_field_use_destructured",
          )
        : refuse(
            `this.${fieldName} aparece em posição de valor, fora de acesso a membro`,
            "client_field_use_field_forwarded_as_value",
          );
    }

    const memberStart = nextNonWhitespaceIndex(scan, afterFieldIndex + 1, classSpan.bodyEnd);
    const memberMatch = /^[A-Za-z_$][\w$]*/u.exec(scan.slice(memberStart, classSpan.bodyEnd));
    if (memberMatch === null) {
      throw refuse(
        `this.${fieldName} é seguido de "." sem nome de membro derivável`,
        "client_field_use_member_name_not_derivable",
      );
    }
    const memberName = memberMatch[0];
    const afterMemberIndex = nextNonWhitespaceIndex(
      scan,
      memberStart + memberName.length,
      classSpan.bodyEnd,
    );
    if (scan[afterMemberIndex] !== "(") {
      throw refuse(
        `this.${fieldName}.${memberName} não é invocado nesta ocorrência`,
        "client_field_use_member_not_invoked",
      );
    }

    calls.push({ line, memberName, openParenIndex: afterMemberIndex, method });
  }
  return calls;
}

/**
 * Toda requisição a um cliente HTTP interno cujo primeiro argumento de
 * construtor resolve a uma chave do serviço Go, mais toda montagem de URL
 * que fica de fora desse conjunto (Goal043/WU-01, ver comentário acima).
 *
 * Parte dos sítios `constructor_base_url_*` que `discoverHttpEgressSites` já
 * achou (o `fetch` dentro do cliente HTTP interno) para computar, sem
 * escrever nome de classe algum, qual classe é essa — e então varre as duas
 * árvores atrás de toda instanciação dela.
 */
function discoverGoBoundInternalClientRequests(
  discovery: HttpEgressDiscovery,
  sourcesByPath: Map<string, string>,
  allSources: { filePath: string; source: string }[],
  envSchemaPath: string,
): {
  requests: GoBoundHttpRequest[];
  assembledUrls: AssembledUrlForDelivery[];
  surfaces: InternalClientSurfaceReport[];
  nonTransportMemberCalls: NonTransportMemberCall[];
  nonGoBoundInstantiations: NonGoBoundClassInstantiation[];
} {
  const requests: GoBoundHttpRequest[] = [];
  const assembledUrls: AssembledUrlForDelivery[] = [];
  const surfaces: InternalClientSurfaceReport[] = [];
  const nonTransportMemberCalls: NonTransportMemberCall[] = [];
  const nonGoBoundInstantiations: NonGoBoundClassInstantiation[] = [];
  // Chave pela declaração (arquivo + linha), não pelo nome: duas classes
  // homônimas em arquivos diferentes são duas declarações distintas, e uma
  // chave por nome faz a segunda ser pulada inteiro, produzindo uma única
  // superfície e uma única entrada em internalClientSurfaces onde deveriam
  // existir duas.
  const classSurfaces = new Map<string, InternalClientMemberSurface>();

  const constructorBaseUrlSites = discovery.sites.filter((site) =>
    site.category.startsWith("constructor_base_url_"),
  );

  for (const site of constructorBaseUrlSites) {
    const source = sourcesByPath.get(site.filePath);
    if (source === undefined) {
      throw new Error(
        `${site.filePath}:${site.line}: sítio "${site.category}" foi encontrado, mas o texto de ${site.filePath} não está entre os arquivos lidos`,
      );
    }
    const classSpan = findEnclosingClassSpan(source, indexAtLineStart(source, site.line));
    if (classSpan === undefined) {
      throw new Error(
        `${site.filePath}:${site.line}: sítio "${site.category}" fora de um corpo de classe reconhecível`,
      );
    }
    const classDeclarationKey = `${site.filePath}:${classSpan.line}`;
    if (classSurfaces.has(classDeclarationKey)) continue;
    const surface = computeInternalClientMemberSurface(source, classSpan, site.filePath);
    classSurfaces.set(classDeclarationKey, surface);

    // A instanciação não é procurada por texto em todo arquivo: cada arquivo
    // candidato entra pela ligação que o resolve até ESTA declaração — import
    // nomeado, import sob alias, import default, ou a declaração local. Nome
    // igual sem ligação resolvida não é instanciação desta classe e não é
    // varrido; forma de ligação não convertida derruba a leitura.
    const { sites: instantiations, resolution } = findInstantiationsOfClassDeclaration(
      site.filePath,
      classSpan,
      allSources,
      sourcesByPath,
    );

    surfaces.push({
      className: classSpan.name,
      filePath: site.filePath,
      classLine: classSpan.line,
      reachingMembers: surface.reachingMembers,
      excludedMembers: surface.excludedMembers,
      exportForm: resolution.exportForm,
      scannedFilePathsForInstantiation: resolution.scannedFilePaths,
      instantiationBindings: resolution.bindings,
    });

    for (const instantiation of instantiations) {
      const filePath = instantiation.filePath;
      const candidateSource = sourcesByPath.get(filePath);
      if (candidateSource === undefined) {
        throw new Error(
          `${filePath}:${instantiation.line}: a instanciação foi reconhecida pela ligação até ${classDeclarationKey}, mas o texto de ${filePath} não está entre os arquivos lidos`,
        );
      }
      const destinationArgText = instantiation.argsText[0] ?? "";
      const destination = resolveDestination(
        candidateSource,
        instantiation.callIndex,
        destinationArgText,
        [],
      );
      const goEnvVar = destination.envVars.find((name) => GO_SERVICE_BASE_URL_ENV_VARS.has(name));
      if (goEnvVar === undefined) {
        if (destination.envVars.length > 0) {
          nonGoBoundInstantiations.push({
            filePath,
            line: instantiation.line,
            className: classSpan.name,
            originSite: { filePath: site.filePath, line: site.line },
            reason: `new ${instantiation.localName}(...) em ${filePath}:${instantiation.line} (ligação ${instantiation.bindingForm} até ${classDeclarationKey}) resolve a env.${destination.envVars.join(" e env.")}, e nenhuma dessas chaves é base do serviço Go`,
          });
          continue;
        }
        throw new Error(
          `${filePath}:${instantiation.line}: instância de ${classSpan.name} (new ${instantiation.localName}(, ligação ${instantiation.bindingForm} até ${classDeclarationKey}) tem destino "${destinationArgText}" que não resolve a nenhuma chave de ambiente`,
        );
      }

      const ownerClassSpan = findEnclosingClassSpan(candidateSource, instantiation.callIndex);
      if (ownerClassSpan === undefined) {
        throw new Error(
          `${filePath}:${instantiation.line}: instância de ${classSpan.name} (new ${instantiation.localName}(, ligação ${instantiation.bindingForm} até ${classDeclarationKey}) resolve a env.${goEnvVar} (serviço Go), mas não está dentro de um corpo de classe reconhecível`,
        );
      }
      const fieldName = resolveProvenClassFieldAssignment(
        candidateSource,
        filePath,
        instantiation.callIndex,
        instantiation.line,
        ownerClassSpan,
      );

      const methodBodies = findTopLevelMethodBodies(
        candidateSource,
        ownerClassSpan.bodyStart,
        ownerClassSpan.bodyEnd,
      );
      // Toda ocorrência de `this.<campo>` no corpo da classe dona é
      // enumerada, não só a que casa um formato de chamada: forma que a
      // leitura não converte em chamada de membro recusa aqui dentro, com
      // `arquivo:linha`, contexto e categoria nomeada. O que volta já é só a
      // chamada de membro, e ela ainda é classificada abaixo contra a
      // superfície derivada.
      const fieldMemberCalls = enumerateClientFieldMemberCalls(
        candidateSource,
        filePath,
        ownerClassSpan,
        fieldName,
        methodBodies,
        instantiation.callIndex,
      );

      for (const method of methodBodies) {
        const methodName = methodNameAtBrace(candidateSource, method.braceIndex, filePath, method.line);
        // Toda chamada `this.<campo>.<membro>(` sobre este cliente é lida,
        // não só as da superfície: membro que a declaração da classe tem e
        // que não alcança fetch (ou alcança e é private) é contado fora com
        // o motivo já computado, e membro que a declaração não tem derruba a
        // leitura. Casar só a superfície deixaria a chamada sumir.
        let requestCallCount = 0;
        for (const call of fieldMemberCalls.filter(
          (candidate) => candidate.method.braceIndex === method.braceIndex,
        )) {
          const callKind = call.memberName;
          const line = call.line;
          if (!surface.reachingMembers.includes(callKind)) {
            const excluded = surface.excludedMembers.find((member) => member.name === callKind);
            if (excluded === undefined) {
              throw new Error(
                `${filePath}:${line}: chamada this.${fieldName}.${callKind}(...) sobre um cliente que resolve destino de env.${goEnvVar}, mas "${callKind}" não é membro de topo da declaração de ${classSpan.name} em ${classDeclarationKey} (${surface.reachingMembers.length} na superfície, ${surface.excludedMembers.length} fora dela) — uma chamada que a leitura não classifica não é descartada`,
              );
            }
            nonTransportMemberCalls.push({
              filePath,
              line,
              className: classSpan.name,
              fieldName,
              memberName: callKind,
              originSite: { filePath: site.filePath, line: site.line },
              reason: `this.${fieldName}.${callKind}(...) em ${methodName}() não é requisição ao transporte: ${excluded.reason}`,
            });
            continue;
          }
          requestCallCount += 1;
          const openParenIndex = call.openParenIndex;
          const closeParenIndex = findMatchingDelimiterEnd(candidateSource, openParenIndex, "(", ")");
          const args = splitTopLevelItems(candidateSource.slice(openParenIndex + 1, closeParenIndex));
          const objectMatch = (args[0] ?? "").trim().match(/^\{([\s\S]*)\}$/);
          if (objectMatch === null) {
            throw new Error(
              `${filePath}:${line}: chamada this.${fieldName}.${callKind}(...) sem objeto de opções reconhecível`,
            );
          }
          const pathPropertyText = findObjectPropertyExpression(objectMatch[1], "path");
          if (pathPropertyText === undefined) {
            throw new Error(
              `${filePath}:${line}: chamada this.${fieldName}.${callKind}(...) sem propriedade "path" reconhecível`,
            );
          }
          const methodPropertyText = findObjectPropertyExpression(objectMatch[1], "method");
          const requestMethod =
            methodPropertyText !== undefined
              ? normalizeStringLiteral(methodPropertyText, filePath, line)
              : surface.staticMethodDefaults.get(callKind);
          if (requestMethod === undefined) {
            throw new Error(
              `${filePath}:${line}: chamada this.${fieldName}.${callKind}(...) sem "method" reconhecível e sem default estático no próprio fetch de "${callKind}"`,
            );
          }

          requests.push({
            filePath,
            line,
            method: requestMethod,
            pathExpression: resolvePathExpression(pathPropertyText, envSchemaPath, filePath, line),
            category: `env_var_${goEnvVar}`,
            originSite: { filePath: site.filePath, line: site.line },
            reason: `this.${fieldName}.${callKind}(...) em ${methodName}(), cujo cliente resolve destino de env.${goEnvVar}`,
          });
        }

        if (requestCallCount === 0) {
          const methodBodyText = candidateSource.slice(method.bodyStart, method.bodyEnd);
          const envVarsInMethod = matchEnvVars(methodBodyText);
          if (envVarsInMethod.length === 0) continue;
          const returnMatch = /\breturn\s+/.exec(methodBodyText);
          const urlExpression = (
            returnMatch
              ? extractStatementRhs(methodBodyText, returnMatch.index + returnMatch[0].length)
              : methodBodyText
          )
            .trim()
            .replace(/\$\{[^}]*\}/g, "{}");
          assembledUrls.push({
            filePath,
            line: method.line,
            functionName: methodName,
            urlExpression,
            category: `assembled_url_for_delivery_${methodName}`,
            originSite: { filePath: site.filePath, line: site.line },
            reason: `"${methodName}" monta valor a partir de env.${envVarsInMethod.join(" e env.")} sem chamar this.${fieldName}.${surface.reachingMembers.join("/.")} — não é requisição ao transporte, é valor entregue em outra chamada`,
          });
        }
      }
    }
  }

  return { requests, assembledUrls, surfaces, nonTransportMemberCalls, nonGoBoundInstantiations };
}

/**
 * Toda requisição das duas árvores cujo destino é o serviço Go, com método e
 * expressão de caminho, sem lista escrita à mão (Goal043/WU-01). `assembledUrls`
 * traz o que só monta valor de URL sem entregá-lo ao transporte — fora do
 * conjunto alcançado, mas nomeado, não descartado em silêncio.
 */
export function discoverGoServiceHttpRequests(
  aiOrchestratorSrcRoot: string,
  bffSrcRoot: string,
  aiOrchestratorEnvSchemaPath: string,
): GoServiceHttpRequestDiscovery {
  const discovery = discoverHttpEgressSites(aiOrchestratorSrcRoot, bffSrcRoot);

  const allSources = [
    ...listTypeScriptSources(aiOrchestratorSrcRoot),
    ...listTypeScriptSources(bffSrcRoot),
  ].map((filePath) => ({ filePath, source: blankComments(readFileSync(filePath, "utf8")) }));
  const sourcesByPath = new Map(allSources.map(({ filePath, source }) => [filePath, source]));

  const { requests: rawFetchRequests, notGoBound, callerResolutions } = discoverGoBoundRawFetchRequests(
    discovery,
    sourcesByPath,
    allSources,
    aiOrchestratorEnvSchemaPath,
  );
  const {
    requests: internalClientRequests,
    assembledUrls,
    surfaces,
    nonTransportMemberCalls,
    nonGoBoundInstantiations,
  } = discoverGoBoundInternalClientRequests(
    discovery,
    sourcesByPath,
    allSources,
    aiOrchestratorEnvSchemaPath,
  );

  return {
    requests: [...rawFetchRequests, ...internalClientRequests],
    assembledUrls,
    notGoBound,
    internalClientSurfaces: surfaces,
    nonTransportMemberCalls,
    nonGoBoundInstantiations,
    callerResolutions,
  };
}

/* =========================================================================
 * Arquivo de valores das rotas de transporte do produto (Goal043 / WU-02) —
 * o análogo, para um conjunto, de `readEnvFileValue`: recusa em vez de
 * pular quando o arquivo falta, vem vazio, ou tem linha que não casa com o
 * formato fixado.
 * ========================================================================= */

export interface ProductTransportRoute {
  method: string;
  /** Caminho, com "{}" no lugar de todo segmento computado — mesma convenção de `GoBoundHttpRequest.pathExpression`. */
  path: string;
  /** Linha (1-based) do arquivo de valores onde a rota está declarada. */
  line: number;
}

/** Forma de uma linha de rota: MÉTODO (letras maiúsculas), um espaço, e um caminho iniciado por "/". */
const PRODUCT_TRANSPORT_ROUTE_LINE_PATTERN = /^([A-Z]+) (\/\S*)$/;

/**
 * Lê `filePath` no formato fixado (uma rota por linha, `MÉTODO CAMINHO`;
 * `#` inicia comentário; linha em branco é ignorada). Arquivo ausente,
 * vazio (sem nenhuma rota reconhecida) ou com linha que não casa com o
 * formato reprova, nomeando arquivo e linha quando aplicável — nunca pula.
 */
export function readProductTransportRoutesFile(filePath: string): ProductTransportRoute[] {
  const source = readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/u);
  const routes: ProductTransportRoute[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = PRODUCT_TRANSPORT_ROUTE_LINE_PATTERN.exec(trimmed);
    if (match === null) {
      throw new Error(
        `${filePath}:${index + 1}: linha malformada no arquivo de rotas de transporte do produto: "${raw}"`,
      );
    }
    routes.push({ method: match[1], path: match[2], line: index + 1 });
  }
  if (routes.length === 0) {
    throw new Error(
      `${filePath}: arquivo de rotas de transporte do produto vazio — nenhuma rota reconhecida`,
    );
  }
  return routes;
}
