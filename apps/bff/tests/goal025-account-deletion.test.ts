import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { TenantContext } from "../src/lib/tenant-context.js";
import {
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS,
  accountDeletionDueAt,
} from "../src/modules/account/constants.js";
import { AccountDeletionError } from "../src/modules/account/errors.js";
import {
  type AccountDeletionDeps,
  type AccountDeletionEffects,
  type AccountDeletionRecord,
  type AccountDeletionStore,
  cancelAccountDeletion,
  type ScheduleAccountDeletionInput,
  startAccountDeletion,
} from "../src/modules/account/service.js";
import {
  decideCancel,
  decideStart,
  isDeletionPending,
} from "../src/modules/account/state.js";
import type { WhatsAppDisconnectOutcome } from "../src/modules/whatsapp/disconnect.js";

/**
 * Goal025/WU-02 — a máquina de estados da exclusão e seus efeitos.
 *
 * O que é provado aqui, sem PostgreSQL e sem HTTP: a decisão de iniciar e
 * cancelar, a ordem dos efeitos do início, a tolerância a falha remota, a
 * idempotência do pedido repetido e — o mais importante — as duas coisas que
 * **não** acontecem: a sessão não é revogada e cancelar não religa nada.
 *
 * Persistência de verdade, transação real e o fluxo ponta a ponta contra
 * PostgreSQL descartável são de outra unidade; aqui a loja é dublê em memória
 * e as portas de efeito são espiãs, porque é assim que se observa uma chamada
 * que **não** foi feita.
 */

