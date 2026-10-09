// Respostas fixas de GET por alvo do `visual:compare` (Goal106).
//
// Um alvo de `targets.json` pode declarar `responses`: uma lista de
// `{ "method": "GET", "path": "/v1/...", "json": ..., "status"?: 400-599 }`. Serve para levar a
// tela a um estado que a conta de teste não alcança (ex.: WhatsApp conectado).
// Só leitura, e só caminho exato do BFF: nada é gravado, a resposta existe só
// no navegador da captura.
//
// Uma entrada também pode ser retida (Goal148): `{ "method": "GET", "path": "/v1/...",
// "hold": true }`. O pedido que casa com ela fica pendente até o fim da captura,
// sem resposta e sem seguir para o BFF, e a tela é fotografada em carregamento.
// Só GET, sem `json` nem `status`, e só em alvo com um passo `waitFor` que espera
// um texto do estado fotografado.

const ALLOWED_FIELDS = Object.freeze(["method", "path", "json", "status", "hold"]);
const BFF_PREFIX = "/api/bff";
const AUTH_PREFIX = "/v1/auth/";

function describe(target) {
  return `alvo ${target?.code ?? "?"} (${target?.file ?? "?"})`;
}

/**
 * Valida a lista `responses` de um alvo e a devolve. Recusa, com erro que nomeia
 * o alvo e o item: outro método que não GET (POST só em alvo `session: false`
 * e sob `/v1/auth/`), caminho fora de `/v1/`, campo
 * desconhecido ou ausente, `status` que não seja inteiro de 400 a 599. Para a
 * entrada retida (`hold`), recusa `hold` diferente de `true`, `hold` com `json`
 * ou `status`, `hold` com outro método que não GET, e o alvo com entrada retida
 * e sem passo `waitFor` obrigatório.
 */
export function validateResponses(responses, target) {
  const where = describe(target);
  if (!Array.isArray(responses)) throw new Error(`targets.json: ${where}: responses precisa ser uma lista`);
  const validated = responses.map((entry, index) => {
    const label = `${where}: responses[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`targets.json: ${label} precisa ser um objeto { method, path, json }`);
    }
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_FIELDS.includes(key)) {
        throw new Error(`targets.json: ${label} tem o campo desconhecido "${key}" (aceitos: ${ALLOWED_FIELDS.join(", ")})`);
      }
    }
    if ("hold" in entry) {
      if (entry.hold !== true) {
        throw new Error(`targets.json: ${label}.hold ${JSON.stringify(entry.hold)} não é aceito; use só true (ou tire o campo)`);
      }
      if (entry.method !== "GET") {
        throw new Error(`targets.json: ${label}.method ${JSON.stringify(entry.method)} não é aceito em uma entrada com "hold"; só "GET"`);
      }
      for (const key of ["json", "status"]) {
        if (key in entry) throw new Error(`targets.json: ${label} tem "hold" e "${key}"; a resposta retida não responde, então não leva "json" nem "status"`);
      }
    } else if (entry.method === "POST" && target?.session === false) {
      if (typeof entry.path !== "string" || !entry.path.startsWith(AUTH_PREFIX)) {
        throw new Error(`targets.json: ${label}.method "POST" não é aceito em ${where}; o alvo público só aceita POST sob "${AUTH_PREFIX}", e o caminho ${JSON.stringify(entry.path)} está fora dele`);
      }
    } else if (entry.method !== "GET") {
      throw new Error(`targets.json: ${label}.method ${JSON.stringify(entry.method)} não é aceito; só "GET"`);
    }
    if (typeof entry.path !== "string" || !/^\/v1\/[^?#\s]+$/.test(entry.path)) {
      throw new Error(`targets.json: ${label}.path ${JSON.stringify(entry.path)} não é aceito; use o caminho exato do BFF sob "/v1/", sem query`);
    }
    if ("hold" in entry) return { method: entry.method, path: entry.path, hold: true };
    if (!("json" in entry) || entry.json === undefined) {
      throw new Error(`targets.json: ${label} não tem "json" (nem "hold": true)`);
    }
    if ("status" in entry && (!Number.isInteger(entry.status) || entry.status < 400 || entry.status > 599)) {
      throw new Error(`targets.json: ${label}.status ${JSON.stringify(entry.status)} não é aceito; use um inteiro de 400 a 599 (ausente vale 200)`);
    }
    const accepted = { method: entry.method, path: entry.path, json: entry.json };
    if ("status" in entry) accepted.status = entry.status;
    return accepted;
  });
  const heldAt = validated.findIndex((entry) => entry.hold === true);
  if (heldAt !== -1 && !hasRequiredWaitFor(target)) {
    throw new Error(`targets.json: ${where}: responses[${heldAt}] é retida ("hold": true), e o alvo não tem um passo "waitFor" obrigatório; sem ele a captura não sabe esperar o texto do estado fotografado`);
  }
  return validated;
}

/** O alvo tem ao menos um passo `waitFor` com texto e sem `optional` (que pularia a espera em silêncio). */
function hasRequiredWaitFor(target) {
  return Array.isArray(target?.steps)
    && target.steps.some((step) => typeof step?.waitFor === "string" && step.waitFor.length > 0 && step.optional !== true);
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
  return target.responses.find((entry) => entry.hold !== true && entry.method === method && entry.path === pathname) ?? null;
}

/** O alvo declara ao menos uma entrada retida (`hold: true`)? */
export function hasHeldResponse(target) {
  return Array.isArray(target?.responses) && target.responses.some((entry) => entry.hold === true);
}

/**
 * O pedido casa com uma entrada retida do alvo? Só o mesmo método e o caminho
 * exato (a query não conta); uma entrada com `json` nunca é retida.
 */
export function isHeldRequest(target, method, pathname) {
  if (!Array.isArray(target?.responses) || pathname === null || pathname === undefined) return false;
  return target.responses.some((entry) => entry.hold === true && entry.method === method && entry.path === pathname);
}

const DAY_TOKEN = /\{today(?:([-+])(\d+))?\}/g;

/**
 * Troca `{today}`, `{today-N}` e `{today+N}` nas strings do `json` pela data
 * (AAAA-MM-DD) do dia semeado, menos ou mais N dias (`{today+N}` é o horário
 * futuro do Goal149). É o que mantém "há 12 min", "13:42" e "ontem" do
 * quadro iguais em qualquer dia: o `clock` do alvo fixa a hora no mesmo dia.
 * Devolve uma cópia; `json` sem token sai igual.
 */
export function resolveRelativeDays(json, today) {
  if (typeof json === "string") {
    return json.replace(DAY_TOKEN, (_, sign, offset) => {
      if (!today) throw new Error(`resposta fixa usa {today}, mas a semeadura não informou o dia`);
      const day = new Date(`${today}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + (sign === "+" ? 1 : -1) * Number(offset ?? 0));
      return day.toISOString().slice(0, 10);
    });
  }
  if (Array.isArray(json)) return json.map((item) => resolveRelativeDays(item, today));
  if (json !== null && typeof json === "object") {
    return Object.fromEntries(Object.entries(json).map(([key, value]) => [key, resolveRelativeDays(value, today)]));
  }
  return json;
}
