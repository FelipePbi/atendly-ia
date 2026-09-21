/**
 * Fechamento sobre os sítios que produzem texto em `notification-message.ts`
 * (Goal039 / WU-02), no mesmo padrão do Goal038: cada sítio cai em uma
 * categoria nomeada ou derruba o fechamento, nomeando arquivo e linha. Não há
 * allowlist por linha — a forma é reconhecida estruturalmente, o texto real
 * (com nome, sem nome, com/sem valor, por estilo) vem de executar
 * `composeNotificationText`/`notificationFactualLines`, não deste módulo.
 *
 * - `style_voice_greeting_ternary`: `(name) => (name ? \`...${name}...\` : "...")`
 *   dentro de `STYLE_VOICES` — saudação com e sem nome, por estilo.
 * - `style_voice_static_literal`: `confirmation:`/`closing:` de `STYLE_VOICES`,
 *   literal entre aspas duplas sem interpolação.
 * - `factual_change_notice_ternary`: o `lines.push(cond ? \`...\` : \`...\`)`
 *   de `notificationFactualLines` — cancelamento vs. alteração.
 * - `factual_single_template`: os demais `lines.push(\`...\`)` de
 *   `notificationFactualLines` — frase de lembrete e linha de valor.
 */
export type NotificationTextSiteCategory =
  | "style_voice_greeting_ternary"
  | "style_voice_static_literal"
  | "factual_change_notice_ternary"
  | "factual_single_template";

export interface ClassifiedNotificationTextSite {
  filePath: string;
  line: number;
  category: NotificationTextSiteCategory;
}

/** Linha (1-based) de um índice de caractere em `source`. */
function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** Conteúdo entre `source[openIndex]` e o delimitador de fechamento correspondente, respeitando aspas/crase. */
function extractBalanced(
  source: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
): { content: string; contentStart: number } {
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
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return { content: source.slice(openIndex + 1, i), contentStart: openIndex + 1 };
      }
    }
  }
  throw new Error(
    `delimitador "${openChar}" sem fechamento correspondente a partir do índice ${openIndex}`,
  );
}

const extractBalancedBraces = (source: string, openIndex: number) =>
  extractBalanced(source, openIndex, "{", "}");
const extractBalancedParens = (source: string, openIndex: number) =>
  extractBalanced(source, openIndex, "(", ")");

/** Divide o conteúdo de um objeto/array em itens de topo, ignorando vírgulas dentro de `()`/`[]`/`{}` e de literais. */
function splitTopLevelCommaItems(
  content: string,
): Array<{ text: string; offset: number }> {
  const items: Array<{ text: string; offset: number }> = [];
  let depth = 0;
  let quote: string | undefined;
  let current = "";
  let start = 0;
  const pushCurrent = () => {
    if (!current.trim()) return;
    const leading = current.length - current.trimStart().length;
    items.push({ text: current.trim(), offset: start + leading });
  };
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (quote) {
      current += char;
      if (char === "\\") {
        current += content[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      pushCurrent();
      current = "";
      start = i + 1;
      continue;
    }
    current += char;
  }
  pushCurrent();
  return items;
}

/** Índice do primeiro `target` de topo em `expression`, a partir de `fromIndex`, ignorando aninhamento e literais. */
function findTopLevelChar(
  expression: string,
  target: string,
  fromIndex: number,
): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = fromIndex; i < expression.length; i += 1) {
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
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (depth === 0 && char === target) return i;
  }
  return -1;
}

/** `chave: expressão` de um item de propriedade, dividido no primeiro `:` de topo. */
function splitKeyExpression(
  item: string,
): { key: string; expression: string } | undefined {
  const colonIndex = findTopLevelChar(item, ":", 0);
  if (colonIndex === -1) return undefined;
  return {
    key: item.slice(0, colonIndex).trim(),
    expression: item.slice(colonIndex + 1).trim(),
  };
}

/** `cond ? then : else` de uma expressão, dividida nos primeiros `?`/`:` de topo. */
function splitTernary(
  expression: string,
): { cond: string; thenBranch: string; elseBranch: string } | undefined {
  const questionIndex = findTopLevelChar(expression, "?", 0);
  if (questionIndex === -1) return undefined;
  const colonIndex = findTopLevelChar(expression, ":", questionIndex + 1);
  if (colonIndex === -1) return undefined;
  return {
    cond: expression.slice(0, questionIndex).trim(),
    thenBranch: expression.slice(questionIndex + 1, colonIndex).trim(),
    elseBranch: expression.slice(colonIndex + 1).trim(),
  };
}

