import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FastifyRequest } from "fastify";

/**
 * Goal025/WU-04 — a automação não volta sozinha.
 *
 * O que é provado aqui, sem PostgreSQL e sem HTTP:
 *
 * - com `AccountDeletion` `SCHEDULED`, `reconcileAiActivation` **não** religa
 *   a IA, nem com execução `SUCCEEDED` e serviço operacional — e desliga o
 *   efetivo que tenha sobrado ligado;
 * - negócio sem exclusão agendada tem a reconciliação da baseline inteira:
 *   ativar, não ativar, convergir e desligar por troca de canal;
 * - exclusão `CANCELLED` não é exclusão em vigor: a conta volta a ser normal.
 *
 * Cada teste da primeira lista falha se a guarda for removida de
 * `reconcile()`, porque o caminho de autoativação volta a ser alcançado.
 *
 * `lib/prisma.js` é substituído por dublê de módulo, e é a única forma: a
 * reconciliação lê o banco por `getPrisma()` — não há porta de persistência
 * para injetar, e inventar uma só para o teste mudaria a produção por causa
 * do teste. O dublê guarda as duas tabelas que a reconciliação toca.
 */

const store = vi.hoisted(() => {
  interface AiSettingsRow {
    tenantId: string;
    enabled: boolean;
    activatedByRunId: string | null;
    tone: string | null;
  }
  interface AccountDeletionRow {
    tenantId: string;
    status: "SCHEDULED" | "CANCELLED" | "PURGED";
    dueAt: Date;
  }
  const aiSettings = new Map<string, AiSettingsRow>();
  const deletions = new Map<string, AccountDeletionRow>();
  return { aiSettings, deletions };
});

vi.mock("../src/lib/prisma.js", () => {
  const byTenant = (where: { tenantId: string }) => where.tenantId;
  return {
    getPrisma: () => ({
      aiSettings: {
        findUnique: async ({ where }: { where: { tenantId: string } }) =>
          store.aiSettings.get(byTenant(where)) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { tenantId: string };
          data: Record<string, unknown>;
        }) => {
          const current = store.aiSettings.get(byTenant(where));
          if (!current) throw new Error("aiSettings row not found");
          const next = { ...current, ...data };
          store.aiSettings.set(byTenant(where), next);
          return next;
        },
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { tenantId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const current = store.aiSettings.get(byTenant(where));
          const next = current
            ? { ...current, ...update }
            : ({ tone: null, ...create } as never);
          store.aiSettings.set(byTenant(where), next);
          return next;
        },
      },
      accountDeletion: {
        findUnique: async ({ where }: { where: { tenantId: string } }) =>
          store.deletions.get(byTenant(where)) ?? null,
      },
      // A projeção do desejado lê o perfil do negócio; aqui ele só precisa
      // existir, porque o que este teste observa é o `enabled` que sai.
      businessProfile: {
        upsert: async ({ where }: { where: { tenantId: string } }) => ({
          tenantId: where.tenantId,
        }),
      },
    }),
    disconnectPrisma: async () => {},
  };
});

const { reconcileAiActivation } = await import("../src/lib/ai-activation.js");
const { assertAiActivationNotBlockedByDeletion } = await import(
  "../src/modules/account/service.js"
);
type Deps = Parameters<typeof reconcileAiActivation>[1];

const TENANT = "tenant-1";

/** Execução do teste real, no recorte que a reconciliação lê. */
function activationRun(
  overrides: {
    id?: string;
    state?: "RUNNING" | "SUCCEEDED" | "FAILED";
    supersededByChannelChange?: boolean;
  } = {},
) {
  return {
    id: overrides.id ?? "run-1",
    state: overrides.state ?? "SUCCEEDED",
    supersededByChannelChange: overrides.supersededByChannelChange ?? false,
  };
}

interface Upstream {
  /** O que a IA reporta como efetivo; muda quando o BFF projeta. */
  effectiveEnabled: boolean | null;
  /** Todo `enabled` projetado, na ordem. Vazio é "nada foi projetado". */
  projected: boolean[];
}

