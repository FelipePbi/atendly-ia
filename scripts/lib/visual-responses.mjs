// Respostas fixas de GET por alvo do `visual:compare` (Goal106).
//
// Um alvo de `targets.json` pode declarar `responses`: uma lista de
// `{ "method": "GET", "path": "/v1/...", "json": ... }`. Serve para levar a
// tela a um estado que a conta de teste não alcança (ex.: WhatsApp conectado).
// Só leitura, e só caminho exato do BFF: nada é gravado, a resposta existe só
// no navegador da captura.

const ALLOWED_FIELDS = Object.freeze(["method", "path", "json"]);
const BFF_PREFIX = "/api/bff";

function describe(target) {
  return `alvo ${target?.code ?? "?"} (${target?.file ?? "?"})`;
}

/**
 * Valida a lista `responses` de um alvo e a devolve. Recusa, com erro que nomeia
 * o alvo e o item: outro método que não GET, caminho fora de `/v1/`, campo
 * desconhecido ou ausente.
 */
export function validateResponses(responses, target) {
  const where = describe(target);
  if (!Array.isArray(responses)) throw new Error(`targets.json: ${where}: responses precisa ser uma lista`);
  return responses.map((entry, index) => {
    const label = `${where}: responses[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`targets.json: ${label} precisa ser um objeto { method, path, json }`);
    }
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_FIELDS.includes(key)) {
        throw new Error(`targets.json: ${label} tem o campo desconhecido "${key}" (aceitos: ${ALLOWED_FIELDS.join(", ")})`);
      }
    }
    if (entry.method !== "GET") {
      throw new Error(`targets.json: ${label}.method ${JSON.stringify(entry.method)} não é aceito; só "GET"`);
    }
    if (typeof entry.path !== "string" || !/^\/v1\/[^?#\s]+$/.test(entry.path)) {
      throw new Error(`targets.json: ${label}.path ${JSON.stringify(entry.path)} não é aceito; use o caminho exato do BFF sob "/v1/", sem query`);
    }
    if (!("json" in entry) || entry.json === undefined) {
      throw new Error(`targets.json: ${label} não tem "json"`);
    }
    return { method: entry.method, path: entry.path, json: entry.json };
  });
}

/** Valida `responses` de todos os alvos que a declaram; devolve os próprios alvos. */
export function validateTargetResponses(targets) {
  for (const target of targets) {
    if (target.responses !== undefined) target.responses = validateResponses(target.responses, target);
  }
  return targets;
}

/** Caminho do BFF (`/v1/...`) de uma URL do app sob `/api/bff`, ou null se for outra. */
export function bffPathname(url) {
  const { pathname } = new URL(url);
  if (!pathname.startsWith(`${BFF_PREFIX}/`)) return null;
  return pathname.slice(BFF_PREFIX.length);
}

/**
 * Resposta fixa que vale para este pedido: só a do alvo que a declara, só para
 * o mesmo método e o caminho exato (a query não conta). Sem `responses`, null.
 */
export function pickFixedResponse(target, method, pathname) {
  if (!Array.isArray(target?.responses) || pathname === null) return null;
  return target.responses.find((entry) => entry.method === method && entry.path === pathname) ?? null;
}
