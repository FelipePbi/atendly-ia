import {
  type PlatformWhatsAppConfig,
  requirePlatformWhatsAppConfig,
} from "../../config/platform-whatsapp.js";
import {
  type DiagnosticLogger,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import {
  AppError,
  InfrastructureError,
  toErrorMessage,
} from "../../lib/errors.js";
import { normalizePhone } from "../../lib/phone.js";
import type { PlatformWhatsAppSender } from "../channel/platform/PlatformWhatsAppSender.js";
import type { SchedulingGateway } from "../scheduling-service/client.js";
import type {
  SchedulingRequestContext,
  SchedulingServiceDefinition,
} from "../scheduling-service/types.js";
import type { ActivationTestCleanupResult } from "./activation-test-cleanup.js";
import {
  ACTIVATION_TEST_ABANDONED,
  ACTIVATION_TEST_MAX_ATTEMPTS,
  ACTIVATION_TEST_REFUSALS,
  ACTIVATION_TEST_STALE_AFTER_MS,
  ACTIVATION_TEST_STEP_FAILED,
  ACTIVATION_TEST_STEP_LABELS,
  ACTIVATION_TEST_STEPS,
  type ActivationTestFact,
  type ActivationTestMilestoneName,
  activationTestRefusal,
  type ActivationTestStep,
  isAbandonedActivationTestRun,
} from "./activation-test-run.js";
import {
  ACTIVATION_TEST_TOOL_NAMES,
  type ActivationTestAiPort,
  type ActivationTestAiToolCall,
  type ActivationTestAiTurn,
  appointmentIdFromToolCall,
} from "./ActivationTestAiDriver.js";
import { ActivationTestCleanupService } from "./ActivationTestCleanupService.js";
import {
  type ActivationTestAiReply,
  type ActivationTestChannel,
  type ActivationTestRunRecord,
  type ActivationTestRunRepository,
} from "./ActivationTestRunStore.js";

/** Aviso separado, antes de qualquer demonstracao: a conversa e de teste. */
export const ACTIVATION_TEST_NOTICE =
  "Esta e uma conversa de teste da Atendly. Voce so precisa observar: a IA vai " +
  "conversar sozinha com um cliente simulado e marcar um atendimento de teste, " +
  "que e removido no final.";

/**
 * Quem pediu e em nome de quem.
 *
 * Toda entrada deste servico carrega os tres: a limpeza e a reconciliacao
 * falam com a agenda, e a agenda exige contexto de tenant, usuario e
 * requisicao — nao ha caminho aqui que fale com ela sem dono.
 */
export interface ActivationTestContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

export interface ActivationTestStartInput extends ActivationTestContext {
  /** Numero do WhatsApp do negocio, projetado por quem pediu o teste. */
  tenantPhone: string;
}

export interface ActivationTestServiceDeps {
  runs: ActivationTestRunRepository;
  scheduling: Pick<
    SchedulingGateway,
    | "listActiveServices"
    | "findService"
    | "getAvailableSlotsForServices"
    | "createAppointment"
    | "cancelAppointment"
    | "deleteAppointment"
    | "deleteCustomer"
    | "findFutureAppointmentsForCustomer"
    | "findFutureAppointmentsForPhone"
    | "findCustomerCandidatesByPhone"
  >;
  sender: Pick<PlatformWhatsAppSender, "sendToTenantUnderTest">;
  /**
   * A IA que o teste exercita.
   *
   * Obrigatoria: nao existe execucao do teste real sem IA do outro lado. Se
   * esta porta pudesse ser omitida, o servico voltaria a poder compor sozinho
   * a "resposta da IA" — que e exatamente o que o teste nao pode fazer.
   */
  ai: ActivationTestAiPort;
  /**
   * Remocao dos dados de teste. Injetavel so para teste; por padrao a execucao
   * monta a limpeza com as mesmas dependencias que ela ja usa — nao existe
   * caminho de execucao sem limpeza.
   */
  cleanup?: Pick<ActivationTestCleanupService, "clean">;
  logger?: DiagnosticLogger;
  /** Configuracao da plataforma. Injetavel so para teste; producao le do env. */
  platformConfig?: () => PlatformWhatsAppConfig;
  now?: () => Date;
  /** Espera entre tentativas. Zero nos testes; backoff curto em producao. */
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Silencio a partir do qual uma execucao `RUNNING` e dada por abandonada.
   * Injetavel so para teste; producao usa o limite declarado no dominio.
   */
  staleAfterMs?: number;
}

interface StepOutcome {
  run: ActivationTestRunRecord;
  failed: boolean;
}

/**
 * Maquina de estados da execucao do teste real (Goal019).
 *
 * Tres regras mandam neste arquivo, e as tres sao de produto, nao de estilo:
 *
 * 1. **Nenhum marco sem fato.** Cada passo que produz marco grava primeiro o
 *    fato (mensagem, servico lido, disponibilidade consultada, agendamento
 *    criado) e so entao grava o marco apontando para ele. Nao ha caminho que
 *    marque progresso por tempo decorrido.
 * 2. **Uma execucao viva por tenant.** Quem decide a corrida e o indice unico
 *    parcial no banco; aqui a corrida perdida vira recusa nomeada.
 * 3. **Recusar e resultado, nao erro.** Toda recusa de inicio tem codigo
 *    proprio e status 409 (ou 503 para a configuracao ausente da plataforma);
 *    falhar a execucao termina a execucao, nunca a requisicao com 500.
 */
export class ActivationTestService {
  private readonly runs: ActivationTestRunRepository;
  private readonly scheduling: ActivationTestServiceDeps["scheduling"];
  private readonly sender: ActivationTestServiceDeps["sender"];
  private readonly logger: DiagnosticLogger;
  private readonly platformConfig: () => PlatformWhatsAppConfig;
  private readonly now: () => Date;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cleanup: Pick<ActivationTestCleanupService, "clean">;
  private readonly staleAfterMs: number;
  private readonly ai: ActivationTestAiPort;

  constructor(deps: ActivationTestServiceDeps) {
    this.runs = deps.runs;
    this.scheduling = deps.scheduling;
    this.sender = deps.sender;
    this.ai = deps.ai;
    this.cleanup =
      deps.cleanup ??
      new ActivationTestCleanupService({
        runs: deps.runs,
        scheduling: deps.scheduling,
        logger: deps.logger,
        now: deps.now,
      });
    this.logger = deps.logger ?? noopDiagnosticLogger;
    this.platformConfig = deps.platformConfig ?? requirePlatformWhatsAppConfig;
    this.now = deps.now ?? (() => new Date());
    this.retryDelayMs = deps.retryDelayMs ?? 1_000;
    this.staleAfterMs = deps.staleAfterMs ?? ACTIVATION_TEST_STALE_AFTER_MS;
    this.sleep =
      deps.sleep ??
      ((ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        }));
  }

  /**
   * Execucao corrente do tenant (viva ou a ultima terminada).
   *
   * `null` significa "nunca testou" — nao "falhou". A ausencia e informacao, e
   * nenhuma linha e fabricada para preencher a tela.
   *
   * A leitura reconcilia execucao abandonada antes de responder: e o unico
   * jeito de o produto se recuperar sem job, cron nem agendador — exatamente a
   * reconciliacao idempotente em requisicao que este Goal autoriza.
   */
  async current(
    input: ActivationTestContext,
  ): Promise<ActivationTestRunRecord | null> {
    const live = await this.reconcileAbandoned(
      await this.runs.findLiveRun(input.tenantId),
      input,
    );
    return live ?? (await this.runs.latestRun(input.tenantId));
  }

  /**
   * Execucao `RUNNING` que ninguem esta mais tocando vira falha declarada.
   *
   * Sem isto, um restart do processo no meio de um teste deixa a linha viva
   * para sempre: `findLiveRun` continua achando, o indice unico parcial recusa
   * a proxima e `restart()` responde `ALREADY_RUNNING` — o tenant fica travado
   * sem nenhuma forma de sair pelo produto.
   *
   * Tres propriedades sustentam isto e nenhuma e opcional:
   *
   * 1. **Limitada.** No maximo uma execucao e reconciliada por chamada, e ela
   *    ja estava terminada quando a proxima chamada chegar — nao ha laco.
   * 2. **Idempotente.** `finishRun` grava `finishedAt`, entao a execucao sai
   *    de `findLiveRun` e a segunda passada nao tem o que reconciliar.
   * 3. **Honesta.** A execucao termina `FAILED` com codigo proprio e o passo
   *    onde parou preservado; ela **nao** vira sucesso e por isso nao ativa a
   *    IA por nenhum caminho.
   *
   * Os dados de teste que ela alcancou a criar sao limpos aqui tambem: uma
   * execucao abandonada deixa exatamente o mesmo rastro que uma que falhou.
   */
  private async reconcileAbandoned(
    live: ActivationTestRunRecord | null,
    input: ActivationTestContext,
  ): Promise<ActivationTestRunRecord | null> {
    if (
      !live ||
      !isAbandonedActivationTestRun(live, this.now(), this.staleAfterMs)
    ) {
      return live;
    }
    const step = live.currentStep;
    this.logger.warn(
      {
        tenantId: live.tenantId,
        runId: live.id,
        step,
        idleSinceMs: this.now().getTime() - live.updatedAt.getTime(),
      },
      "Activation test run was abandoned and is being failed",
    );
    const failed = await this.runs.finishRun(
      input.tenantId,
      live.id,
      "FAILED",
      {
        failedStep: step,
        failureCode: ACTIVATION_TEST_ABANDONED,
        failureReason: step
          ? ACTIVATION_TEST_STEP_LABELS[step]
          : "iniciar o teste",
        lastError:
          "a execucao parou de dar sinal de vida e foi encerrada como falha",
        lastErrorAt: this.now(),
      },
    );
    await this.cleanUpAfter(input, failed);
    // `null` e a resposta certa: depois daqui nao existe mais execucao viva.
    // Quem lia o estado corrente cai na ultima terminada — que e justamente
    // esta — e quem ia recusar por `ALREADY_RUNNING` pode seguir.
    return null;
  }

  async milestones(tenantId: string, runId: string) {
    return this.runs.listMilestones(tenantId, runId);
  }

  /**
   * Vinculo de WhatsApp ativo do tenant, ou `null`.
   *
   * O consumidor compara isto com o que a execucao gravou: teste feito contra
   * um vinculo que nao e mais o do negocio nao vale como teste. O vault e
   * explicito — "novo teste e necessario ao vincular novamente/trocar o
   * WhatsApp" —, e derivar isso da comparacao e melhor do que gravar um
   * booleano que alguem pode esquecer de virar na troca.
   */
  async activeChannel(tenantId: string): Promise<ActivationTestChannel | null> {
    return this.runs.findActiveChannel(tenantId);
  }

  /**
   * Inicia o teste real.
   *
   * As pre-condicoes sao verificadas **antes** de criar qualquer linha: sem
   * numero da plataforma, sem WhatsApp conectado, sem servico apto ou sem
   * disponibilidade valida nao nasce execucao nenhuma — em vez de comecar um
   * teste que ja sabe que vai falhar.
   */
  async start(
    input: ActivationTestStartInput,
  ): Promise<ActivationTestRunRecord> {
    // Sem o numero oficial configurado o teste real nao existe neste ambiente:
    // a recusa tem codigo proprio (`PLATFORM_NUMBER_NOT_CONFIGURED`) e nao cai
    // na demonstracao nem simula progresso.
    const platform = this.platformConfig();

    // Execucao abandonada nao segura o tenant: ela e encerrada como falha
    // aqui, antes da recusa, senao `ALREADY_RUNNING` seria permanente.
    const live = await this.reconcileAbandoned(
      await this.runs.findLiveRun(input.tenantId),
      input,
    );
    if (live) {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
        "There is already a live activation test for this tenant.",
        { runId: live.id, state: live.state },
      );
    }

    const channel = await this.runs.findActiveChannel(input.tenantId);
    if (!channel) {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.WHATSAPP_NOT_CONNECTED,
        "The activation test requires a connected WhatsApp channel.",
      );
    }

    const tenantPhone = normalizePhone(input.tenantPhone ?? "");
    if (!tenantPhone || tenantPhone === platform.number) {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.TENANT_PHONE_UNKNOWN,
        "The activation test requires the business WhatsApp number.",
      );
    }

    const context = schedulingContext(input);
    const services = await this.scheduling.listActiveServices(context);
    const service = selectTestService(services);
    if (!service) {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.NO_ELIGIBLE_SERVICE,
        "The activation test requires at least one service open to scheduling.",
      );
    }

    // Disponibilidade e pre-condicao, nao descoberta no meio do caminho.
    const businessContext = await this.runs.businessContext(input.tenantId);
    const slots = await this.scheduling.getAvailableSlotsForServices(
      [service.id],
      undefined,
      businessContext,
      context,
    );
    if (slots.length === 0) {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.NO_AVAILABILITY,
        "The activation test requires the schedule to offer at least one slot.",
        { serviceId: service.id },
      );
    }

    const run = await this.runs.createRun({
      tenantId: input.tenantId,
      channelId: channel.id,
      channelInstanceId: channel.externalInstanceId,
      tenantPhone,
      platformNumber: platform.number,
      maxAttempts: ACTIVATION_TEST_MAX_ATTEMPTS,
      serviceId: service.id,
      serviceName: service.name,
    });

    // A conversa de teste nasce junto com a execucao e os dois IDs sao
    // gravados agora, no momento da criacao: e por eles que a limpeza remove
    // depois, nunca por busca por telefone, nome ou data.
    const conversation = await this.runs.openTestConversation({
      tenantId: input.tenantId,
      channelId: channel.id,
      platformNumber: platform.number,
    });
    return this.runs.patchRun(input.tenantId, run.id, {
      conversationId: conversation.conversationId,
      contactId: conversation.contactId,
      // Separado de proposito: `conversationId`/`contactId` sao o alvo por
      // onde a execucao conversa e podem apontar para linha que ja existia.
      // So estes dois autorizam a limpeza a apagar.
      createdConversationId: conversation.createdConversation
        ? conversation.conversationId
        : null,
      createdContactId: conversation.createdContact
        ? conversation.contactId
        : null,
    });
  }

  /**
   * Reinicia depois de interferencia humana.
   *
   * A execucao pausada e **descartada**, nao marcada como falha: ninguem
   * falhou, a pessoa respondeu. Execucao em andamento nao e reiniciada por
   * este caminho — seria a forma de criar a segunda execucao viva por engano.
   */
  async restart(
    input: ActivationTestStartInput,
  ): Promise<ActivationTestRunRecord> {
    const live = await this.reconcileAbandoned(
      await this.runs.findLiveRun(input.tenantId),
      input,
    );
    if (live && live.state === "RUNNING") {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.ALREADY_RUNNING,
        "The activation test is still running; it cannot be restarted.",
        { runId: live.id },
      );
    }
    if (live) {
      await this.runs.finishRun(input.tenantId, live.id, "DISCARDED");
    }
    return this.start(input);
  }

  /**
   * Executa a execucao ate estado terminal, pausa ou falha.
   *
   * Nao depende de tela nenhuma: quem chama e o servidor, e reentrar continua
   * do passo seguinte ao ultimo concluido. Executar uma execucao que nao esta
   * em andamento e no-op — pausada e terminal ficam como estao.
   */
  async execute(input: {
    tenantId: string;
    runId: string;
    userId: string;
    requestId: string;
  }): Promise<ActivationTestRunRecord | null> {
    let run = await this.runs.findRun(input.tenantId, input.runId);
    if (!run || run.state !== "RUNNING") return run;

    const context = schedulingContext(input);
    for (const step of remainingSteps(run)) {
      const paused = await this.pauseIfHumanReplied(run);
      if (paused) return paused;

      const outcome = await this.runStep(run, step, context);
      run = outcome.run;
      // Falhar tambem deixa dado de teste para tras: o que foi criado ate o
      // passo que quebrou e removido do mesmo jeito.
      if (outcome.failed) return this.cleanUpAfter(input, run);
    }

    // Ultima checagem antes de declarar sucesso: uma resposta humana que chegou
    // durante o ultimo passo nao pode virar "tudo pronto".
    const pausedAtEnd = await this.pauseIfHumanReplied(run);
    if (pausedAtEnd) return pausedAtEnd;

    // A limpeza roda **antes** de fechar a execucao, para que o estado
    // terminal ja seja lido junto com o que a limpeza deixou: quem le
    // `SUCCEEDED` le, na mesma linha, `cleanupState` e o residuo.
    await this.cleanUpAfter(input, run);
    return this.runs.finishRun(input.tenantId, run.id, "SUCCEEDED");
  }

  /**
   * Limpeza ao fim da execucao.
   *
   * So para execucao terminada. Execucao pausada por interferencia humana nao
   * e limpa: a conversa tem mensagem da pessoa dentro, e apagar a conversa que
   * ela esta usando seria remover o que a execucao nao criou.
   *
   * A limpeza nunca derruba a execucao: ela ja registra o proprio residuo, e
   * uma falha inesperada dela viraria `500` num caminho que e resultado.
   */
  private async cleanUpAfter(
    input: { tenantId: string; userId: string; requestId: string },
    run: ActivationTestRunRecord,
  ): Promise<ActivationTestRunRecord> {
    let result: ActivationTestCleanupResult | null = null;
    try {
      result = await this.cleanup.clean({
        tenantId: input.tenantId,
        runId: run.id,
        userId: input.userId,
        requestId: input.requestId,
      });
    } catch (error) {
      this.logger.warn(
        { tenantId: run.tenantId, runId: run.id, err: toErrorMessage(error) },
        "Activation test cleanup could not run",
      );
    }
    if (result && result.residue.length > 0) {
      this.logger.info(
        { tenantId: run.tenantId, runId: run.id, state: result.state },
        "Activation test finished with cleanup residue",
      );
    }
    return (await this.runs.findRun(input.tenantId, run.id)) ?? run;
  }

  /**
   * Interferencia humana: resposta manual na conversa de teste pausa.
   *
   * Pausada nao e falha e nao e sucesso — e um estado proprio, com a mensagem
   * que a causou gravada, para a tela explicar em vez de adivinhar.
   */
  private async pauseIfHumanReplied(
    run: ActivationTestRunRecord,
  ): Promise<ActivationTestRunRecord | null> {
    if (!run.conversationId) return null;
    const human = await this.runs.findHumanMessage({
      tenantId: run.tenantId,
      conversationId: run.conversationId,
      since: run.startedAt,
    });
    if (!human) return null;

    this.logger.info(
      { tenantId: run.tenantId, runId: run.id, messageId: human.id },
      "Activation test paused by human reply",
    );
    return this.runs.pauseRun(run.tenantId, run.id, human.id, this.now());
  }

  /**
   * Um passo, com retentativa limitada.
   *
   * Falha transitoria (infraestrutura, transporte, erro desconhecido) repete
   * ate `maxAttempts`, que e o limite declarado em
   * `ACTIVATION_TEST_MAX_ATTEMPTS` e fica gravado na propria execucao. Falha de
   * negocio nao repete: repetir nao muda a resposta da agenda. Esgotado o
   * limite, a execucao termina em falha com o passo que falhou registrado.
   */
  private async runStep(
    run: ActivationTestRunRecord,
    step: ActivationTestStep,
    context: SchedulingRequestContext,
  ): Promise<StepOutcome> {
    let current = run;
    for (let attempt = 1; attempt <= run.maxAttempts; attempt += 1) {
      current = await this.runs.patchRun(run.tenantId, run.id, {
        currentStep: step,
        attempts: attempt,
      });
      try {
        current = await this.performStep(current, step, context, attempt);
        current = await this.runs.patchRun(run.tenantId, run.id, {
          completedStep: step,
        });
        return { run: current, failed: false };
      } catch (error) {
        const transient = isTransientFailure(error);
        const reason = toErrorMessage(error);
        this.logger.warn(
          {
            tenantId: run.tenantId,
            runId: run.id,
            step,
            attempt,
            transient,
            err: reason,
          },
          "Activation test step failed",
        );
        if (!transient || attempt >= run.maxAttempts) {
          const failed = await this.runs.finishRun(
            run.tenantId,
            run.id,
            "FAILED",
            {
              failedStep: step,
              failureCode: failureCodeOf(error),
              failureReason: ACTIVATION_TEST_STEP_LABELS[step],
              lastError: reason,
              lastErrorAt: this.now(),
            },
          );
          return { run: failed, failed: true };
        }
        current = await this.runs.patchRun(run.tenantId, run.id, {
          lastError: reason,
          lastErrorAt: this.now(),
        });
        await this.sleep(this.retryDelayMs * attempt);
      }
    }
    return { run: current, failed: false };
  }

  /**
   * O caminho feliz do vault, um passo por vez.
   *
   * A divisao de trabalho aqui e a resposta ao que o review da rodada 1
   * recusou: **o teste nao escreve nada em nome da IA**. Os passos do cliente
   * enviam pela porta da plataforma e entregam a mensagem a IA; os passos da
   * IA apenas **leem o que ela fez** — a resposta que ela gravou e as
   * ferramentas que ela chamou — e transformam isso em marco.
   *
   * A consequencia esta na forma: nao ha neste `switch` nenhum texto de
   * resposta da IA, nenhuma consulta de disponibilidade e nenhuma criacao de
   * agendamento. Se a IA nao consultar o catalogo, nao consultar a agenda ou
   * nao confirmar o agendamento, o passo correspondente **falha** — ele nao
   * tem como se completar sozinho.
   */
  private async performStep(
    run: ActivationTestRunRecord,
    step: ActivationTestStep,
    context: SchedulingRequestContext,
    attempt: number,
  ): Promise<ActivationTestRunRecord> {
    switch (step) {
      case "TEST_NOTICE":
        // Aviso separado: nao e marco porque nao demonstra nada, e nao vai
        // para a IA porque nao e pergunta de cliente — responder ao aviso
        // seria a IA conversando com a Atendly, nao com o cliente de teste.
        return (
          await this.sendAsClient(run, step, attempt, ACTIVATION_TEST_NOTICE)
        ).run;

      case "CLIENT_ASKS_PRICE": {
        const sent = await this.sendAsClient(
          run,
          step,
          attempt,
          `Oi! Quanto custa ${run.serviceName ?? "o atendimento"}?`,
          { deliverToAi: true },
        );
        await this.record(run, "MESSAGE_SENT", {
          kind: "MESSAGE",
          id: sent.messageId,
        });
        return sent.run;
      }

      case "AI_IDENTIFIES_SERVICE": {
        // Fato: a chamada de catalogo que **a IA** registrou. Sem ela, a IA
        // nao identificou servico nenhum, e o passo falha.
        const toolCall = await this.requireAiToolCall(
          run,
          ACTIVATION_TEST_TOOL_NAMES.SERVICE,
          "a IA nao consultou o catalogo para identificar o servico",
        );
        await this.record(run, "SERVICE_IDENTIFIED", {
          kind: "SERVICE",
          id: toolCall.id,
          detail: { tool: toolCall.name, status: toolCall.status },
        });
        return run;
      }

      case "AI_ANSWERS_PRICE": {
        // Fato: a mensagem que a IA gravou na conversa. O texto e dela.
        const reply = await this.requireAiReply(
          run,
          "a IA nao respondeu a pergunta de preco",
        );
        await this.record(run, "PRICE_INFORMED", {
          kind: "MESSAGE",
          id: reply.id,
        });
        return run;
      }

      case "CLIENT_ASKS_SLOT":
        return (
          await this.sendAsClient(
            run,
            step,
            attempt,
            "Otimo. Qual o proximo horario disponivel?",
            { deliverToAi: true },
          )
        ).run;

      case "AI_CHECKS_AVAILABILITY": {
        // Fato: a consulta de agenda que **a IA** registrou. O teste nao
        // consulta a agenda no lugar dela.
        const toolCall = await this.requireAiToolCall(
          run,
          ACTIVATION_TEST_TOOL_NAMES.AVAILABILITY,
          "a IA nao consultou a agenda",
        );
        await this.record(run, "AVAILABILITY_CHECKED", {
          kind: "AVAILABILITY",
          id: toolCall.id,
          detail: { tool: toolCall.name, status: toolCall.status },
        });
        return run;
      }

      case "CLIENT_ACCEPTS_SLOT": {
        const sent = await this.sendAsClient(
          run,
          step,
          attempt,
          "Perfeito, pode reservar esse horario.",
          { deliverToAi: true },
        );
        await this.record(run, "SLOT_SELECTED", {
          kind: "MESSAGE",
          id: sent.messageId,
        });
        return sent.run;
      }

      case "AI_CONFIRMS_APPOINTMENT": {
        // Fato: o agendamento que **a IA** criou, pelo id gravado no resultado
        // da ferramenta dela. O teste nao cria agendamento em lugar nenhum —
        // e por isso que este marco prova que a IA atendeu.
        const toolCall = await this.requireAiToolCall(
          run,
          ACTIVATION_TEST_TOOL_NAMES.APPOINTMENT,
          "a IA nao confirmou o agendamento",
        );
        const appointmentId = appointmentIdFromToolCall(toolCall);
        if (!appointmentId) {
          // Preparar nao e confirmar. O codigo nomeia isto em vez de culpar a
          // agenda: a disponibilidade ja foi verificada antes de o teste
          // comecar, e repetir a mentira mandaria corrigir o que esta certo.
          throw activationTestRefusal(
            ACTIVATION_TEST_REFUSALS.AI_DID_NOT_CONFIRM_APPOINTMENT,
            "a IA chamou a ferramenta de agendamento sem confirmar o agendamento",
            { toolCallId: toolCall.id },
          );
        }
        // Gravado antes de qualquer outro efeito: e este ID que a limpeza usa.
        const updated = await this.runs.patchRun(run.tenantId, run.id, {
          appointmentId,
          customerId: await this.customerOfAppointment(
            run,
            appointmentId,
            context,
          ),
        });
        await this.record(run, "APPOINTMENT_CONFIRMED", {
          kind: "APPOINTMENT",
          id: appointmentId,
          detail: { toolCallId: toolCall.id },
        });
        return updated;
      }
    }
  }

  /**
   * Pessoa que a IA vinculou ao agendamento, lida do read model da agenda.
   *
   * A busca por telefone aqui e **leitura de prova**: o que vale e a igualdade
   * com o id do agendamento que a IA criou. `null` quando a leitura nao
   * responde — e melhor a limpeza registrar residuo do que apagar a pessoa
   * errada.
   */
  private async customerOfAppointment(
    run: ActivationTestRunRecord,
    appointmentId: string,
    context: SchedulingRequestContext,
  ): Promise<string | null> {
    try {
      const businessContext = await this.runs.businessContext(run.tenantId);
      const agenda = await this.scheduling.findFutureAppointmentsForPhone(
        run.platformNumber,
        businessContext,
        context,
      );
      return (
        agenda.find((appointment) => appointment.id === appointmentId)
          ?.customerId ?? null
      );
    } catch (error) {
      this.logger.warn(
        { tenantId: run.tenantId, runId: run.id, err: toErrorMessage(error) },
        "Activation test could not read the customer of the created appointment",
      );
      return null;
    }
  }

  /**
   * Chamada de ferramenta que a IA registrou depois do inicio da execucao.
   *
   * Ausencia e falha de negocio, nao transitoria: repetir nao faz a IA ter
   * chamado a ferramenta no passado. Este e o ponto em que "a IA nao atendeu"
   * vira resultado da execucao em vez de um marco fabricado.
   */
  private async requireAiToolCall(
    run: ActivationTestRunRecord,
    name: string,
    reason: string,
  ): Promise<ActivationTestAiToolCall> {
    const toolCall = await this.runs.findAiToolCall({
      tenantId: run.tenantId,
      conversationId: requireConversationId(run),
      name,
      since: run.startedAt,
    });
    if (!toolCall) {
      // Codigo proprio: o que faltou foi a IA agir. Dizer
      // `NO_ELIGIBLE_SERVICE` aqui mandava a pessoa arrumar um catalogo que
      // nunca esteve errado — o teste so comeca com servico apto.
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.AI_DID_NOT_ACT,
        reason,
        { tool: name },
      );
    }
    return toolCall;
  }

  /**
   * Ultima resposta que a IA gravou na conversa de teste, **ja entregue**.
   *
   * Duas recusas distintas, porque sao dois problemas distintos: a IA nao ter
   * respondido e a resposta dela nao ter saido pelo canal do negocio. O marco
   * de preco informado depende do segundo: uma linha `PENDING` significa que o
   * negocio nao viu resposta nenhuma no WhatsApp, e chamar isso de marco
   * alcancado seria afirmar envio que nao aconteceu.
   */
  private async requireAiReply(
    run: ActivationTestRunRecord,
    reason: string,
  ): Promise<ActivationTestAiReply> {
    const reply = await this.runs.findAiReply({
      tenantId: run.tenantId,
      conversationId: requireConversationId(run),
      since: run.startedAt,
    });
    if (!reply) {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.AI_DID_NOT_REPLY,
        reason,
      );
    }
    if (reply.deliveryState !== "SENT") {
      throw activationTestRefusal(
        ACTIVATION_TEST_REFUSALS.AI_REPLY_NOT_DELIVERED,
        "a resposta da IA nao saiu pelo WhatsApp do negocio",
        { messageId: reply.id, deliveryState: reply.deliveryState },
      );
    }
    return reply;
  }

  /**
   * Mensagem do cliente simulado: sai pelo numero da plataforma, pela porta de
   * envio, e so depois vira linha gravada.
   *
   * A ordem importa. O marco "mensagem enviada" precisa de envio de verdade
   * atras dele: gravar antes de enviar produziria um marco que afirma um envio
   * que talvez nunca tenha acontecido.
   *
   * `deliverToAi` e o que separa o aviso da conversa: o aviso e so gravado,
   * enquanto cada fala do cliente simulado **entra na IA** pela mesma porta de
   * entrada de qualquer mensagem. Quando ela entra por ali, quem grava a linha
   * do cliente e a propria porta de entrada da IA — o teste nao grava mensagem
   * de cliente duas vezes, e nao grava nada em nome da IA.
   */
  private async sendAsClient(
    run: ActivationTestRunRecord,
    step: ActivationTestStep,
    attempt: number,
    text: string,
    options: { deliverToAi?: boolean } = {},
  ): Promise<{ run: ActivationTestRunRecord; messageId: string }> {
    const correlationId = correlationFor(run, step, attempt);
    const sent = await this.sender.sendToTenantUnderTest(
      { tenantId: run.tenantId, runId: run.id, phone: run.tenantPhone },
      { text, correlationId },
    );
    const externalMessageId = sent.messageId ?? correlationId;

    if (!options.deliverToAi) {
      const message = await this.runs.recordConversationMessage({
        tenantId: run.tenantId,
        channelId: run.channelId,
        conversationId: requireConversationId(run),
        author: "CLIENT",
        body: text,
        correlationId,
        externalMessageId,
      });
      return {
        run: await this.runs.patchRun(run.tenantId, run.id, {
          appendMessageIds: [message.id],
        }),
        messageId: message.id,
      };
    }

    const turn = await this.deliverToAi(run, text, externalMessageId);
    // As linhas que a IA gravou neste turno — a do cliente e a dela — entram
    // no registro do que a execucao criou, que e o que a limpeza remove.
    const created = [turn.clientMessageId, turn.aiMessageId].filter(
      (id): id is string => Boolean(id),
    );
    return {
      run: await this.runs.patchRun(run.tenantId, run.id, {
        appendMessageIds: created,
      }),
      messageId: turn.clientMessageId,
    };
  }

  /**
   * Entrega a fala do cliente simulado a IA e devolve o que ela fez.
   *
   * Nao ha aqui nenhuma leitura do retorno para decidir progresso: o turno
   * volta so para que os IDs do que foi gravado entrem no registro da
   * execucao. Quem decide marco e a leitura do banco, no passo seguinte.
   */
  private async deliverToAi(
    run: ActivationTestRunRecord,
    text: string,
    externalMessageId: string,
  ): Promise<ActivationTestAiTurn> {
    const channel = await this.runs.findActiveChannel(run.tenantId);
    return this.ai.deliver({
      tenantId: run.tenantId,
      channelId: run.channelId,
      userId: run.tenantId,
      requestId: `activation-test-${run.id}`,
      instanceId: channel?.externalInstanceId ?? run.channelInstanceId ?? "",
      fromPhone: run.platformNumber,
      text,
      externalMessageId,
    });
  }

  private async record(
    run: ActivationTestRunRecord,
    milestone: ActivationTestMilestoneName,
    fact: ActivationTestFact,
  ): Promise<void> {
    await this.runs.recordMilestone(run.tenantId, run.id, milestone, fact);
  }

  private async requireService(
    run: ActivationTestRunRecord,
    context: SchedulingRequestContext,
  ): Promise<SchedulingServiceDefinition> {
    return this.scheduling.findService(requireServiceId(run), context);
  }
}

