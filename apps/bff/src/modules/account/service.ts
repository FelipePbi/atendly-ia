import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import type { InternalRequestContext } from "../../clients/internal-http-client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  type AiProjectionLogger,
  projectAiDesiredState,
} from "../../lib/ai-activation.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import { getPrisma } from "../../lib/prisma.js";
import type { TenantContext } from "../../lib/tenant-context.js";
import {
  disconnectWhatsApp,
  type WhatsAppDisconnectOutcome,
} from "../whatsapp/disconnect.js";
import { accountDeletionDueAt } from "./constants.js";
import { AccountDeletionError } from "./errors.js";
import {
  type AccountDeletionState,
  decideCancel,
  decideStart,
  isDeletionPending,
} from "./state.js";

/**
 * Início e cancelamento da exclusão de conta (Goal025/WU-02).
 *
 * A decisão de "pode ou não pode" está em `state.ts` e não se repete aqui.
 * Este arquivo é sobre a **ordem dos efeitos** e sobre o que cada falha pode
 * ou não derrubar, que é onde está o risco real do Goal.
 *
 * TRÊS REGRAS QUE VALEM MAIS QUE A SIMETRIA DO CÓDIGO:
 *
 * 1. **O durável primeiro, e junto com o desligamento da IA.** Gravar
 *    `SCHEDULED` e escrever `enabled: false`/`activatedByRunId: null` são uma
 *    transação só. Separá-las abriria a janela em que a exclusão existe e a
 *    automação continua ligada — e, como pedir de novo é recusado com
 *    `ACCOUNT_DELETION_ALREADY_SCHEDULED`, a segunda tentativa não reaplicaria
 *    o efeito. A transação fecha essa janela em vez de documentá-la.
 * 2. **Falha remota não derruba o pedido.** A IA fora do ar ou a Evolution
 *    recusando não podem impedir o dono de pedir a exclusão da própria conta.
 *    Cada efeito remoto é tolerado e devolvido no resultado, nomeado — quem
 *    chama sabe o que ficou pendente em vez de descobrir por ausência.
 * 3. **Nada aqui religa nada.** Cancelar não tem porta de efeito nenhuma, e
 *    isso é a implementação da promessa de produto, não um esquecimento.
 *
 * **A sessão não é tocada.** Não há porta de sessão neste módulo e ele não
 * importa `lib/session.ts`: cancelar exige entrar, e revogar a sessão de quem
 * pediu tornaria o prazo de sete dias decorativo.
 * `tests/goal025-account-deletion.test.ts` falha se um import de sessão
 * aparecer aqui.
 */

/** O estado durável como o resto do produto o lê. */
export interface AccountDeletionRecord extends AccountDeletionState {
  tenantId: string;
  requestedByUserId: string;
  requestedAt: Date;
  cancelledAt: Date | null;
  purgedAt: Date | null;
}

export interface ScheduleAccountDeletionInput {
  tenantId: string;
  requestedByUserId: string;
  requestedAt: Date;
  dueAt: Date;
}

/**
 * O recorte de persistência que o início e o cancelamento usam.
 *
 * Porta, e não `PrismaClient` inteiro, por causa de `schedule`: ele **precisa**
 * ser atômico (regra 1 acima), e uma porta declara essa exigência no tipo em
 * vez de confiar que todo chamador futuro se lembre de abrir a transação.
 */
export interface AccountDeletionStore {
  find(tenantId: string): Promise<AccountDeletionRecord | null>;
  /**
   * Grava a exclusão como `SCHEDULED` **e** desliga a IA desejada do negócio,
   * numa transação só. `upsert` pela chave primária `tenantId`: pedido novo
   * depois de um cancelamento reescreve a mesma linha, não cria a segunda.
   */
  schedule(input: ScheduleAccountDeletionInput): Promise<AccountDeletionRecord>;
  cancel(tenantId: string, cancelledAt: Date): Promise<AccountDeletionRecord>;
}

