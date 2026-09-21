import {
  findPublicApiRoute,
  type HttpMethod,
} from "@atendly-ia/public-api-contract";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { env } from "../config/env.js";

/**
 * Goal035/WU-04 — verificação de contrato da própria resposta do BFF.
 * Goal036/WU-01 — a verificação passou a olhar também para o lado oposto: a
 * chave que o corpo tem e o contrato não declara reprova, em qualquer
 * profundidade.
 *
 * O BFF compara o `data` que acabou de serializar contra a entrada da rota em
 * `@atendly-ia/public-api-contract`, a mesma tabela que o frontend usa para
 * validar o que recebe. Divergência entre os dois lados (A-03) deixa de ser
 * descoberta na tela e passa a derrubar a suíte do BFF.
 *
 * **Isto é gate de drift, não escudo de runtime.** A verificação não conserta,
 * não coage e não filtra nada: ou o corpo já estava certo e ele segue
 * intocado, ou o corpo está errado e o processo grita. Em produção um corpo
 * divergente já saiu do handler, e transformá-lo em `500` tiraria do ar uma
 * resposta que o frontend talvez tolerasse — trocaria um bug de contrato por
 * uma indisponibilidade. Por isso o padrão de ativação é explícito e negativo
 * em produção: liga em `development` e em `test`, onde a falha custa uma
 * suíte vermelha, e fica desligada em `production`, onde custaria a tela.
 */
export const RESPONSE_CONTRACT_CHECK_ENABLED = env.NODE_ENV !== "production";

/** Teto de issues citadas na mensagem: um array inteiro divergente geraria centenas. */
const MAX_REPORTED_ISSUES = 5;

/**
 * Erro nomeado da divergência. O nome é o que o relatório de drift procura na
 * saída do teste; `method`, `pathPattern` e `fieldPaths` ficam legíveis no
 * objeto para quem inspecionar o erro em vez da mensagem.
 */
export class ResponseContractViolationError extends Error {
  constructor(
    public readonly method: string,
    public readonly pathPattern: string,
    public readonly fieldPaths: readonly string[],
    message: string,
  ) {
    super(message);
    this.name = "ResponseContractViolationError";
  }
}

/** `["items", 0, "name"]` -> `data.items[0].name`; caminho vazio -> `data`. */
function fieldPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (acc, segment) =>
      typeof segment === "number"
        ? `${acc}[${segment}]`
        : `${acc}.${String(segment)}`,
    "data",
  );
}

/**
 * Divergência de contrato já normalizada. Uma issue do Zod (campo faltando,
 * tipo errado) e uma chave não declarada chegam aqui no mesmo formato, e daí
 * em diante seguem pelo mesmo erro nomeado, com o mesmo teto e a mesma
 * mensagem — não há classe de erro nem canal de saída novo para o campo a
 * mais.
 */
interface ContractIssue {
  path: readonly PropertyKey[];
  message: string;
}

/**
 * Mensagem da chave a mais. O texto diz o que fazer, porque a correção nunca é
 * afrouxar a verificação: ou o contrato passa a declarar a chave, ou o handler
 * para de emiti-la. Sem `; ` no meio: esse é o separador entre issues na
 * mensagem do erro.
 */
const UNDECLARED_KEY_MESSAGE =
  "key is not declared by the public API contract, so the frontend never sees it. Declare it in @atendly-ia/public-api-contract or stop sending it";

/**
 * Só percorremos objeto literal dos dois lados. `Date`, `Map` e qualquer
 * instância de classe que um schema produza ficam de fora: comparar as chaves
 * próprias delas com as do JSON emitido inventaria achado.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Compara o `data` emitido com o `data` que o `safeParse` devolveu e reporta o
 * que o parse removeu.
 *
 * O Zod já resolveu a pergunta difícil: em `z.object` a chave não declarada é
 * exatamente a chave que some da saída, e onde o schema legitimamente mantém
 * chave arbitrária (`z.record`, `z.unknown`, `z.any`, `.passthrough()`,
 * `.catchall()`) nada some — então não há achado, sem precisar reimplementar a
 * semântica do Zod nem enumerar os tipos de schema aqui.
 *
 * A comparação é recursiva e desce por objeto aninhado, por elemento de array
 * (com o índice no caminho) e pelo lado da união que efetivamente parseou,
 * porque `accepted` já é a saída desse lado.
 *
 * Divergência de *forma* entre os dois lados encerra o ramo em silêncio: se o
 * schema devolveu outro tipo, outro tamanho de array ou uma instância de
 * classe, o que mudou ali não é chave a mais, e adivinhar geraria falso
 * positivo — que aqui custaria uma suíte vermelha sem bug atrás.
 */
