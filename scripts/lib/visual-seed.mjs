// Semeadura da conta local usada por `scripts/visual-compare.mjs`.
//
// Os dados são os fictícios do protótipo aprovado (Studio Camila Reis): mesmos
// serviços, preços, durações, clientes e o dia da Agenda do quadro A1. Assim,
// a comparação lado a lado mostra conteúdo parecido nos dois lados, e o que
// sobra de diferença é mais provavelmente de layout do que de dado.
//
// Tudo passa pelas rotas públicas do produto (as mesmas que a interface usa),
// nunca por escrita direta em banco. O WhatsApp NÃO é conectado: a conta de
// teste não tem número real, então avisos de "WhatsApp desconectado" são
// estado da conta, não divergência de layout.

export const VISUAL_TIMEZONE = "America/Sao_Paulo";
const OFFSET = "-03:00";
const SEED_MARK = "visual-seed";

export const VISUAL_BUSINESS = Object.freeze({
  name: "Studio Camila Reis",
  ownerName: "Camila Reis",
  category: "Cabelo",
  address: "Rua Harmonia, 4 · Vila Madalena",
});

// Seg–Sex 09:00–18:00 · Sáb 09:00–14:00 (quadro AG1). 0 = domingo.
const AVAILABILITY = [
  [1, "09:00", "18:00"],
  [2, "09:00", "18:00"],
  [3, "09:00", "18:00"],
  [4, "09:00", "18:00"],
  [5, "09:00", "18:00"],
  [6, "09:00", "14:00"],
];

const ONBOARDING_SERVICE = { name: "Corte feminino", durationMinutes: 45, priceType: "FIXED", price: 90 };

const CATALOGUE = [
  { name: "Corte feminino", durationMinutes: 45, priceType: "FIXED", price: 90, colorToken: "VIOLET" },
  { name: "Escova", durationMinutes: 40, priceType: "STARTING_AT", price: 60, colorToken: "AMBER" },
  { name: "Hidratação", durationMinutes: 30, priceType: "NOT_INFORMED", price: null, colorToken: "EMERALD" },
  { name: "Corte masculino", durationMinutes: 30, priceType: "FIXED", price: 50, colorToken: "SLATE" },
  { name: "Coloração", durationMinutes: 90, priceType: "ON_REQUEST", price: null, recurrenceIntervalDays: 35 },
  { name: "Progressiva", durationMinutes: 120, priceType: "FIXED", price: 250, active: false },
];

const CUSTOMERS = [
  { name: "Ana Paula", phone: "+5511991234567" },
  { name: "Aline Santos", phone: "+5511988112233" },
  { name: "Bia Castro", phone: "+5511977770102" },
  { name: "Carla Nunes", phone: "+5511965438790" },
  { name: "Fernanda Lima", phone: "+5511955554321" },
  { name: "Juliana Mendes", phone: "+5511981239988" },
  { name: "Pedro Alves", phone: "+5511976543210" },
  { name: "Marcos Vieira", phone: "+5511972221010" },
];

// O dia do quadro A1, reproduzido no dia em que a comparação roda.
const DAY = [
  { time: "10:00", customer: "Bia Castro", services: ["Escova"], after: "complete" },
  { time: "11:00", customer: "Carla Nunes", services: ["Escova"], after: "no-show" },
  { time: "14:00", customer: "Ana Paula", services: ["Corte feminino"] },
  { time: "15:00", customer: "Juliana Mendes", services: ["Escova", "Hidratação"] },
  { time: "16:30", customer: "Pedro Alves", services: ["Corte masculino"] },
];
const DAY_BLOCKS = [
  { start: "12:00", end: "13:00", kind: "BLOCK", title: "Almoço", reason: null },
  { start: "18:00", end: "19:00", kind: "PERSONAL", title: "Dentista", reason: null },
];