/**
 * Os efeitos externos do início, um por porta.
 *
 * Existem separados para que o teste veja **quais** foram chamados e em que
 * ordem — "cancelar não religa a IA" só é afirmável se houver como observar
 * que a porta não foi tocada.
 */
export interface AccountDeletionEffects {
  /** Projeta o desejado (sempre `false` aqui) na IA. Nunca lança. */
  projectAiDesired(
    context: InternalRequestContext,
    enabled: boolean,
  ): Promise<boolean>;
  /**
   * Derruba o canal do negócio na IA. Sem canal ativo,
   * `supersededByChannelChange` passa a valer e a reconciliação não tem como
   * religar a IA — é o que torna a não-reativação verificável.
   */
  takeDownAiChannel(context: InternalRequestContext): Promise<void>;
  /** O caminho de `DELETE /v1/whatsapp`, o mesmo, não uma cópia. */
  disconnectWhatsApp(
    tenant: TenantContext,
    requestId: string,
  ): Promise<WhatsAppDisconnectOutcome>;
}

export interface AccountDeletionLogger extends AiProjectionLogger {
  info(payload: Record<string, unknown>, message: string): void;
}

export interface AccountDeletionDeps {
  store: AccountDeletionStore;
  effects: AccountDeletionEffects;
  log: AccountDeletionLogger;
}

/** O que cada efeito remoto conseguiu fazer nesta passada. */
export interface StartAccountDeletionEffectReport {
  /** Sempre `true`: é transacional com a gravação, ou nada foi gravado. */
  aiDesiredDisabled: boolean;
  /** `false` quando a IA não aceitou a projeção agora; o desejado já está gravado. */
  aiProjected: boolean;
  /** `false` quando o canal não pôde ser derrubado agora. */
  channelTakenDown: boolean;
  /** `"FAILED"` cobre também a divergência de vínculo, que recusa localmente. */
  whatsapp: WhatsAppDisconnectOutcome | "FAILED";
}

export interface StartAccountDeletionResult {
  deletion: AccountDeletionRecord;
  effects: StartAccountDeletionEffectReport;
}

export interface StartAccountDeletionInput {
  tenant: TenantContext;
  requestId: string;
  /** Relógio injetado: o vencimento sai daqui, nunca de `Date.now()`. */
  now: Date;
}

/**
 * Inicia a exclusão.
 *
 * A reautenticação por senha atual acontece **antes** daqui, na rota: este
 * serviço já recebe um pedido aceito. Ele recusa por estado, nunca por
 * identidade.
 */