const GREETING_TERNARY_PATTERN =
  /^\(name\)\s*=>\s*\(?\s*name\s*\?\s*`(?:[^`\\]|\\.)*`\s*:\s*"(?:[^"\\]|\\.)*"\s*\)?$/;
const STATIC_LITERAL_PATTERN = /^"(?:[^"\\]|\\.)*"$/;
const TEMPLATE_LITERAL_PATTERN = /^`(?:[^`\\]|\\.)*`$/;

const STYLE_VOICES_MARKER =
  "const STYLE_VOICES: Record<AiConversationStyle, StyleVoice> = {";

function classifyStyleVoiceSites(
  source: string,
  filePath: string,
): ClassifiedNotificationTextSite[] {
  const markerIndex = source.indexOf(STYLE_VOICES_MARKER);
  if (markerIndex === -1) {
    throw new Error(`${filePath}: bloco STYLE_VOICES não encontrado`);
  }
  const openBraceIndex = markerIndex + STYLE_VOICES_MARKER.length - 1;
  const block = extractBalancedBraces(source, openBraceIndex);
  const sites: ClassifiedNotificationTextSite[] = [];

  const stylePattern = /(\w+):\s*\{/g;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = stylePattern.exec(block.content))) {
    const relativeBraceIndex = styleMatch.index + styleMatch[0].length - 1;
    const styleBlock = extractBalancedBraces(block.content, relativeBraceIndex);
    const absoluteContentStart = block.contentStart + styleBlock.contentStart;

    for (const item of splitTopLevelCommaItems(styleBlock.content)) {
      const absoluteItemIndex = absoluteContentStart + item.offset;
      const line = lineAt(source, absoluteItemIndex);
      const split = splitKeyExpression(item.text);
      if (!split) {
        throw new Error(
          `${filePath}:${line}: propriedade de STYLE_VOICES sem "chave: expressão" reconhecível ("${item.text}")`,
        );
      }

      if (split.key === "greeting") {
        if (!GREETING_TERNARY_PATTERN.test(split.expression)) {
          throw new Error(
            `${filePath}:${line}: greeting de STYLE_VOICES com forma não reconhecida ("${split.expression}") ` +
              `— não é "(name) => (name ? \`...\` : "...")".`,
          );
        }
        sites.push({ filePath, line, category: "style_voice_greeting_ternary" });
        continue;
      }

      if (split.key === "confirmation" || split.key === "closing") {
        if (!STATIC_LITERAL_PATTERN.test(split.expression)) {
          throw new Error(
            `${filePath}:${line}: ${split.key} de STYLE_VOICES com forma não reconhecida ("${split.expression}") ` +
              "— não é um literal entre aspas duplas.",
          );
        }
        sites.push({ filePath, line, category: "style_voice_static_literal" });
        continue;
      }

      throw new Error(
        `${filePath}:${line}: propriedade "${split.key}" de STYLE_VOICES não reconhecida`,
      );
    }
  }
  return sites;
}

const FACTUAL_LINES_MARKER =
  "export function notificationFactualLines(facts: NotificationFacts): string[] {";

function classifyFactualLineSites(
  source: string,
  filePath: string,
): ClassifiedNotificationTextSite[] {
  const markerIndex = source.indexOf(FACTUAL_LINES_MARKER);
  if (markerIndex === -1) {
    throw new Error(`${filePath}: função notificationFactualLines não encontrada`);
  }
  const openBraceIndex = markerIndex + FACTUAL_LINES_MARKER.length - 1;
  const body = extractBalancedBraces(source, openBraceIndex);
  const sites: ClassifiedNotificationTextSite[] = [];

  const pushPattern = /lines\.push\(/g;
  let pushMatch: RegExpExecArray | null;
  while ((pushMatch = pushPattern.exec(body.content))) {
    const openParenIndex = pushMatch.index + pushMatch[0].length - 1;
    const call = extractBalancedParens(body.content, openParenIndex);
    const argument = call.content.trim().replace(/,\s*$/, "");
    const absoluteIndex = body.contentStart + pushMatch.index;
    const line = lineAt(source, absoluteIndex);

    if (TEMPLATE_LITERAL_PATTERN.test(argument)) {
      sites.push({ filePath, line, category: "factual_single_template" });
      continue;
    }

    const ternary = splitTernary(argument);
    if (
      ternary &&
      TEMPLATE_LITERAL_PATTERN.test(ternary.thenBranch) &&
      TEMPLATE_LITERAL_PATTERN.test(ternary.elseBranch)
    ) {
      sites.push({ filePath, line, category: "factual_change_notice_ternary" });
      continue;
    }

    throw new Error(
      `${filePath}:${line}: lines.push(...) de notificationFactualLines com forma não reconhecida ("${argument}") ` +
        "— não é um literal entre crases nem um ternário entre dois literais entre crases.",
    );
  }
  return sites;
}

/**
 * Classifica todo sítio que produz texto em `notification-message.ts`
 * (`STYLE_VOICES` e `notificationFactualLines`) em uma categoria nomeada.
 * Sítio fora das formas reconhecidas é resíduo e derruba o fechamento,
 * lançando erro que nomeia `filePath` e a linha.
 */
export function classifyNotificationTextSites(
  source: string,
  filePath: string,
): ClassifiedNotificationTextSite[] {
  return [
    ...classifyStyleVoiceSites(source, filePath),
    ...classifyFactualLineSites(source, filePath),
  ];
}