export function localToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VISUAL_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function list(result) {
  const data = result?.payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function seedVisualAccount(client, { account, legalVersions, expectStatus }) {
  const registered = await client.request("POST", "/v1/auth/register", {
    email: account.email,
    name: VISUAL_BUSINESS.ownerName,
    password: account.password,
    confirmPassword: account.password,
    termsAccepted: true,
    termsVersion: legalVersions.termsVersion,
    privacyPolicyVersion: legalVersions.privacyPolicyVersion,
  });
  expectStatus(registered, 201, "POST /v1/auth/register");

  const blocks = [
    ["negócio", {
      business: {
        name: VISUAL_BUSINESS.name,
        category: VISUAL_BUSINESS.category,
        timezone: VISUAL_TIMEZONE,
        modalities: ["ON_SITE"],
        address: VISUAL_BUSINESS.address,
      },
    }],
    ["agenda", { calendar: { source: "ATENDLY" } }],
    ["operação", {
      service: { ...ONBOARDING_SERVICE },
      availability: {
        rules: AVAILABILITY.map(([dayOfWeek, startTime, endTime]) => ({ dayOfWeek, startTime, endTime, active: true })),
      },
    }],
    ["IA", { ai: { tone: "BALANCED" } }],
  ];
  for (const [label, body] of blocks) {
    expectStatus(await client.request("PATCH", "/v1/onboarding", body), 200, `PATCH /v1/onboarding (${label})`);
  }
  expectStatus(await client.request("POST", "/v1/onboarding/complete"), 200, "POST /v1/onboarding/complete");
}

/** Catálogo e clientes do protótipo; idempotente por nome. */
export async function ensureVisualCatalogue(client, { expectStatus }) {
  const services = list(await client.request("GET", "/v1/services"));
  for (const entry of CATALOGUE) {
    const existing = services.find((service) => service.name === entry.name);
    if (existing) {
      if (entry.colorToken) {
        await client.request("PATCH", `/v1/services/${existing.id}`, { colorToken: entry.colorToken });
      }
      continue;
    }
    const { active = true, ...body } = entry;
    expectStatus(await client.request("POST", "/v1/services", { ...body, active }), 201, `POST /v1/services (${entry.name})`);
  }

  const customers = list(await client.request("GET", "/v1/customers"));
  for (const customer of CUSTOMERS) {
    if (customers.some((existing) => existing.name === customer.name)) continue;
    expectStatus(await client.request("POST", "/v1/customers", customer), 201, `POST /v1/customers (${customer.name})`);
  }
}

/**
 * Garante o dia do quadro A1 na data de HOJE. Roda a cada comparação: num dia
 * novo, o dia é recriado (o histórico dos dias anteriores fica, como numa
 * agenda de verdade). Falha de um item não interrompe a comparação — dia
 * fechado (domingo) ou horário já passado são avisos, não erro.
 */
export async function ensureVisualDay(client) {
  const today = localToday();
  const warnings = [];
  const existing = list(await client.request("GET", `/v1/appointments?startDate=${today}&endDate=${today}`));
  if (existing.length > 0) return { today, created: 0, warnings };

  const services = list(await client.request("GET", "/v1/services"));
  const customers = list(await client.request("GET", "/v1/customers"));
  const serviceId = (name) => services.find((service) => service.name === name)?.id;
  const customerId = (name) => customers.find((customer) => customer.name === name)?.id;

  let created = 0;
  for (const item of DAY) {
    const ids = item.services.map(serviceId);
    if (ids.some((id) => !id) || !customerId(item.customer)) {
      warnings.push(`${item.time} ${item.customer}: serviço ou cliente ausente`);
      continue;
    }
    const result = await client.request(
      "POST",
      "/v1/appointments",
      {
        serviceIds: ids,
        date: today,
        startTime: item.time,
        customerId: customerId(item.customer),
        overlapOverride: true,
        overlapOverrideReason: SEED_MARK,
      },
      { "idempotency-key": `${SEED_MARK}-${today}-${item.time}` },
    );
    if (result.status !== 201) {
      warnings.push(`${item.time} ${item.customer}: POST /v1/appointments ${result.status}`);
      continue;
    }
    created += 1;
    if (item.after) {
      const after = await client.request("POST", `/v1/appointments/${result.payload.data.id}/${item.after}`, {});
      if (after.status >= 300) warnings.push(`${item.time} ${item.customer}: ${item.after} ${after.status} (horário ainda não passou?)`);
    }
  }
  for (const block of DAY_BLOCKS) {
    const result = await client.request("POST", "/v1/time-blocks", {
      startAt: `${today}T${block.start}:00${OFFSET}`,
      endAt: `${today}T${block.end}:00${OFFSET}`,
      kind: block.kind,
      title: block.title,
      reason: block.reason,
    });
    if (result.status !== 201) warnings.push(`bloqueio ${block.title}: POST /v1/time-blocks ${result.status}`);
  }
  return { today, created, warnings };
}

/** Ids que rotas com parâmetro (`/clientes/detalhes?id={customerId}`) usam. */
export async function resolveVisualIds(client) {
  const today = localToday();
  const customers = list(await client.request("GET", "/v1/customers"));
  const services = list(await client.request("GET", "/v1/services"));
  const appointments = list(await client.request("GET", `/v1/appointments?startDate=${today}&endDate=${today}`));
  const ana = customers.find((customer) => customer.name === "Ana Paula");
  const anaAppointment = appointments.find((appointment) => appointment.customerId === ana?.id) ?? appointments[0];
  const conversations = list(await client.request("GET", "/v1/conversations"));
  return {
    customerId: ana?.id ?? null,
    serviceId: services.find((service) => service.name === "Corte feminino")?.id ?? null,
    appointmentId: anaAppointment?.id ?? null,
    conversationId: conversations[0]?.id ?? null,
  };
}

/**
 * Segunda conta, parada no meio do onboarding: só o bloco de negócio gravado.
 * É o que deixa as etapas `/onboarding/*` alcançáveis — uma conta com
 * onboarding concluído é mandada para `/inicio`.
 */
export async function seedOnboardingAccount(client, { account, legalVersions, expectStatus }) {
  const registered = await client.request("POST", "/v1/auth/register", {
    email: account.email,
    name: VISUAL_BUSINESS.ownerName,
    password: account.password,
    confirmPassword: account.password,
    termsAccepted: true,
    termsVersion: legalVersions.termsVersion,
    privacyPolicyVersion: legalVersions.privacyPolicyVersion,
  });
  expectStatus(registered, 201, "POST /v1/auth/register (onboarding)");
  expectStatus(await client.request("PATCH", "/v1/onboarding", {
    business: {
      name: VISUAL_BUSINESS.name,
      category: VISUAL_BUSINESS.category,
      timezone: VISUAL_TIMEZONE,
      modalities: ["ON_SITE"],
      address: VISUAL_BUSINESS.address,
    },
  }), 200, "PATCH /v1/onboarding (negócio, conta de onboarding)");
}