export async function startAccountDeletion(
  input: StartAccountDeletionInput,
  deps: AccountDeletionDeps,
): Promise<StartAccountDeletionResult> {
  const { tenant, now } = input;
  const decision = decideStart(await deps.store.find(tenant.tenantId));
  if (!decision.allowed) throw new AccountDeletionError(decision.reason);

  // 1 e 2 juntos: a exclusão nasce `SCHEDULED` e a automação morre na mesma
  // transação. Depois deste await não existe estado com exclusão pedida e IA
  // ligada, nem por um instante nem por uma falha.
  const deletion = await deps.store.schedule({
    tenantId: tenant.tenantId,
    requestedByUserId: tenant.userId,
    requestedAt: now,
    dueAt: accountDeletionDueAt(now),
  });

  const context: InternalRequestContext = {
    tenantId: tenant.tenantId,
    userId: tenant.userId,
    requestId: input.requestId,
  };

  // 3. Projetar o desejado. `projectAiDesiredState` não lança por contrato; o
  // `false` já é a resposta de "a IA não aceitou agora".
  const aiProjected = await deps.effects.projectAiDesired(context, false);

  // 4. Derrubar o canal. Daqui em diante a IA não tem canal ativo para o
  // negócio, então nenhuma execução do teste real ainda autoriza ativação.
  let channelTakenDown = true;
  try {
    await deps.effects.takeDownAiChannel(context);
  } catch (error) {
    channelTakenDown = false;
    deps.log.warn(
      { err: toErrorMessage(error), tenantId: tenant.tenantId },
      "AI channel takedown is pending for this account deletion.",
    );
  }

  // 5. Desconectar o WhatsApp pelo caminho que já existe. A divergência de
  // vínculo recusa com `CONFLICT` lá dentro; aqui ela é tolerada como qualquer
  // outra falha, porque a exclusão já está gravada e devolver erro ao dono
  // seria mentir sobre um pedido que foi aceito.
  let whatsapp: StartAccountDeletionEffectReport["whatsapp"];
  try {
    whatsapp = await deps.effects.disconnectWhatsApp(tenant, input.requestId);
  } catch (error) {
    whatsapp = "FAILED";
    deps.log.warn(
      { err: toErrorMessage(error), tenantId: tenant.tenantId },
      "WhatsApp disconnection is pending for this account deletion.",
    );
  }

  const effects: StartAccountDeletionEffectReport = {
    aiDesiredDisabled: true,
    aiProjected,
    channelTakenDown,
    whatsapp,
  };
  deps.log.info(
    {
      tenantId: tenant.tenantId,
      dueAt: deletion.dueAt.toISOString(),
      ...effects,
    },
    "Account deletion scheduled.",
  );
  return { deletion, effects };
}

export interface CancelAccountDeletionInput {
  tenant: TenantContext;
  now: Date;
}

/**
 * Cancela a exclusão dentro do prazo.
 *
 * **Não restaura nada**, e a ausência de efeito é o comportamento, não uma
 * lacuna: o WhatsApp continua desconectado, a IA continua desligada e voltar a
 * operar exige reconectar o número e refazer o teste real, pelos fluxos que já
 * existem. Só `store` é tocado — `effects` nem entra na assinatura.
 */
export async function cancelAccountDeletion(
  input: CancelAccountDeletionInput,
  deps: Pick<AccountDeletionDeps, "store" | "log">,
): Promise<AccountDeletionRecord> {
  const { tenant, now } = input;
  const decision = decideCancel(await deps.store.find(tenant.tenantId), now);
  if (!decision.allowed) throw new AccountDeletionError(decision.reason);

  const cancelled = await deps.store.cancel(tenant.tenantId, now);
  deps.log.info(
    { tenantId: tenant.tenantId },
    "Account deletion cancelled; automation stays off until the owner reconnects and retests.",
  );
  return cancelled;
}

type AccountDeletionPrisma = Pick<
  PrismaClient,
  "accountDeletion" | "aiSettings" | "$transaction"
>;

/**
 * A loja de produção.
 *
 * `schedule` é a única que abre transação, pelo motivo da regra 1. `aiSettings`
 * entra por `upsert` porque negócio que nunca ligou a IA não tem linha — e
 * "não tem linha" precisa virar `enabled: false` explícito, senão o estado da
 * automação continuaria sendo inferência.
 */
export function accountDeletionStore(
  prisma: AccountDeletionPrisma = getPrisma(),
): AccountDeletionStore {
  return {
    async find(tenantId) {
      return prisma.accountDeletion.findUnique({ where: { tenantId } });
    },
    async schedule(input) {
      const [deletion] = await prisma.$transaction([
        prisma.accountDeletion.upsert({
          where: { tenantId: input.tenantId },
          create: {
            tenantId: input.tenantId,
            requestedByUserId: input.requestedByUserId,
            status: "SCHEDULED",
            requestedAt: input.requestedAt,
            dueAt: input.dueAt,
          },
          // Pedido novo depois de um cancelamento: a linha é reescrita inteira,
          // e os instantes do pedido anterior são limpos para não deixarem
          // `cancelledAt` de uma exclusão que voltou a estar em vigor.
          update: {
            requestedByUserId: input.requestedByUserId,
            status: "SCHEDULED",
            requestedAt: input.requestedAt,
            dueAt: input.dueAt,
            cancelledAt: null,
            purgedAt: null,
          },
        }),
        prisma.aiSettings.upsert({
          where: { tenantId: input.tenantId },
          create: {
            tenantId: input.tenantId,
            enabled: false,
            activatedByRunId: null,
          },
          update: { enabled: false, activatedByRunId: null },
        }),
      ]);
      return deletion;
    },
    async cancel(tenantId, cancelledAt) {
      return prisma.accountDeletion.update({
        where: { tenantId },
        data: { status: "CANCELLED", cancelledAt },
      });
    },
  };
}