function harness(options: {
  run?: ReturnType<typeof activationRun> | null;
  effectiveEnabled?: boolean | null;
  aiActivationReady?: boolean;
}): { deps: Deps; upstream: Upstream; request: FastifyRequest } {
  const upstream: Upstream = {
    effectiveEnabled:
      options.effectiveEnabled === undefined ? false : options.effectiveEnabled,
    projected: [],
  };
  const deps = {
    ai: {
      getActivationTest: async () => options.run ?? null,
      getAiTenantConfig: async () =>
        upstream.effectiveEnabled === null
          ? null
          : { enabled: upstream.effectiveEnabled, tone: "BALANCED" },
      updateTenantConfig: async (
        _context: unknown,
        input: { enabled: boolean },
      ) => {
        upstream.projected.push(input.enabled);
        upstream.effectiveEnabled = input.enabled;
        return { ok: true };
      },
    },
    scheduling: {
      calendar: async () => ({
        capabilities: { aiActivationReady: options.aiActivationReady ?? true },
      }),
    },
  } as unknown as Deps;

  const request = {
    id: "req-1",
    tenantContext: { tenantId: TENANT, userId: "user-1", role: "OWNER" },
    log: { warn: () => {} },
  } as unknown as FastifyRequest;

  return { deps, upstream, request };
}

function seedAi(
  enabled: boolean,
  activatedByRunId: string | null = null,
): void {
  store.aiSettings.set(TENANT, {
    tenantId: TENANT,
    enabled,
    activatedByRunId,
    tone: null,
  });
}

function seedDeletion(status: "SCHEDULED" | "CANCELLED" | "PURGED"): void {
  store.deletions.set(TENANT, {
    tenantId: TENANT,
    status,
    dueAt: new Date("2026-09-23T12:00:00.000Z"),
  });
}

function desiredAi() {
  return store.aiSettings.get(TENANT) ?? null;
}

beforeEach(() => {
  store.aiSettings.clear();
  store.deletions.clear();
});

describe("Goal025/WU-04 — exclusão agendada não deixa a IA voltar", () => {
  it("execução bem-sucedida não religa a IA com exclusão SCHEDULED", async () => {
    seedDeletion("SCHEDULED");
    const { deps, upstream, request } = harness({ run: activationRun() });

    const outcome = await reconcileAiActivation(request, deps);

    // Sem a guarda este é exatamente o caso que devolve "ACTIVATED".
    expect(outcome).not.toBe("ACTIVATED");
    expect(outcome).toBe("NOOP");
    expect(desiredAi()?.enabled ?? false).toBe(false);
    expect(upstream.projected).toEqual([]);
    expect(upstream.effectiveEnabled).toBe(false);
  });

  it("não religa nem quando o negócio nunca teve linha de AiSettings", async () => {
    seedDeletion("SCHEDULED");
    const { deps, upstream, request } = harness({
      run: activationRun(),
      effectiveEnabled: null,
    });

    const outcome = await reconcileAiActivation(request, deps);

    expect(outcome).toBe("CONVERGED");
    // Tenant nunca projetado: convergir é projetar o desejado, que é `false`.
    expect(upstream.projected).toEqual([false]);
    expect(desiredAi()).toBeNull();
  });

  it("desliga o efetivo que sobrou ligado quando a exclusão está em vigor", async () => {
    // O início da exclusão desligou o desejado na transação, mas a projeção
    // daquele momento falhou (a IA estava fora do ar). A reconciliação
    // seguinte precisa desligar de verdade, não reprojetar o que ficou.
    seedDeletion("SCHEDULED");
    seedAi(true, "run-1");
    const { deps, upstream, request } = harness({
      run: null,
      effectiveEnabled: true,
    });

    const outcome = await reconcileAiActivation(request, deps);

    expect(outcome).toBe("CONVERGED");
    expect(upstream.projected).toEqual([false]);
    expect(upstream.effectiveEnabled).toBe(false);
  });

  it("exclusão PURGED ou CANCELLED não é exclusão em vigor", async () => {
    // `CANCELLED` devolve a conta ao estado normal: o dono que cancelou,
    // reconectou o número e refez o teste real tem direito à ativação — é a
    // execução nova que autoriza, e a guarda não fica no caminho dela.
    seedDeletion("CANCELLED");
    const { deps, upstream, request } = harness({
      run: activationRun({ id: "run-2" }),
    });

    const outcome = await reconcileAiActivation(request, deps);

    expect(outcome).toBe("ACTIVATED");
    expect(desiredAi()?.enabled).toBe(true);
    expect(upstream.projected).toEqual([true]);
  });
});