/**
 * Servico do teste: preferencia por um que permita agendamento normal e que
 * tenha preco para informar. Sem preco declarado o teste ainda vale, mas o
 * primeiro criterio e a agenda, nao a vitrine.
 */
export function selectTestService(
  services: readonly SchedulingServiceDefinition[],
): SchedulingServiceDefinition | undefined {
  const schedulable = services.filter((service) => service.duration > 0);
  const priced = schedulable.find(
    (service) =>
      (service.priceType === "FIXED" || service.priceType === "STARTING_AT") &&
      service.price !== null,
  );
  return priced ?? schedulable[0];
}

/**
 * Passos que ainda faltam.
 *
 * Reentrar continua do passo seguinte ao ultimo concluido — nunca do zero, que
 * reenviaria mensagem e reconsultaria a agenda sem necessidade.
 */
function remainingSteps(
  run: ActivationTestRunRecord,
): readonly ActivationTestStep[] {
  if (!run.completedStep) return ACTIVATION_TEST_STEPS;
  const index = ACTIVATION_TEST_STEPS.indexOf(run.completedStep);
  return index < 0
    ? ACTIVATION_TEST_STEPS
    : ACTIVATION_TEST_STEPS.slice(index + 1);
}

/**
 * Falha transitoria e a que pode mudar de resposta se for repetida:
 * infraestrutura, transporte, erro desconhecido. Recusa de negocio (4xx com
 * codigo proprio) e definitiva — repetir so adiaria a mesma resposta.
 */