/**
 * As portas de efeito de produção.
 *
 * Nenhuma delas é código novo de integração: a projeção é a de
 * `ai-activation.ts`, a desconexão é a de `whatsapp/disconnect.ts` (a mesma que
 * `DELETE /v1/whatsapp` executa) e a derrubada do canal é a chamada interna
 * nova, que só existe porque não havia caminho para desligar o vínculo na IA.
 */
export function accountDeletionEffects(
  log: AccountDeletionLogger,
  clients: {
    ai?: Pick<
      AiOrchestratorClient,
      "updateTenantConfig" | "deactivateEvolutionChannel"
    >;
    evolution?: Pick<EvolutionClient, "logoutInstance" | "deleteInstance">;
  } = {},
): AccountDeletionEffects {
  const ai = clients.ai ?? new AiOrchestratorClient();
  const evolution = clients.evolution ?? new EvolutionClient();
  return {
    projectAiDesired: (context, enabled) =>
      projectAiDesiredState(context, { ai }, enabled, log),
    takeDownAiChannel: async (context) => {
      await ai.deactivateEvolutionChannel(context);
    },
    disconnectWhatsApp: async (tenant, requestId) =>
      (await disconnectWhatsApp(tenant, { evolution, requestId })).outcome,
  };
}

/**
 * A guarda de não-reativação **fora** da reconciliação (Goal025 §3).
 *
 * §3 fala de "nenhum caminho do produto", e `reconcileAiActivation` é citado
 * ali como "em particular", não como o escopo inteiro. A reconciliação já
 * força o desejado a `false` enquanto a exclusão corre, mas ela é um caminho
 * de convergência: ela não vê o `PATCH` que acabou de gravar
 * `AiSettings.enabled = true` e de projetar `enabled: true` na IA na mesma
 * requisição. Entre esse `PATCH` e a próxima reconciliação existe uma janela
 * com a IA de uma conta em exclusão **respondendo cliente** — o estado que o
 * início da exclusão desligou de propósito.
 *
 * A guarda mora aqui, e não escrita à mão dentro da rota, para que o próximo
 * caminho que queira ligar a IA tenha uma função para chamar em vez de uma
 * condição para lembrar de repetir. Hoje o único chamador que grava
 * `enabled: true` por pedido humano é `PATCH /v1/settings/ai`; os demais
 * (`syncAi`, onboarding, revínculo do WhatsApp) só **projetam** o que já está
 * gravado, e o que está gravado durante a exclusão é `false`.
 *
 * Recusa com o mesmo `409 CONFLICT` sem `details` que a rota já usa quando
 * falta serviço operacional para ativar: nenhuma rota existente ganha forma
 * nova nem código de erro novo (critério 33). Só ligar é recusado — trocar o
 * estilo de conversa com `enabled: false` continua passando, porque não
 * religa nada.
 */
export async function assertAiActivationNotBlockedByDeletion(
  tenantId: string,
  store: AccountDeletionStore = accountDeletionStore(),
): Promise<void> {
  if (!isDeletionPending(await store.find(tenantId))) return;
  throw new AppError(
    "CONFLICT",
    "The AI cannot be activated while this account is scheduled for deletion.",
    409,
  );
}