const TENANT: TenantContext = {
  tenantId: "tenant-1",
  userId: "user-1",
  role: "OWNER",
};
const NOW = new Date("2026-09-16T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Dublê da loja. Guarda uma linha por `tenantId` — a chave primária real — e
 * aplica a única regra que o PostgreSQL aplicaria e importa aqui: `schedule` é
 * `upsert`, então pedir de novo depois de cancelar reescreve a mesma linha.
 *
 * `aiDisableCount` existe porque o desligamento da IA é transacional com a
 * gravação: contar as duas juntas é como o teste afirma que não houve uma sem
 * a outra.
 */
class StoreDouble implements AccountDeletionStore {
  rows = new Map<string, AccountDeletionRecord>();
  aiDisableCount = 0;
  scheduleCalls = 0;

  seed(record: Partial<AccountDeletionRecord> & { tenantId: string }): void {
    this.rows.set(record.tenantId, {
      requestedByUserId: TENANT.userId,
      status: "SCHEDULED",
      requestedAt: NOW,
      dueAt: accountDeletionDueAt(NOW),
      cancelledAt: null,
      purgedAt: null,
      ...record,
    });
  }

  async find(tenantId: string): Promise<AccountDeletionRecord | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async schedule(
    input: ScheduleAccountDeletionInput,
  ): Promise<AccountDeletionRecord> {
    this.scheduleCalls += 1;
    // Uma transação, dois efeitos: a linha e o desligamento da IA desejada.
    this.aiDisableCount += 1;
    const row: AccountDeletionRecord = {
      tenantId: input.tenantId,
      requestedByUserId: input.requestedByUserId,
      status: "SCHEDULED",
      requestedAt: input.requestedAt,
      dueAt: input.dueAt,
      cancelledAt: null,
      purgedAt: null,
    };
    this.rows.set(input.tenantId, row);
    return row;
  }

  async cancel(
    tenantId: string,
    cancelledAt: Date,
  ): Promise<AccountDeletionRecord> {
    const current = this.rows.get(tenantId);
    if (!current) throw new Error("cancel on a row that does not exist");
    const row = { ...current, status: "CANCELLED" as const, cancelledAt };
    this.rows.set(tenantId, row);
    return row;
  }
}

interface EffectSpy {
  effects: AccountDeletionEffects;
  calls: string[];
  projectedValues: boolean[];
}

function effectSpy(
  overrides: {
    projectAiDesired?: () => Promise<boolean>;
    takeDownAiChannel?: () => Promise<void>;
    disconnectWhatsApp?: () => Promise<WhatsAppDisconnectOutcome>;
  } = {},
): EffectSpy {
  const calls: string[] = [];
  const projectedValues: boolean[] = [];
  return {
    calls,
    projectedValues,
    effects: {
      async projectAiDesired(_context, enabled) {
        calls.push("projectAiDesired");
        projectedValues.push(enabled);
        return overrides.projectAiDesired
          ? await overrides.projectAiDesired()
          : true;
      },
      async takeDownAiChannel() {
        calls.push("takeDownAiChannel");
        if (overrides.takeDownAiChannel) await overrides.takeDownAiChannel();
      },
      async disconnectWhatsApp() {
        calls.push("disconnectWhatsApp");
        return overrides.disconnectWhatsApp
          ? await overrides.disconnectWhatsApp()
          : "DISCONNECTED";
      },
    },
  };
}

function loggerSpy() {
  const lines: string[] = [];
  return {
    lines,
    log: {
      info: (_payload: Record<string, unknown>, message: string) =>
        lines.push(`info:${message}`),
      warn: (_payload: Record<string, unknown>, message: string) =>
        lines.push(`warn:${message}`),
    },
  };
}

function deps(
  store = new StoreDouble(),
  spy = effectSpy(),
): AccountDeletionDeps & { store: StoreDouble; spy: EffectSpy } {
  const logger = loggerSpy();
  return { store, effects: spy.effects, log: logger.log, spy };
}

describe("Goal025/WU-02 — decisão de iniciar e cancelar", () => {
  it("inicia quando não há exclusão nenhuma", () => {
    expect(decideStart(null)).toEqual({ allowed: true });
  });

  it("recusa o segundo pedido com código próprio, em vez de agendar de novo", () => {
    const decision = decideStart({
      status: "SCHEDULED",
      dueAt: accountDeletionDueAt(NOW),
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "ACCOUNT_DELETION_ALREADY_SCHEDULED",
    });
  });

  it("aceita pedido novo depois de um cancelamento", () => {
    expect(
      decideStart({ status: "CANCELLED", dueAt: accountDeletionDueAt(NOW) }),
    ).toEqual({ allowed: true });
  });

  it("recusa pedido sobre conta já purgada", () => {
    expect(
      decideStart({ status: "PURGED", dueAt: accountDeletionDueAt(NOW) }),
    ).toEqual({ allowed: false, reason: "ACCOUNT_DELETION_ALREADY_PURGED" });
  });

  it("cancela dentro do prazo e recusa no instante do vencimento", () => {
    const dueAt = accountDeletionDueAt(NOW);
    const oneSecondBefore = new Date(dueAt.getTime() - 1_000);
    expect(decideCancel({ status: "SCHEDULED", dueAt }, oneSecondBefore)).toEqual(
      { allowed: true },
    );
    // O vencimento é inclusivo: `now === dueAt` já venceu, a mesma leitura que
    // o laço de purga faz. Se as duas discordassem existiria uma janela em que
    // a tela oferece cancelar e a purga já se considera autorizada.
    expect(decideCancel({ status: "SCHEDULED", dueAt }, dueAt)).toEqual({
      allowed: false,
      reason: "ACCOUNT_DELETION_GRACE_PERIOD_EXPIRED",
    });
  });

  it("distingue as três recusas de cancelamento", () => {
    const dueAt = accountDeletionDueAt(NOW);
    expect(decideCancel(null, NOW)).toEqual({
      allowed: false,
      reason: "ACCOUNT_DELETION_NOT_SCHEDULED",
    });
    expect(decideCancel({ status: "CANCELLED", dueAt }, NOW)).toEqual({
      allowed: false,
      reason: "ACCOUNT_DELETION_ALREADY_CANCELLED",
    });
    expect(decideCancel({ status: "PURGED", dueAt }, NOW)).toEqual({
      allowed: false,
      reason: "ACCOUNT_DELETION_ALREADY_PURGED",
    });
  });

  it("considera pendente a exclusão SCHEDULED, inclusive já vencida", () => {
    const dueAt = accountDeletionDueAt(NOW);
    expect(isDeletionPending({ status: "SCHEDULED", dueAt })).toBe(true);
    expect(isDeletionPending({ status: "CANCELLED", dueAt })).toBe(false);
    expect(isDeletionPending(null)).toBe(false);
  });
});

describe("Goal025/WU-02 — iniciar a exclusão", () => {
  it("grava SCHEDULED com vencimento calculado pelo relógio injetado", async () => {
    const d = deps();
    const result = await startAccountDeletion(
      { tenant: TENANT, requestId: "req-1", now: NOW },
      d,
    );

    expect(result.deletion.status).toBe("SCHEDULED");
    expect(result.deletion.requestedAt).toEqual(NOW);
    expect(result.deletion.requestedByUserId).toBe(TENANT.userId);
    expect(result.deletion.dueAt.getTime()).toBe(
      NOW.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS * DAY_MS,
    );
    // Outro relógio, outro vencimento: nada aqui lê `Date.now()`.
    const later = new Date("2026-10-01T00:00:00.000Z");
    d.store.rows.clear();
    const second = await startAccountDeletion(
      { tenant: TENANT, requestId: "req-2", now: later },
      d,
    );
    expect(second.deletion.dueAt.getTime()).toBe(
      later.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS * DAY_MS,
    );
  });

  it("desliga a IA desejada junto com a gravação e projeta enabled: false", async () => {
    const d = deps();
    const result = await startAccountDeletion(
      { tenant: TENANT, requestId: "req-1", now: NOW },
      d,
    );

    // Transacional com a gravação: uma gravação, um desligamento.
    expect(d.store.scheduleCalls).toBe(1);
    expect(d.store.aiDisableCount).toBe(1);
    expect(result.effects.aiDesiredDisabled).toBe(true);
    // A projeção é do desejado, e o desejado é desligado. `true` aqui religaria
    // a IA do negócio que acabou de pedir exclusão.
    expect(d.spy.projectedValues).toEqual([false]);
    expect(result.effects.aiProjected).toBe(true);
  });

  it("derruba o canal na IA e desconecta o WhatsApp, nesta ordem", async () => {
    const d = deps();
    const result = await startAccountDeletion(
      { tenant: TENANT, requestId: "req-1", now: NOW },
      d,
    );

    // A ordem é o comportamento: o canal cai antes de o número ser
    // desconectado, e a projeção do desejado vem antes das duas.
    expect(d.spy.calls).toEqual([
      "projectAiDesired",
      "takeDownAiChannel",
      "disconnectWhatsApp",
    ]);
    expect(result.effects.channelTakenDown).toBe(true);
    expect(result.effects.whatsapp).toBe("DISCONNECTED");
  });

  it("tolera falha remota: o pedido continua aceito e o pendente é nomeado", async () => {
    const spy = effectSpy({
      projectAiDesired: async () => false,
      takeDownAiChannel: async () => {
        throw new Error("ai is down");
      },
      disconnectWhatsApp: async () => {
        throw new Error("evolution is down");
      },
    });
    const d = deps(new StoreDouble(), spy);

    const result = await startAccountDeletion(
      { tenant: TENANT, requestId: "req-1", now: NOW },
      d,
    );

    // Nada foi lançado, e a exclusão está gravada: a IA fora do ar não pode
    // impedir o dono de pedir a exclusão da própria conta.
    expect(result.deletion.status).toBe("SCHEDULED");
    expect(result.effects).toEqual({
      aiDesiredDisabled: true,
      aiProjected: false,
      channelTakenDown: false,
      whatsapp: "FAILED",
    });
    // Falhar em derrubar o canal não impede a tentativa de desconectar o
    // número: um efeito pendente não cancela o seguinte.
    expect(spy.calls).toContain("disconnectWhatsApp");
  });

  it("pedir duas vezes não cria segunda exclusão nem repete efeito", async () => {
    const d = deps();
    const first = await startAccountDeletion(
      { tenant: TENANT, requestId: "req-1", now: NOW },
      d,
    );

    const second = startAccountDeletion(
      { tenant: TENANT, requestId: "req-2", now: new Date(NOW.getTime() + 60_000) },
      d,
    );
    await expect(second).rejects.toBeInstanceOf(AccountDeletionError);
    await second.catch((error: AccountDeletionError) => {
      // A escolha declarada: recusa com código próprio, não "200 de novo".
      expect(error.reason).toBe("ACCOUNT_DELETION_ALREADY_SCHEDULED");
      expect(error.statusCode).toBe(409);
    });

    // Uma linha, um conjunto de efeitos, e o vencimento continua sendo o do
    // primeiro pedido — o segundo não empurrou o prazo para frente.
    expect(d.store.rows.size).toBe(1);
    expect(d.store.scheduleCalls).toBe(1);
    expect(d.spy.calls).toEqual([
      "projectAiDesired",
      "takeDownAiChannel",
      "disconnectWhatsApp",
    ]);
    expect(d.store.rows.get(TENANT.tenantId)?.dueAt).toEqual(
      first.deletion.dueAt,
    );
  });

  it("pedido novo depois de cancelar reescreve a mesma linha", async () => {
    const store = new StoreDouble();
    store.seed({
      tenantId: TENANT.tenantId,
      status: "CANCELLED",
      cancelledAt: NOW,
    });
    const d = deps(store);

    const later = new Date(NOW.getTime() + 2 * DAY_MS);
    const result = await startAccountDeletion(
      { tenant: TENANT, requestId: "req-2", now: later },
      d,
    );

    expect(store.rows.size).toBe(1);
    expect(result.deletion.status).toBe("SCHEDULED");
    // `cancelledAt` do pedido anterior não sobrevive: a linha voltou a estar
    // em vigor, e um instante de cancelamento nela seria histórico mentiroso.
    expect(result.deletion.cancelledAt).toBeNull();
  });
});

describe("Goal025/WU-02 — cancelar", () => {
  it("volta o estado para não agendado e não dispara efeito de purga", async () => {
    const store = new StoreDouble();
    store.seed({ tenantId: TENANT.tenantId, status: "SCHEDULED" });
    const d = deps(store);

    const cancelledAt = new Date(NOW.getTime() + DAY_MS);
    const cancelled = await cancelAccountDeletion(
      { tenant: TENANT, now: cancelledAt },
      d,
    );

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).toEqual(cancelledAt);
    expect(cancelled.purgedAt).toBeNull();
    // A linha continua lá, cancelada: cancelar não purga e não apaga a prova.
    expect(store.rows.get(TENANT.tenantId)?.status).toBe("CANCELLED");
  });

  it("recusa fora do prazo e em estado terminal, sem alterar nada", async () => {
    const dueAt = accountDeletionDueAt(NOW);
    const cases: Array<{
      status: AccountDeletionRecord["status"];
      now: Date;
      reason: string;
    }> = [
      {
        status: "SCHEDULED",
        now: new Date(dueAt.getTime() + 1_000),
        reason: "ACCOUNT_DELETION_GRACE_PERIOD_EXPIRED",
      },
      {
        status: "CANCELLED",
        now: NOW,
        reason: "ACCOUNT_DELETION_ALREADY_CANCELLED",
      },
      { status: "PURGED", now: NOW, reason: "ACCOUNT_DELETION_ALREADY_PURGED" },
    ];

    for (const testCase of cases) {
      const store = new StoreDouble();
      store.seed({ tenantId: TENANT.tenantId, status: testCase.status, dueAt });
      const before = { ...store.rows.get(TENANT.tenantId) };
      const d = deps(store);

      await expect(
        cancelAccountDeletion({ tenant: TENANT, now: testCase.now }, d),
      ).rejects.toMatchObject({ reason: testCase.reason, statusCode: 409 });

      // "não faz nada" é literal: a linha é a mesma depois da recusa.
      expect(store.rows.get(TENANT.tenantId)).toEqual(before);
    }

    const empty = new StoreDouble();
    await expect(
      cancelAccountDeletion({ tenant: TENANT, now: NOW }, deps(empty)),
    ).rejects.toMatchObject({ reason: "ACCOUNT_DELETION_NOT_SCHEDULED" });
    expect(empty.rows.size).toBe(0);
  });

  it("não reconecta WhatsApp nem religa a IA", async () => {
    const store = new StoreDouble();
    store.seed({ tenantId: TENANT.tenantId, status: "SCHEDULED" });
    const d = deps(store);

    await cancelAccountDeletion(
      { tenant: TENANT, now: new Date(NOW.getTime() + DAY_MS) },
      d,
    );

    // Nenhuma porta de efeito foi tocada. Não há "reconectar" nem "religar"
    // para observar porque cancelar não os tem — e este assert falha no dia em
    // que alguém os acrescentar por gentileza.
    expect(d.spy.calls).toEqual([]);
    // A contagem de desligamentos da IA não mudou: nada religou o desejado.
    expect(store.aiDisableCount).toBe(0);
  });
});

