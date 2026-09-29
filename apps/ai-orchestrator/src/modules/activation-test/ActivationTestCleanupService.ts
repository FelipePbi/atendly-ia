import {
  type DiagnosticLogger,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { AppError, toErrorMessage } from "../../lib/errors.js";
import type { SchedulingGateway } from "../scheduling-service/client.js";
import type { SchedulingRequestContext } from "../scheduling-service/types.js";
import {
  type ActivationTestCleanupResult,
  activationTestCleanupState,
  type ActivationTestCleanupTarget,
  type ActivationTestResidueItem,
  emptyRemovedCount,
} from "./activation-test-cleanup.js";
import type {
  ActivationTestRunRecord,
  ActivationTestRunRepository,
} from "./ActivationTestRunStore.js";

export interface ActivationTestCleanupDeps {
  runs: ActivationTestRunRepository;
  scheduling: Pick<
    SchedulingGateway,
    | "cancelAppointment"
    | "deleteAppointment"
    | "deleteCustomer"
    | "findFutureAppointmentsForCustomer"
    | "findFutureAppointmentsForPhone"
    | "findCustomerCandidatesByPhone"
  >;
  logger?: DiagnosticLogger;
  now?: () => Date;
}

export interface ActivationTestCleanupInput {
  tenantId: string;
  runId: string;
  userId: string;
  requestId: string;
}

/**
 * Remocao dos dados de teste (Goal019).
 *
 * Tres regras mandam neste arquivo, e as tres sao de produto:
 *
 * 1. **So por ID gravado.** Cada remocao recebe o ID que a execucao gravou no
 *    momento da criacao. Nao ha neste arquivo — nem no contrato que ele usa —
 *    nenhum caminho que selecione linha por telefone, nome, data ou padrao,
 *    entao uma linha preexistente parecida com dado de teste nao e alcancavel.
 * 2. **So o que esta execucao criou.** Conversa e contato sao removidos apenas
 *    quando `createdConversationId`/`createdContactId` dizem que eles nasceram
 *    aqui. Encontrar nao autoriza apagar.
 * 3. **Sobra e residuo, nunca silencio.** O que continuar existindo depois da
 *    remocao — inclusive o que o produto ainda nao sabe remover — e gravado na
 *    execucao com o ID e a razao. Nao existe caminho que produza `CLEAN` com
 *    sobra.
 *
 * Repetir a limpeza e no-op: as remocoes sao por ID fixo, entao a segunda
 * passada apaga zero linha, e nenhuma ausencia e tratada como erro.
 */
export class ActivationTestCleanupService {
  private readonly runs: ActivationTestRunRepository;
  private readonly scheduling: ActivationTestCleanupDeps["scheduling"];
  private readonly logger: DiagnosticLogger;
  private readonly now: () => Date;

  constructor(deps: ActivationTestCleanupDeps) {
    this.runs = deps.runs;
    this.scheduling = deps.scheduling;
    this.logger = deps.logger ?? noopDiagnosticLogger;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Limpa os dados de uma execucao.
   *
   * Devolve `null` quando a execucao nao existe para o tenant — ausencia e
   * resposta, nao erro: limpar o que nunca existiu nao tem o que relatar.
   */
  async clean(
    input: ActivationTestCleanupInput,
  ): Promise<ActivationTestCleanupResult | null> {
    const run = await this.runs.findRun(input.tenantId, input.runId);
    if (!run) return null;

    const context: SchedulingRequestContext = {
      tenantId: input.tenantId,
      userId: input.userId,
      requestId: input.requestId,
    };
    const residue: ActivationTestResidueItem[] = [];
    const removed = emptyRemovedCount();

    removed.MESSAGE = await this.removeMessages(run, residue);
    removed.CONVERSATION = await this.removeConversation(run, residue);
    removed.CONTACT = await this.removeContact(run, residue);
    // Ordem obrigatoria: o atendimento sai antes da pessoa. `Appointment`
    // aponta para `Customer` com `onDelete: Restrict`, entao remover a pessoa
    // primeiro seria recusado pelo banco — e a pessoa de teste ficaria na
    // lista de clientes do negocio, que e exatamente o residuo que §6 proibe
    // de virar permanente.
    const appointmentCancelled = await this.removeAppointment(
      run,
      context,
      residue,
    );
    await this.removeTestCustomer(run, context, residue);

    const state = activationTestCleanupState(residue);
    const cleanedAt = this.now();
    await this.runs.patchRun(run.tenantId, run.id, {
      cleanupState: state,
      cleanupAt: cleanedAt,
      cleanupResidue: residue,
    });

    if (residue.length > 0) {
      this.logger.warn(
        {
          tenantId: run.tenantId,
          runId: run.id,
          residue: residue.map((item) => `${item.target}:${item.reason}`),
        },
        "Activation test cleanup left residue",
      );
    }

    return {
      runId: run.id,
      state,
      cleanedAt,
      residue,
      removed,
      appointmentCancelled,
    };
  }

  /**
   * Mensagens da conversa de teste, pelos IDs que a execucao acumulou.
   *
   * A lista nao e apagada da execucao depois: ela e o registro auditavel do
   * que foi criado, e e o que faz a segunda passada remover zero em vez de
   * procurar de novo.
   */
  private async removeMessages(
    run: ActivationTestRunRecord,
    residue: ActivationTestResidueItem[],
  ): Promise<number> {
    if (run.createdMessageIds.length === 0) return 0;
    const count = await this.guard(
      () =>
        this.runs.removeCreatedMessages(run.tenantId, run.createdMessageIds),
      run.createdMessageIds.map((id) => ({ target: "MESSAGE" as const, id })),
      residue,
    );
    if (count === null) return 0;

    const surviving = await this.runs.findSurvivingMessageIds(
      run.tenantId,
      run.createdMessageIds,
    );
    for (const id of surviving) {
      residue.push({ target: "MESSAGE", id, reason: "STILL_VISIBLE" });
    }
    return count;
  }

  private async removeConversation(
    run: ActivationTestRunRecord,
    residue: ActivationTestResidueItem[],
  ): Promise<number> {
    // Conversa que a execucao apenas encontrou nao e dela para apagar.
    const conversationId = run.createdConversationId;
    if (!conversationId) return 0;

    // Apagar a conversa cascateia para tudo que aponta para ela. Se sobrou
    // mensagem ou sessao que a execucao nao criou, apagar seria remover linha
    // de terceiro — entao a conversa fica, e fica registrada.
    if (await this.hasOtherRows(run, conversationId, residue, "CONVERSATION")) {
      return 0;
    }

    const count = await this.guard(
      () => this.runs.removeCreatedConversation(run.tenantId, conversationId),
      [{ target: "CONVERSATION", id: conversationId }],
      residue,
    );
    if (count === null) return 0;
    if (await this.runs.conversationExists(run.tenantId, conversationId)) {
      residue.push({
        target: "CONVERSATION",
        id: conversationId,
        reason: "STILL_VISIBLE",
      });
    }
    return count;
  }

  private async removeContact(
    run: ActivationTestRunRecord,
    residue: ActivationTestResidueItem[],
  ): Promise<number> {
    const contactId = run.createdContactId;
    if (!contactId) return 0;

    if (await this.hasOtherRows(run, contactId, residue, "CONTACT")) return 0;

    const count = await this.guard(
      () => this.runs.removeCreatedContact(run.tenantId, contactId),
      [{ target: "CONTACT", id: contactId }],
      residue,
    );
    if (count === null) return 0;
    if (await this.runs.contactExists(run.tenantId, contactId)) {
      residue.push({
        target: "CONTACT",
        id: contactId,
        reason: "STILL_VISIBLE",
      });
    }
    return count;
  }

  /**
   * Sobrou dependente que a execucao nao criou?
   *
   * `Message` e `ConversationSession` apontam para `Conversation` — e
   * `ConversationSession` tambem para `Contact` — com `onDelete: Cascade`.
   * Como as mensagens da execucao ja sairam antes desta pergunta, qualquer
   * dependente que ainda esteja de pe e de outra origem, e apagar arrastaria
   * essa linha junto. A limpeza recusa: manter o dado de teste e relatar o
   * residuo e menos grave do que remover o dado de outra pessoa.
   *
   * Nao conseguir contar tambem impede a remocao: sem a contagem, a limpeza
   * nao sabe o que apagaria.
   */
  private async hasOtherRows(
    run: ActivationTestRunRecord,
    id: string,
    residue: ActivationTestResidueItem[],
    target: "CONVERSATION" | "CONTACT",
  ): Promise<boolean> {
    let dependents: number;
    try {
      dependents =
        target === "CONVERSATION"
          ? await this.runs.conversationDependents(run.tenantId, id)
          : await this.runs.contactDependents(run.tenantId, id);
    } catch (error) {
      residue.push({
        target,
        id,
        reason: "REMOVAL_FAILED",
        detail: `nao foi possivel conferir o que a remocao levaria junto: ${toErrorMessage(error)}`,
      });
      return true;
    }
    if (dependents === 0) return false;
    residue.push({ target, id, reason: "WOULD_TOUCH_OTHER_ROWS" });
    return true;
  }

  /**
   * Agendamento de teste: cancelado, **removido pelo ID gravado** e depois
   * conferido no read model da agenda.
   *
   * O vault e literal — "agendamento de teste e removido", "cliente de teste e
   * removido" —, e cancelar nao e remover: um atendimento cancelado continua
   * listado na agenda do negocio. Por isso os dois passos existem e nesta
   * ordem: o cancelamento libera o horario e deixa o evento de cancelamento
   * gravado, e a remocao definitiva tira a linha da agenda.
   *
   * As duas operacoes recebem **so o ID que a execucao gravou**. Se a remocao
   * nao for possivel, o cancelamento ja aconteceu e o que sobrou vira residuo
   * nomeado — nunca silencio, e nunca `CLEAN` com sobra.
   *
   * Repetir e no-op: cancelar de novo tem a propria execucao como chave de
   * idempotencia, e remover de novo devolve `removed: false`.
   */
  private async removeAppointment(
    run: ActivationTestRunRecord,
    context: SchedulingRequestContext,
    residue: ActivationTestResidueItem[],
  ): Promise<boolean> {
    const appointmentId = run.appointmentId;
    if (!appointmentId) return false;

    try {
      // Isencao da politica de antecedencia minima do cliente (Goal073): a
      // limpeza precisa cancelar o atendimento de teste mesmo quando ele foi
      // criado a poucos minutos, sem esperar prazo nenhum.
      await this.scheduling.cancelAppointment(
        appointmentId,
        context,
        `activation-test-cleanup-${run.id}`,
        "ACTIVATION_TEST_CLEANUP",
      );
    } catch (error) {
      if (isGone(error)) {
        // Ja nao existe do outro lado: nao ha residuo e nao ha o que cancelar.
        return false;
      }
      residue.push({
        target: "APPOINTMENT",
        id: appointmentId,
        reason: "REMOVAL_FAILED",
        detail: toErrorMessage(error),
      });
      return false;
    }

    try {
      await this.scheduling.deleteAppointment(appointmentId, context);
    } catch (error) {
      if (!isGone(error)) {
        residue.push({
          target: "APPOINTMENT",
          id: appointmentId,
          reason: "REMOVAL_FAILED",
          detail: toErrorMessage(error),
        });
        return true;
      }
    }

    const visible = await this.appointmentStillInAgenda(
      run,
      appointmentId,
      context,
      residue,
    );
    if (visible) {
      residue.push({
        target: "APPOINTMENT",
        id: appointmentId,
        reason: "STILL_VISIBLE",
        detail:
          "o atendimento de teste foi removido, mas continua listado na agenda do negocio",
      });
    }
    return true;
  }

  /** Leitura da agenda: o read model e quem diz se o dado saiu, nao a escrita. */
  private async appointmentStillInAgenda(
    run: ActivationTestRunRecord,
    appointmentId: string,
    context: SchedulingRequestContext,
    residue: ActivationTestResidueItem[],
  ): Promise<boolean> {
    try {
      const businessContext = await this.runs.businessContext(run.tenantId);
      const agenda = run.customerId
        ? await this.scheduling.findFutureAppointmentsForCustomer(
            run.customerId,
            businessContext,
            context,
          )
        : await this.scheduling.findFutureAppointmentsForPhone(
            run.platformNumber,
            businessContext,
            context,
          );
      return agenda.some((appointment) => appointment.id === appointmentId);
    } catch (error) {
      // Nao conseguir conferir nao e o mesmo que conferir e nao achar: sem a
      // leitura, a limpeza nao pode afirmar que o dado saiu da agenda.
      residue.push({
        target: "APPOINTMENT",
        id: appointmentId,
        reason: "REMOVAL_FAILED",
        detail: `nao foi possivel conferir a agenda: ${toErrorMessage(error)}`,
      });
      return false;
    }
  }

  /**
   * Pessoa de teste: removida pelo ID gravado e conferida na lista de
   * clientes do negocio.
   *
   * A pessoa de teste e sempre **criada por esta execucao** — o atendimento e
   * criado sem `customerId`, e sem ele a agenda cadastra pessoa nova, nunca
   * reaproveita alguem por telefone (D-005). Por isso o ID gravado em
   * `customerId` e seguro de remover: ele nao pode apontar para pessoa que ja
   * existia.
   *
   * A busca por telefone que aparece aqui e **leitura de prova**, nunca
   * selecao para remocao: o que autoriza a remocao e a igualdade com o ID que
   * a execucao gravou.
   */
  private async removeTestCustomer(
    run: ActivationTestRunRecord,
    context: SchedulingRequestContext,
    residue: ActivationTestResidueItem[],
  ): Promise<void> {
    const customerId = run.customerId;
    if (!customerId) return;

    try {
      await this.scheduling.deleteCustomer(customerId, context);
    } catch (error) {
      if (!isGone(error)) {
        residue.push({
          target: "CUSTOMER",
          id: customerId,
          reason: "REMOVAL_FAILED",
          detail: toErrorMessage(error),
        });
        return;
      }
    }

    try {
      const candidates = await this.scheduling.findCustomerCandidatesByPhone(
        run.platformNumber,
        context,
      );
      if (!candidates.some((candidate) => candidate.id === customerId)) return;
    } catch (error) {
      residue.push({
        target: "CUSTOMER",
        id: customerId,
        reason: "REMOVAL_FAILED",
        detail: `nao foi possivel conferir a lista de clientes: ${toErrorMessage(error)}`,
      });
      return;
    }
    residue.push({
      target: "CUSTOMER",
      id: customerId,
      reason: "STILL_VISIBLE",
      detail:
        "a pessoa de teste foi removida, mas continua na lista de clientes do negocio",
    });
  }

  /**
   * Executa uma remocao e transforma falha em residuo.
   *
   * Uma remocao que quebrou nao interrompe as outras e nao vira `500`: o que
   * ficou e informacao para a tela, e o resto da limpeza continua.
   */
  private async guard(
    remove: () => Promise<number>,
    targets: readonly { target: ActivationTestCleanupTarget; id: string }[],
    residue: ActivationTestResidueItem[],
  ): Promise<number | null> {
    try {
      return await remove();
    } catch (error) {
      const detail = toErrorMessage(error);
      for (const item of targets) {
        residue.push({ ...item, reason: "REMOVAL_FAILED", detail });
      }
      return null;
    }
  }
}

/** Ja nao existe do outro lado: remover de novo nao tem o que fazer. */
function isGone(error: unknown): boolean {
  return error instanceof AppError && error.statusCode === 404;
}
