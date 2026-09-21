import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

/** Máscara "dentro de aspas/crase" para cada índice de `source` até `uptoIndex` (exclusivo). */
function computeQuoteMask(source: string, uptoIndex: number): boolean[] {
  const mask: boolean[] = new Array<boolean>(uptoIndex).fill(false);
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

/** Chamadas reais (não a própria declaração) de `functionName` em `source`, com os textos de argumento de topo já separados. */
function findRealCallArguments(source: string, functionName: string): string[][] {
  const pattern = new RegExp(`\\b${functionName}\\(`, "g");
  const calls: string[][] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const openParenIndex = match.index + match[0].length - 1;
    if (isMemberDeclarationOrImplementationPosition(source, match.index, openParenIndex)) continue;
    const closeParenIndex = findMatchingDelimiterEnd(source, openParenIndex, "(", ")");
    calls.push(splitTopLevelItems(source.slice(openParenIndex + 1, closeParenIndex)));
  }
  return calls;
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
  for (const property of splitTopLevelItems(optionsObjectBody)) {
    const match = property.match(/^body\s*:\s*([\s\S]+)$/);
    if (match) return match[1].trim();
  }
  return undefined;
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
  const pendingPrimitiveNames: string[] = [];

  /** Registra um sítio genérico como primitivo a varrer, se o nome ainda não tiver sido varrido. */
  const enqueuePrimitive = (site: ClassifiedHttpEgressSite): void => {
    const functionName = genericEgressFunctionName(site);
    if (functionName === undefined) return;
    genericEgressPrimitives.push({ filePath: site.filePath, line: site.line, functionName });
    pendingPrimitiveNames.push(functionName);
  };

  sites.forEach(enqueuePrimitive);

  const scannedPrimitiveNames = new Set<string>();
  while (pendingPrimitiveNames.length > 0) {
    const functionName = pendingPrimitiveNames.shift() as string;
    if (scannedPrimitiveNames.has(functionName)) continue;
    scannedPrimitiveNames.add(functionName);
    for (const { filePath, rawSource } of sources) {
      const callers = classifyGenericEgressCallersInSource(rawSource, filePath, [functionName]);
      genericEgressCallers.push(...callers);
      callers.forEach(enqueuePrimitive);
    }
  }

  return { sites, excluded, genericEgressCallers, genericEgressPrimitives };
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