export function isTransientFailure(error: unknown): boolean {
  if (error instanceof InfrastructureError) return true;
  if (error instanceof AppError) return error.statusCode >= 500;
  return true;
}

function failureCodeOf(error: unknown): string {
  return error instanceof AppError ? error.code : ACTIVATION_TEST_STEP_FAILED;
}

function correlationFor(
  run: ActivationTestRunRecord,
  step: ActivationTestStep,
  attempt: number,
): string {
  // O numero da tentativa entra na chave: a retentativa de um envio que pode
  // ter saido nao colide com a linha ja gravada da tentativa anterior.
  return `activation-test-${run.id}-${step.toLowerCase()}-${attempt}`;
}

function schedulingContext(input: {
  tenantId: string;
  userId: string;
  requestId: string;
}): SchedulingRequestContext {
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    requestId: input.requestId,
  };
}

function requireServiceId(run: ActivationTestRunRecord): string {
  if (!run.serviceId) {
    throw new AppError("Activation test run has no selected service.", {
      statusCode: 409,
      code: ACTIVATION_TEST_REFUSALS.NO_ELIGIBLE_SERVICE,
    });
  }
  return run.serviceId;
}

function requireConversationId(run: ActivationTestRunRecord): string {
  if (!run.conversationId) {
    throw new AppError("Activation test run has no test conversation.", {
      statusCode: 409,
      code: ACTIVATION_TEST_STEP_FAILED,
    });
  }
  return run.conversationId;
}