describe("Goal025/WU-02 — o que a exclusão não faz", () => {
  /**
   * A sessão **não** é revogada ao pedir exclusão (Goal025 §2).
   *
   * Isto é uma ausência, e ausência não se observa por espião: o serviço não
   * recebe porta de sessão nenhuma. O que se pode afirmar, e falsificar, é que
   * o módulo não alcança `lib/session.ts` — é de lá que saem `revokeSession` e
   * `revokeAllUserSessions`, os dois únicos caminhos de revogação do BFF. No
   * dia em que alguém importar um deles aqui, este teste falha antes de a
   * suíte de integração precisar descobrir sozinha que o dono foi deslogado.
   */
  /**
   * "Pelo caminho já existente" precisa ser verdade estrutural, não intenção.
   *
   * O risco que este teste cobre é a cópia: alguém reescreve logout, remoção
   * remota e remoção da linha local dentro da exclusão, as duas pontas
   * divergem, e só uma delas tolera falha remota. Se `DELETE /v1/whatsapp`
   * voltar a ter a sequência própria, isto falha.
   */
  it("desconecta pelo mesmo caminho que DELETE /v1/whatsapp", () => {
    const routes = readFileSync(
      fileURLToPath(
        new URL("../src/modules/whatsapp/routes.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(routes).toMatch(/import \{ disconnectWhatsApp \} from ".\/disconnect.js"/u);
    // A sequência mora só em `disconnect.ts`: a rota não a repete.
    expect(routes).not.toMatch(/logoutInstance/u);
    expect(routes).not.toMatch(/whatsAppInstance\.delete/u);

    const service = readFileSync(
      fileURLToPath(
        new URL("../src/modules/account/service.ts", import.meta.url),
      ),
      "utf8",
    );
    // A exclusão chama a função; ela não reconstrói a sequência. (O tipo do
    // cliente injetável nomeia `logoutInstance`/`deleteInstance`, então o que
    // vale como prova aqui é o import, não a ausência dos nomes.)
    expect(service).toMatch(/from "..\/whatsapp\/disconnect.js"/u);
    expect(service).not.toMatch(/\.logoutInstance\(|\.deleteInstance\(/u);
  });

  it("não alcança o caminho de revogação de sessão", () => {
    const sources = ["service.ts", "state.ts", "errors.ts"].map((file) => ({
      file,
      text: readFileSync(
        fileURLToPath(
          new URL(`../src/modules/account/${file}`, import.meta.url),
        ),
        "utf8",
      ),
    }));

    for (const { file, text } of sources) {
      const code = text.replace(/\/\*\*[\s\S]*?\*\//gu, "");
      expect(code, `${file} importa lib/session`).not.toMatch(
        /from\s+"[^"]*lib\/session/u,
      );
      expect(code, `${file} revoga sessão`).not.toMatch(
        /revokeSession|revokeAllUserSessions/u,
      );
    }
  });
});