function collectUndeclaredKeys(
  emitted: unknown,
  accepted: unknown,
  path: readonly PropertyKey[],
  issues: ContractIssue[],
): void {
  if (Array.isArray(emitted)) {
    if (!Array.isArray(accepted) || accepted.length !== emitted.length) return;
    emitted.forEach((item, index) => {
      collectUndeclaredKeys(item, accepted[index], [...path, index], issues);
    });
    return;
  }

  if (!isPlainObject(emitted)) return;
  if (!isPlainObject(accepted)) return;

  for (const key of Object.keys(emitted)) {
    const keyPath = [...path, key];
    if (!Object.prototype.hasOwnProperty.call(accepted, key)) {
      issues.push({ path: keyPath, message: UNDECLARED_KEY_MESSAGE });
      continue;
    }
    collectUndeclaredKeys(emitted[key], accepted[key], keyPath, issues);
  }
}

/**
 * Caminhos, em formato de `fieldPath`, das chaves que o `safeParse` removeu.
 *
 * Exportado para a suíte poder exercitar a comparação contra formas de schema
 * que a tabela de rotas ainda não usa (`.passthrough()`, `.catchall()`) sem
 * inventar rota. Não é canal de saída novo da verificação: quem reporta
 * divergência em runtime continua sendo `ResponseContractViolationError`.
 */
export function undeclaredContractKeyPaths(
  emitted: unknown,
  accepted: unknown,
): readonly string[] {
  const issues: ContractIssue[] = [];
  collectUndeclaredKeys(emitted, accepted, [], issues);
  return issues.map((issue) => fieldPath(issue.path));
}

function violationError(
  method: string,
  pathPattern: string,
  issues: readonly ContractIssue[],
): ResponseContractViolationError {
  const fieldPaths = issues.map((issue) => fieldPath(issue.path));
  const reported = issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue, index) => `${fieldPaths[index]}: ${issue.message}`);
  const omitted = issues.length - reported.length;
  const suffix = omitted > 0 ? ` (+${omitted} more)` : "";

  return new ResponseContractViolationError(
    method,
    pathPattern,
    fieldPaths,
    `Response of ${method} ${pathPattern} does not match the public API contract: ${reported.join("; ")}${suffix}`,
  );
}

/**
 * Compara o payload já serializado com a entrada da rota, nas duas direções:
 * o que o contrato exige e o `data` não tem é erro do Zod; o que o `data` tem
 * e o contrato não declara é chave a mais. Devolve `null` quando não há o que
 * comparar — e **não** comparar nunca é erro aqui.
 */
export function responseContractViolation(
  request: FastifyRequest,
  statusCode: number,
  payload: unknown,
): ResponseContractViolationError | null {
  // Resposta de erro não é contrato de leitura: o envelope `{ error, requestId }`
  // tem dono próprio em `app.setErrorHandler` e não é tocado aqui.
  if (statusCode < 200 || statusCode >= 300) return null;

  // Corpo binário ou stream (mídia de mensagem) não passa pelo envelope JSON.
  if (typeof payload !== "string" || payload.length === 0) return null;

  // Fastify 5 devolve aqui o **padrão** da rota (`/v1/services/:id`), que é a
  // chave da tabela. Rota sem padrão registrado (404 de roteamento) sai fora.
  const pathPattern = request.routeOptions?.url;
  if (!pathPattern) return null;

  // Rota sem entrada na tabela passa direto: quem cobra a existência da
  // entrada é o check estático de cobertura, não o runtime.
  const route = findPublicApiRoute(request.method as HttpMethod, pathPattern);
  if (!route) return null;

  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const emitted = (body as { data?: unknown }).data;
  const parsed = route.schema.safeParse(emitted);
  if (!parsed.success) {
    return violationError(
      request.method,
      pathPattern,
      parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    );
  }

  // Corpo válido ainda pode trazer chave a mais: para o Zod ela não é erro, é
  // ruído removido da saída. Quem compara as duas pontas é a varredura abaixo.
  const undeclared: ContractIssue[] = [];
  collectUndeclaredKeys(emitted, parsed.data, [], undeclared);
  if (undeclared.length === 0) return null;

  return violationError(request.method, pathPattern, undeclared);
}

/**
 * Hook único do ciclo de resposta. Ele lê o payload e o devolve **pela mesma
 * referência**: nada é removido, reordenado, coagido ou preenchido. A saída do
 * `safeParse` nunca vai para a rede — ela só é lida para comparar com o que o
 * handler emitiu e depois descartada.
 */
export function registerResponseContractCheck(app: FastifyInstance): void {
  if (!RESPONSE_CONTRACT_CHECK_ENABLED) return;

  app.addHook("onSend", async (request, reply, payload) => {
    const violation = responseContractViolation(
      request,
      reply.statusCode,
      payload,
    );
    if (violation) throw violation;
    return payload;
  });
}
