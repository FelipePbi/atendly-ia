import type { FastifyRequest } from "fastify";

import type { AiOrchestratorClient } from "../clients/ai-orchestrator/index.js";
import type { InternalRequestContext } from "../clients/internal-http-client.js";
import type { SchedulingClient } from "../clients/scheduling/index.js";
import { isDeletionPending } from "../modules/account/state.js";
import { internalContext } from "../modules/tenant/context.js";
import { resolveAiConversationStyle } from "./ai-conversation-style.js";
import { businessContextPayload } from "./business-profile.js";
import { toErrorMessage } from "./errors.js";
import { getPrisma } from "./prisma.js";
import { currentTenantContext } from "./tenant-context.js";

/**
 * O que a reconciliação fez nesta requisição.
 *
 * Conjunto fechado e legível: quem lê o status precisa saber se houve efeito e
 * qual, e "nada a fazer" é resposta, não ausência de resposta.
 */
export type AiActivationOutcome =
  /** Nada divergia: o desejado e o efetivo já concordavam. */
  | "NOOP"
  /** Execução bem-sucedida ligou a IA agora. */
  | "ACTIVATED"
  /** A execução que autorizou a ativação deixou de valer: a IA foi desligada. */
  | "DEACTIVATED_BY_CHANNEL_CHANGE"
  /** O desejado já estava gravado; só a projeção na IA foi reaplicada. */
  | "CONVERGED"
  /** Havia divergência e a tentativa de convergir não deu certo. */
  | "FAILED"
  /** Faltou leitura para decidir: nada foi mudado. */
  | "UNKNOWN";

export interface AiActivationDeps {
  ai: Pick<
    AiOrchestratorClient,
    "getActivationTest" | "getAiTenantConfig" | "updateTenantConfig"
  >;
  scheduling: Pick<SchedulingClient, "calendar">;
}

export type ActivationTestRun = NonNullable<
  Awaited<ReturnType<AiOrchestratorClient["getActivationTest"]>>
>;

/**
 * A prova válida, e só uma (Goal063/WU-01, critério 8).
 *
 * `SUCCEEDED` que não foi superada por troca de canal — a mesma checagem que
 * já decidia a autoativação abaixo e o quarto item do checklist da Home
 * (`activationTestCompleted`). Nenhum outro lugar do produto define "prova
 * válida" com regra própria.
 */
export async function getValidActivationRun(
  context: InternalRequestContext,
  ai: Pick<AiOrchestratorClient, "getActivationTest">,
): Promise<ActivationTestRun | null> {
  const run = await ai.getActivationTest(context);
  return run?.state === "SUCCEEDED" && !run.supersededByChannelChange
    ? run
    : null;
}

/**
 * Quarto item do checklist pós-onboarding: "teste concluído" (Goal019 §9).
 *
 * `true` **só** com execução em `SUCCEEDED` que ainda vale — teste feito
 * contra um vínculo de WhatsApp que já não é o do negócio não conta, porque o
 * vault exige teste novo ao trocar/revincular. Sem execução é `false`, que é
 * "nunca testou", não "falhou": o produtor não fabrica conclusão nenhuma.
 */
export async function activationTestCompleted(
  context: InternalRequestContext,
  ai: Pick<AiOrchestratorClient, "getActivationTest">,
): Promise<boolean> {
  return (await getValidActivationRun(context, ai)) !== null;
}

