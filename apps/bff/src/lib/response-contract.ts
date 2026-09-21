import {
  findPublicApiRoute,
  type HttpMethod,
} from "@atendly-ia/public-api-contract";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";

import { env } from "../config/env.js";

/**
 * Goal035/WU-04 — verificação de contrato da própria resposta do BFF.
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

function violationError(
  method: string,
  pathPattern: string,
  error: z.ZodError,
): ResponseContractViolationError {
  const fieldPaths = error.issues.map((issue) => fieldPath(issue.path));
  const reported = error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue, index) => `${fieldPaths[index]}: ${issue.message}`);
  const omitted = error.issues.length - reported.length;
  const suffix = omitted > 0 ? ` (+${omitted} more)` : "";

  return new ResponseContractViolationError(
    method,
    pathPattern,
    fieldPaths,
    `Response of ${method} ${pathPattern} does not match the public API contract: ${reported.join("; ")}${suffix}`,
  );
}

/**
 * Compara o payload já serializado com a entrada da rota. Devolve `null`
 * quando não há o que comparar — e **não** comparar nunca é erro aqui.
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

  const parsed = route.schema.safeParse((body as { data?: unknown }).data);
  if (parsed.success) return null;

  return violationError(request.method, pathPattern, parsed.error);
}

/**
 * Hook único do ciclo de resposta. Ele lê o payload e o devolve **pela mesma
 * referência**: nada é removido, reordenado, coagido ou preenchido, porque o
 * resultado do `safeParse` é descartado — só o veredito é usado.
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
