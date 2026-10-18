// Primeiro import de propósito: fixa as variáveis da autenticação interna
// antes de `config/env.ts` ser avaliado (ver o próprio arquivo).
import "../unit/support/test-env.js";

import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Lista de clientes paginada por cursor (scroll infinito da tela de
 * clientes) contra PostgreSQL real: a ordem é a da lista inteira, nenhuma
 * pessoa repete nem some entre páginas, `total` conta o filtro inteiro e a
 * busca acontece no servidor, não só sobre o que já foi entregue.
 */

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "customer-page-tenant-a";
const tenantB = "customer-page-tenant-b";

let prisma: PrismaClient;
let app: FastifyInstance;

const bffToken = deriveInternalToken(
  TEST_INTERNAL_SERVICE_TOKEN,
  "bff",
  SERVICE_AUDIENCE,
  "command",
);

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${bffToken}`,
    "x-tenant-id": tenantId,
    "x-user-id": "owner-1",
    "x-request-id": "req-customer-page",
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await registerManagementRoutes(instance, prisma);
  instance.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    }
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      requestId: request.id,
    });
  });
  return instance;
}

type ListItem = { id: string; name: string | null; phone: string | null };
type ListPage = {
  items: ListItem[];
  total: number;
  nextCursor: string | null;
};

async function getList(
  tenantId: string,
  query: Record<string, string>,
): Promise<ListPage> {
  const response = await app.inject({
    method: "GET",
    url: `/internal/customers?${new URLSearchParams(query).toString()}`,
    headers: headers(tenantId),
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as ListPage;
}

/** Percorre a lista inteira de `limit` em `limit`, seguindo o cursor. */
async function walk(
  tenantId: string,
  query: Record<string, string>,
): Promise<{ pages: ListPage[]; items: ListItem[] }> {
  const pages: ListPage[] = [];
  let cursor: string | null = null;
  do {
    const page = await getList(tenantId, {
      ...query,
      ...(cursor ? { cursor } : {}),
    });
    pages.push(page);
    cursor = page.nextCursor;
  } while (cursor && pages.length < 20);
  return { pages, items: pages.flatMap((page) => page.items) };
}

async function seedTenant(tenantId: string): Promise<void> {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: "America/Sao_Paulo" },
    update: { source: "AVENLY", timezone: "America/Sao_Paulo" },
  });
}

/**
 * 36 pessoas: nomes repetidos com o mesmo `createdAt` (o desempate é o
 * `id`), acento, minúscula e três cadastros sem nome, que vão para o fim.
 */
async function seedCustomers(tenantId: string): Promise<void> {
  const sameInstant = new Date("2026-01-01T12:00:00.000Z");
  const rows: Array<{
    name: string | null;
    phone?: string;
    createdAt?: Date;
  }> = [
    ...Array.from({ length: 28 }, (_, index) => ({
      name: `Cliente ${String(index + 1).padStart(2, "0")}`,
    })),
    { name: "Ana", createdAt: sameInstant },
    { name: "Ana", createdAt: sameInstant },
    { name: "Ana", createdAt: sameInstant },
    { name: "Álvaro" },
    { name: "beatriz Souza", phone: "+55 11 98888-7777" },
    { name: null, phone: "+55 11 97777-0001" },
    { name: null, phone: "+55 11 97777-0002" },
    { name: null, phone: "+55 11 97777-0003" },
  ];
  for (const row of rows) {
    await prisma.customer.create({
      data: {
        tenantId,
        name: row.name,
        phone: row.phone ?? null,
        normalizedPhone: row.phone ? row.phone.replace(/\D/gu, "") : null,
        ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      },
    });
  }
}

describeWithDatabase("customer list pagination against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
  });

  afterAll(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await seedTenant(tenantA);
    await seedTenant(tenantB);
    await seedCustomers(tenantA);
    await prisma.customer.create({ data: { tenantId: tenantB, name: "Ana" } });
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("percorre a lista de 15 em 15 na mesma ordem da lista inteira, sem repetir nem pular ninguém", async () => {
    const full = await getList(tenantA, {});
    expect(full.items).toHaveLength(36);
    expect(full.total).toBe(36);
    expect(full.nextCursor).toBeNull();

    const { pages, items } = await walk(tenantA, { limit: "15" });
    expect(pages.map((page) => page.items.length)).toEqual([15, 15, 6]);
    expect(pages.every((page) => page.total === 36)).toBe(true);
    expect(pages.at(-1)?.nextCursor).toBeNull();
    expect(items.map((item) => item.id)).toEqual(
      full.items.map((item) => item.id),
    );
    expect(new Set(items.map((item) => item.id)).size).toBe(36);
    // A tela só agrupa, não reordena: acento e caixa não separam a letra.
    expect(items.slice(0, 6).map((item) => item.name)).toEqual([
      "Álvaro",
      "Ana",
      "Ana",
      "Ana",
      "beatriz Souza",
      "Cliente 01",
    ]);
    // Sem nome por último; o outro negócio nunca entra.
    expect(items.slice(-3).every((item) => item.name === null)).toBe(true);
  });

  it("cadastro novo antes do cursor não repete ninguém na página seguinte", async () => {
    const first = await getList(tenantA, { limit: "15" });
    await prisma.customer.create({
      data: { tenantId: tenantA, name: "Aaron" },
    });
    const second = await getList(tenantA, {
      limit: "15",
      cursor: first.nextCursor ?? "",
    });
    const firstIds = new Set(first.items.map((item) => item.id));
    expect(second.items.some((item) => firstIds.has(item.id))).toBe(false);
    expect(second.total).toBe(37);
  });

  it("busca no servidor casa nome além da primeira página, sem diferenciar maiúscula, e pagina o resultado", async () => {
    const search = await walk(tenantA, { limit: "2", q: "cliente 2" });
    expect(search.items.map((item) => item.name)).toEqual([
      "Cliente 20",
      "Cliente 21",
      "Cliente 22",
      "Cliente 23",
      "Cliente 24",
      "Cliente 25",
      "Cliente 26",
      "Cliente 27",
      "Cliente 28",
    ]);
    expect(search.pages.every((page) => page.total === 9)).toBe(true);

    const lower = await getList(tenantA, { limit: "15", q: "BEATRIZ" });
    expect(lower.items.map((item) => item.name)).toEqual(["beatriz Souza"]);
  });

  it("busca por trecho do telefone casa os dígitos, com ou sem máscara", async () => {
    const masked = await getList(tenantA, { limit: "15", q: "98888-7777" });
    expect(masked.items.map((item) => item.name)).toEqual(["beatriz Souza"]);
    const unnamed = await getList(tenantA, { limit: "15", q: "97777" });
    expect(unnamed.total).toBe(3);
  });

  it("curinga do LIKE na busca é literal, não casa todo mundo", async () => {
    const percent = await getList(tenantA, { limit: "15", q: "%" });
    expect(percent.total).toBe(0);
    const underscore = await getList(tenantA, { limit: "15", q: "_" });
    expect(underscore.total).toBe(0);
  });

  // Abas Ativos/Inativos e ordem (2026-10-18).
  it("status separa ativos de inativos só quando pedido; sem ele, todos", async () => {
    const ana = await prisma.customer.findFirstOrThrow({
      where: { tenantId: tenantA, name: "Álvaro" },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/internal/customers/${ana.id}`,
      headers: headers(tenantA),
      payload: { active: false },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.active).toBe(false);

    const active = await getList(tenantA, { limit: "50", status: "active" });
    const inactive = await getList(tenantA, { limit: "50", status: "inactive" });
    const everyone = await getList(tenantA, { limit: "50" });
    expect(active.total).toBe(35);
    expect(inactive.items.map((item) => item.name)).toEqual(["Álvaro"]);
    expect(everyone.total).toBe(36);

    const back = await app.inject({
      method: "PATCH",
      url: `/internal/customers/${ana.id}`,
      headers: headers(tenantA),
      payload: { active: true },
    });
    expect(back.json().data.active).toBe(true);
    expect((await getList(tenantA, { limit: "50", status: "inactive" })).total).toBe(0);
  });

  it("ordena por último atendimento e por frequência, paginando sem repetir", async () => {
    const byName = async (name: string) =>
      prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA, name } });
    const [first, second, third] = await Promise.all([
      byName("Cliente 01"),
      byName("Cliente 02"),
      byName("Cliente 03"),
    ]);
    const visit = (customerId: string, iso: string, status: string) =>
      prisma.appointment.create({
        data: {
          tenantId: tenantA,
          customerId,
          source: "USER",
          startAt: new Date(iso),
          endAt: new Date(new Date(iso).getTime() + 30 * 60_000),
          status,
          statusRaw: status,
          title: "Corte",
          createdBy: "user-1",
        },
      });
    await visit(first.id, "2026-01-10T12:00:00.000Z", "COMPLETED");
    await visit(second.id, "2026-03-10T12:00:00.000Z", "COMPLETED");
    await visit(second.id, "2026-02-10T12:00:00.000Z", "COMPLETED");
    await visit(third.id, "2026-04-10T12:00:00.000Z", "CANCELLED");

    const last = await walk(tenantA, { limit: "15", sort: "last" });
    expect(last.items.slice(0, 2).map((item) => item.name)).toEqual([
      "Cliente 02",
      "Cliente 01",
    ]);
    expect(new Set(last.items.map((item) => item.id)).size).toBe(36);

    const frequency = await walk(tenantA, { limit: "15", sort: "frequency" });
    expect(frequency.items.slice(0, 2).map((item) => item.name)).toEqual([
      "Cliente 02",
      "Cliente 01",
    ]);
    expect(frequency.items).toHaveLength(36);
    // Sem atendimento, a ordem de nome continua valendo.
    expect(frequency.items[2]?.name).toBe("Álvaro");

    // Próximos atendimentos: o horário marcado mais perto primeiro; quem não
    // tem nada marcado fica no fim, por nome.
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const later = new Date(Date.now() + 9 * 86_400_000).toISOString();
    await visit(third.id, later, "CONFIRMED");
    await visit(first.id, soon, "SCHEDULED");
    const next = await walk(tenantA, { limit: "15", sort: "next" });
    expect(next.items.slice(0, 3).map((item) => item.name)).toEqual([
      "Cliente 01",
      "Cliente 03",
      "Álvaro",
    ]);
    expect(next.items).toHaveLength(36);

    const mixed = await app.inject({
      method: "GET",
      url: `/internal/customers?limit=15&sort=frequency&cursor=${last.pages[0]?.nextCursor}`,
      headers: headers(tenantA),
    });
    expect(mixed.statusCode).toBe(400);
  });

  it("cursor que não veio da lista é recusado com 400", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/customers?limit=15&cursor=nao-e-cursor",
      headers: headers(tenantA),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});