/**
 * Reconciliação desired/effective da IA, prevista em D-010 (Goal019 §7).
 *
 * O BFF é dono do desejado e a IA informa o efetivo. Até aqui a divergência
 * entre os dois só era **relatada** como `PENDING`; a partir daqui o BFF
 * tenta convergir. Quatro propriedades sustentam isso, e nenhuma é opcional:
 *
 * 1. **Limitada.** No máximo uma tentativa de convergência por requisição.
 *    Não há laço, não há retentativa interna e não há processo de fundo — a
 *    continuidade vem da próxima requisição, não de um job novo.
 * 2. **Idempotente.** Ativar a partir da mesma execução bem-sucedida duas
 *    vezes não gera duas ativações: a execução consumida fica gravada em
 *    `AiSettings.activatedByRunId`, e a segunda passada reconhece.
 * 3. **Nunca lança.** Toda falha vira `FAILED` com log; leitura não pode
 *    virar `500` por causa de um efeito que ela tentou de favor.
 * 4. **Honesta.** Nenhum caminho aqui grava `enabled: true` sem a regra
 *    vigente de ativação (ao menos um serviço operacional) ter sido conferida
 *    nesta mesma passada. Este Goal **acrescenta** a exigência do teste; ele
 *    não substitui nem contorna a que já existia.
 * 5. **Não ressuscita conta em exclusão.** Com `AccountDeletion` `SCHEDULED`,
 *    o desejado é `false` e a autoativação não roda (Goal025/WU-04). Negócio
 *    sem exclusão agendada não sente nada disso: o comportamento é o mesmo,
 *    linha por linha.
 */
export async function reconcileAiActivation(
  request: FastifyRequest,
  deps: AiActivationDeps,
): Promise<AiActivationOutcome> {
  try {
    return await reconcile(request, deps);
  } catch (error) {
    request.log.warn(
      { err: toErrorMessage(error), tenantId: currentTenantContext(request).tenantId },
      "AI activation reconciliation failed; desired/effective stays as read.",
    );
    return "FAILED";
  }
}

async function reconcile(
  request: FastifyRequest,
  deps: AiActivationDeps,
): Promise<AiActivationOutcome> {
  const tenant = currentTenantContext(request);
  const context = internalContext(request);
  const prisma = getPrisma();

  const settings = await prisma.aiSettings.findUnique({
    where: { tenantId: tenant.tenantId },
  });
  // A guarda de não-reativação (Goal025/WU-04). Está **aqui**, no caminho
  // comum, e não em `GET /v1/status` ou em qualquer outro chamador: a
  // reconciliação roda em toda requisição que a invoca, e uma guarda por
  // chamador seria uma guarda que o próximo chamador esquece.
  //
  // Enquanto a exclusão está `SCHEDULED`, o desejado do negócio deixa de ser
  // lido de `AiSettings` e passa a ser `false` — não basta pular a
  // autoativação. O início da exclusão desliga o desejado na mesma transação
  // em que grava (WU-02), mas a **projeção** daquele momento é tolerante a
  // falha: se a IA estava fora do ar, o efetivo ficou `true`. Forçar o
  // desejado a `false` aqui é o que faz a próxima requisição desligar de
  // verdade, em vez de reprojetar um `true` que ninguém mais quer.
  const deletionPending = isDeletionPending(
    await prisma.accountDeletion.findUnique({
      where: { tenantId: tenant.tenantId },
    }),
  );
  const run = await deps.ai.getActivationTest(context);

  // A execução que autorizou a ativação deixou de valer: trocar ou revincular
  // o WhatsApp exige teste novo (vault, §"Quando repetir o teste"). A IA
  // volta a ficar desligada, porque a prova que a ligou já não existe.
  if (
    settings?.enabled &&
    settings.activatedByRunId &&
    run &&
    run.id === settings.activatedByRunId &&
    run.supersededByChannelChange
  ) {
    await prisma.aiSettings.update({
      where: { tenantId: tenant.tenantId },
      data: { enabled: false, activatedByRunId: null },
    });
    await project(request, deps, false);
    return "DEACTIVATED_BY_CHANNEL_CHANGE";
  }

  // Autoativação: **só** execução bem-sucedida, e só uma vez por execução —
  // e nunca com exclusão em vigor, por mais bem-sucedida que a execução seja.
  if (
    !deletionPending &&
    !settings?.enabled &&
    run?.state === "SUCCEEDED" &&
    !run.supersededByChannelChange &&
    settings?.activatedByRunId !== run.id
  ) {
    // A regra vigente continua valendo, inteira: sem serviço operacional a IA
    // não é ativada nem por teste bem-sucedido.
    const calendar = await deps.scheduling.calendar(context);
    if (!calendar.capabilities.aiActivationReady) return "NOOP";

    await prisma.aiSettings.upsert({
      where: { tenantId: tenant.tenantId },
      create: {
        tenantId: tenant.tenantId,
        enabled: true,
        activatedByRunId: run.id,
      },
      update: { enabled: true, activatedByRunId: run.id },
    });
    return (await project(request, deps, true)) ? "ACTIVATED" : "FAILED";
  }

  // Convergência do que já está decidido: o desejado é o do BFF, e a IA
  // precisa refleti-lo. Uma tentativa, e só quando há divergência de fato.
  const effective = await deps.ai.getAiTenantConfig(context);
  const desired = deletionPending ? false : Boolean(settings?.enabled);
  if (effective === null) {
    // Tenant nunca projetado. Projetar o desejado é convergir, não inventar.
    return (await project(request, deps, desired)) ? "CONVERGED" : "FAILED";
  }
  if (effective.enabled === desired) return "NOOP";
  return (await project(request, deps, desired)) ? "CONVERGED" : "FAILED";
}