describe("Goal025/WU-04 — sem exclusão agendada, a baseline inteira", () => {
  it("execução bem-sucedida ativa a IA e projeta", async () => {
    const { deps, upstream, request } = harness({ run: activationRun() });

    const outcome = await reconcileAiActivation(request, deps);

    expect(outcome).toBe("ACTIVATED");
    expect(desiredAi()?.enabled).toBe(true);
    expect(desiredAi()?.activatedByRunId).toBe("run-1");
    expect(upstream.projected).toEqual([true]);
  });

  it("execução que não é SUCCEEDED não ativa", async () => {
    const { deps, request } = harness({
      run: activationRun({ state: "FAILED" }),
    });

    const outcome = await reconcileAiActivation(request, deps);

    expect(outcome).toBe("NOOP");
    expect(desiredAi()?.enabled ?? false).toBe(false);
  });

  it("sem serviço operacional não ativa nem por teste bem-sucedido", async () => {
    const { deps, upstream, request } = harness({
      run: activationRun(),
      aiActivationReady: false,
    });

    const outcome = await reconcileAiActivation(request, deps);

    expect(outcome).toBe("NOOP");
    expect(upstream.projected).toEqual([]);
  });

  it("reconciliar a mesma execução duas vezes não duplica ativação", async () => {
    const { deps, upstream, request } = harness({ run: activationRun() });

    expect(await reconcileAiActivation(request, deps)).toBe("ACTIVATED");
    expect(await reconcileAiActivation(request, deps)).toBe("NOOP");
    expect(upstream.projected).toEqual([true]);
  });

  it("divergência sem teste novo converge para o desejado do BFF", async () => {
    seedAi(true, "run-1");
    const { deps, upstream, request } = harness({
      run: null,
      effectiveEnabled: false,
    });

    const outcome = await reconcileAiActivation(request, deps);

    expect(outcome).toBe("CONVERGED");
    expect(upstream.projected).toEqual([true]);
  });

  it("execução superada pela troca do canal desliga a IA que ela ligou", async () => {
    seedAi(true, "run-1");
    const { deps, upstream, request } = harness({
      run: activationRun({ supersededByChannelChange: true }),
      effectiveEnabled: true,
    });

    const outcome = await reconcileAiActivation(request, deps);

    expect(outcome).toBe("DEACTIVATED_BY_CHANNEL_CHANGE");
    expect(desiredAi()?.enabled).toBe(false);
    expect(desiredAi()?.activatedByRunId).toBeNull();
    expect(upstream.projected).toEqual([false]);
  });
});

/**
 * A mesma guarda, no caminho de pedido humano (Goal025 §3).
 *
 * §3 diz "nenhum caminho do produto", e cita `reconcileAiActivation` como "em
 * particular". `PATCH /v1/settings/ai` é o outro caminho: é o único lugar que
 * grava `AiSettings.enabled = true` por vontade de quem está na tela. A rota
 * chama esta função antes de qualquer gravação ou projeção; aqui prova-se a
 * decisão, e a suíte de rotas prova o `409` de ponta a ponta.
 */
describe("Goal025 §3 — a guarda de não-reativação fora da reconciliação", () => {
  it("recusa ligar a IA com exclusão SCHEDULED", async () => {
    seedDeletion("SCHEDULED");

    await expect(
      assertAiActivationNotBlockedByDeletion(TENANT),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
  });

  it("deixa passar quem não tem exclusão nenhuma", async () => {
    await expect(
      assertAiActivationNotBlockedByDeletion(TENANT),
    ).resolves.toBeUndefined();
  });

  it("deixa passar depois de cancelar: a conta voltou a ser normal", async () => {
    seedDeletion("CANCELLED");

    await expect(
      assertAiActivationNotBlockedByDeletion(TENANT),
    ).resolves.toBeUndefined();
  });

  it("exclusão já purgada não é o caso desta guarda", async () => {
    seedDeletion("PURGED");

    await expect(
      assertAiActivationNotBlockedByDeletion(TENANT),
    ).resolves.toBeUndefined();
  });
});
