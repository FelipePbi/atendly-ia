import { BffHttpError } from "./BffHttpClient";

/**
 * O BFF embrulha toda recusa de serviço interno em `UPSTREAM_ERROR`, com o
 * código original em `details.upstreamCode` e o detalhe original em
 * `details.upstreamDetails`. O formato cru (código e detalhe direto) também
 * vale, para um adaptador que responda sem o embrulho.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function wrappedUpstreamCode(caught: BffHttpError): string | undefined {
  if (caught.code !== "UPSTREAM_ERROR") return undefined;
  const upstreamCode = asRecord(caught.details).upstreamCode;
  return typeof upstreamCode === "string" ? upstreamCode : undefined;
}

/** Código da recusa; `undefined` para o que não é `BffHttpError`. */
export function schedulingRefusalCode(caught: unknown): string | undefined {
  if (!(caught instanceof BffHttpError)) return undefined;
  return wrappedUpstreamCode(caught) ?? caught.code;
}

/** Detalhe da recusa; sempre um objeto, vazio quando não há detalhe. */
export function schedulingRefusalDetails(
  caught: unknown,
): Record<string, unknown> {
  if (!(caught instanceof BffHttpError)) return {};
  const details = asRecord(caught.details);
  return wrappedUpstreamCode(caught) === undefined
    ? details
    : asRecord(details.upstreamDetails);
}