/**
 * Projeta o desejado na IA. Uma tentativa, sem retentativa.
 *
 * Devolve `false` em vez de lançar: quem chamou está no meio de uma leitura, e
 * a leitura continua respondendo o estado real — que agora inclui a falha.
 */
async function project(
  request: FastifyRequest,
  deps: AiActivationDeps,
  enabled: boolean,
): Promise<boolean> {
  return projectAiDesiredState(internalContext(request), deps, enabled, {
    warn: (payload, message) => request.log.warn(payload, message),
  });
}

/** O mínimo de cliente que a projeção do desejado precisa. */
export interface AiProjectionDeps {
  ai: Pick<AiOrchestratorClient, "updateTenantConfig">;
}

/** O mínimo de log que a projeção precisa; existe para não arrastar a request. */
export interface AiProjectionLogger {
  warn(payload: Record<string, unknown>, message: string): void;
}

/**
 * A projeção do desejado, sem depender da requisição (Goal025/WU-02).
 *
 * `project` acima delega para cá e nada mudou para ele. O que muda é que o
 * início da exclusão de conta — que roda fora da reconciliação e precisa
 * projetar `enabled: false` — chama **esta** função em vez de montar um
 * `updateTenantConfig` próprio. Uma cópia ali significaria dois lugares
 * decidindo o que é "o desejado do negócio": este lê `AiSettings.tone` e o
 * `BusinessProfile` como sempre leu.
 *
 * Continua sem lançar. Para a exclusão isso é o ponto: a IA fora do ar não
 * pode impedir o dono de pedir a exclusão da própria conta, e o desejado já
 * está gravado no BFF de qualquer forma.
 */
export async function projectAiDesiredState(
  context: InternalRequestContext,
  deps: AiProjectionDeps,
  enabled: boolean,
  log: AiProjectionLogger,
): Promise<boolean> {
  const prisma = getPrisma();
  const [settings, profile] = await Promise.all([
    prisma.aiSettings.findUnique({ where: { tenantId: context.tenantId } }),
    prisma.businessProfile.upsert({
      where: { tenantId: context.tenantId },
      create: { tenantId: context.tenantId },
      update: {},
    }),
  ]);
  try {
    await deps.ai.updateTenantConfig(context, {
      enabled,
      tone: resolveAiConversationStyle(settings?.tone),
      businessContext: businessContextPayload(profile),
    });
    return true;
  } catch (error) {
    log.warn(
      { err: toErrorMessage(error), tenantId: context.tenantId },
      "AI tenant config projection failed during reconciliation.",
    );
    return false;
  }
}
