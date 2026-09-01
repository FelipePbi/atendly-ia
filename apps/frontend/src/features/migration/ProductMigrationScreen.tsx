"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import {
  BffHttpError,
  type CalendarSource,
  type Migration,
  type MigrationDiagnosis,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { AppShell } from "@/shared/layout/AppShell";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { StatePanel } from "@/shared/ui/States";

import { Frame, Route, SideNotes, Status } from "./MigrationScreen";

export type ProductMigrationStep =
  "intro" | "diagnosis" | "conflicts" | "review" | "progress" | "result";

export function ProductMigrationScreen({
  step,
  target,
  migrationId,
}: {
  step: ProductMigrationStep;
  target: CalendarSource;
  migrationId?: string;
}) {
  if (step === "intro") return <MigrationIntro target={target} />;
  if (step === "progress" || step === "result") {
    return (
      <MigrationProgress
        migrationId={migrationId}
        resultOnly={step === "result"}
        target={target}
      />
    );
  }
  return <MigrationPreparation step={step} target={target} />;
}

function MigrationIntro({ target }: { target: CalendarSource }) {
  const names = sourceNames(target);
  const toExternal = target === "EXTERNAL";
  return (
    <MigrationShell target={target}>
      <Frame
        title={`Migrar para ${names.target}`}
        description={
          toExternal
            ? "A Atendly verifica o que a integração realmente permite antes de qualquer mudança."
            : "Prepare uma importação única e revise os dados antes de transferir o controle para a Agenda Atendly."
        }
        step={1}
        back="/configuracoes/agenda"
      >
        <Route source={names.source} target={names.target} complete={false} />
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            <section className="migration-panel">
              <div className="migration-panel-header">
                <div>
                  <h2>O que acontece agora</h2>
                  <p>Primeiro analisamos. Nada é trocado nesta etapa.</p>
                </div>
                <span className="badge">Sem corte agora</span>
              </div>
              <ul className="migration-facts">
                <MigrationFact text="A fonte atual continua oficial durante toda a preparação." />
                <MigrationFact text="Serviços, clientes, agendamentos e disponibilidade são validados." />
                <MigrationFact text="Conflitos e limitações aparecem antes da confirmação." />
                <MigrationFact text="A fonte anterior não é excluída automaticamente." />
              </ul>
              <div className="migration-actions">
                <Link
                  className="btn btn-secondary"
                  href="/configuracoes/agenda"
                >
                  Manter fonte atual
                </Link>
                <Link
                  className="btn btn-primary"
                  href={`/migracao/diagnostico?target=${publicTarget(target)}`}
                >
                  {toExternal ? "Verificar capacidade" : "Preparar migração"}
                </Link>
              </div>
            </section>
          </div>
          <SideNotes />
        </div>
      </Frame>
    </MigrationShell>
  );
}

function MigrationPreparation({
  step,
  target,
}: {
  step: "diagnosis" | "conflicts" | "review";
  target: CalendarSource;
}) {
  const router = useRouter();
  const names = sourceNames(target);
  const [diagnosis, setDiagnosis] = useState<MigrationDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .migration.diagnose(target, controller.signal)
      .then(setDiagnosis)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(requestError(caught));
      });
    return () => controller.abort();
  }, [reload, target]);

  const retryDiagnosis = () => {
    setDiagnosis(null);
    setError(null);
    setReload((value) => value + 1);
  };

  const query = `?target=${publicTarget(target)}`;
  const back =
    step === "diagnosis"
      ? target === "EXTERNAL"
        ? `/migracao/para-minha-agenda${query}`
        : `/migracao/para-atendly${query}`
      : step === "conflicts"
        ? `/migracao/diagnostico${query}`
        : diagnosis?.conflicts.length
          ? `/migracao/conflitos${query}`
          : `/migracao/diagnostico${query}`;

  const start = async () => {
    if (!diagnosis?.supported || diagnosis.conflicts.length > 0 || !confirmed)
      return;
    setStarting(true);
    setError(null);
    try {
      const result = await getProductServices().migration.create(target);
      router.push(
        `/migracao/progresso?target=${publicTarget(target)}&migrationId=${encodeURIComponent(result.migrationId)}`,
      );
    } catch (caught: unknown) {
      setError(requestError(caught));
      setStarting(false);
    }
  };

  return (
    <MigrationShell target={target}>
      <Frame
        title={
          step === "diagnosis"
            ? "Verificar se a troca é segura"
            : step === "conflicts"
              ? "Resolver diferenças antes do corte"
              : "Revisar a mudança da fonte oficial"
        }
        description="A fonte atual continua ativa enquanto os dados e as condições do corte são validados."
        step={step === "diagnosis" ? 1 : 2}
        back={back}
        badge={<span className="badge">Diagnóstico real</span>}
      >
        <Route source={names.source} target={names.target} complete={false} />
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            {!diagnosis && !error && <MigrationLoading />}
            {error && (
              <section className="migration-panel">
                <StatePanel
                  actionLabel="Tentar novamente"
                  description={error}
                  icon="alert"
                  onAction={retryDiagnosis}
                  title="Não foi possível analisar a migração"
                  tone="error"
                />
              </section>
            )}
            {diagnosis && step === "diagnosis" && (
              <DiagnosisPanel diagnosis={diagnosis} query={query} />
            )}
            {diagnosis && step === "conflicts" && (
              <ConflictPanel diagnosis={diagnosis} query={query} />
            )}
            {diagnosis && step === "review" && (
              <ReviewPanel
                confirmed={confirmed}
                diagnosis={diagnosis}
                names={names}
                onConfirmed={setConfirmed}
                onStart={() => void start()}
                starting={starting}
              />
            )}
          </div>
          <SideNotes>
            {diagnosis && (
              <section className="migration-side-card">
                <h2>Limitações informadas</h2>
                {diagnosis.limitations.length > 0 ? (
                  <ul className="migration-side-list">
                    {diagnosis.limitations.map((limitation) => (
                      <li key={limitation}>
                        <Icon name="info" />
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhuma limitação adicional foi informada.</p>
                )}
              </section>
            )}
          </SideNotes>
        </div>
      </Frame>
    </MigrationShell>
  );
}

function DiagnosisPanel({
  diagnosis,
  query,
}: {
  diagnosis: MigrationDiagnosis;
  query: string;
}) {
  const hasConflicts = diagnosis.conflicts.length > 0;
  const rows = [
    ["Serviços", diagnosis.entities.services],
    ["Clientes", diagnosis.entities.customers],
    ["Agendamentos futuros", diagnosis.entities.appointments],
    ["Disponibilidade", diagnosis.entities.availability],
  ] as const;
  return (
    <section className="migration-panel">
      <div className="migration-panel-header">
        <div>
          <h2>
            {diagnosis.supported
              ? "Diagnóstico da origem e do destino"
              : "Migração automática indisponível"}
          </h2>
          <p>Contagens obtidas da fonte oficial e do destino.</p>
        </div>
        <Status
          icon={!diagnosis.supported ? "x" : hasConflicts ? "alert" : "check"}
          tone={
            !diagnosis.supported
              ? "is-danger"
              : hasConflicts
                ? "is-warning"
                : "is-ready"
          }
        >
          {!diagnosis.supported
            ? "Não suportada"
            : hasConflicts
              ? `${diagnosis.conflicts.length} pendências`
              : "Pronta para revisão"}
        </Status>
      </div>
      <ul className="migration-diagnostics">
        {rows.map(([label, entity]) => (
          <li key={label}>
            <div>
              <strong>{label}</strong>
              <small>{entity.total} encontrados na análise</small>
            </div>
            <Status
              icon={entity.importable === entity.total ? "check" : "alert"}
              tone={
                entity.importable === entity.total ? "is-ready" : "is-warning"
              }
            >
              {entity.importable} importáveis
            </Status>
          </li>
        ))}
      </ul>
      {diagnosis.warnings.map((warning) => (
        <div
          className="alert banner-warning migration-inline-state"
          key={warning}
        >
          <Icon name="alert" />
          <div>
            <p className="alert-title">Atenção antes do corte</p>
            <p className="alert-text">{warning}</p>
          </div>
        </div>
      ))}
      <div className="migration-actions">
        <Link className="btn btn-secondary" href="/configuracoes/agenda">
          Manter fonte atual
        </Link>
        {diagnosis.supported && (
          <Link
            className="btn btn-primary"
            href={
              hasConflicts
                ? `/migracao/conflitos${query}`
                : `/migracao/revisao${query}`
            }
          >
            {hasConflicts ? "Revisar conflitos" : "Revisar mudança"}
          </Link>
        )}
      </div>
    </section>
  );
}

function ConflictPanel({
  diagnosis,
  query,
}: {
  diagnosis: MigrationDiagnosis;
  query: string;
}) {
  if (diagnosis.conflicts.length === 0) {
    return (
      <section className="migration-panel">
        <StatePanel
          actionHref={`/migracao/revisao${query}`}
          actionLabel="Revisar mudança"
          description="O diagnóstico atual não encontrou conflitos bloqueantes."
          icon="check"
          title="Nenhuma pendência"
        />
      </section>
    );
  }
  return (
    <section className="migration-panel">
      <div className="migration-panel-header">
        <div>
          <h2>Pendências encontradas</h2>
          <p>Corrija os dados indicados e execute o diagnóstico novamente.</p>
        </div>
        <Status icon="alert" tone="is-warning">
          {diagnosis.conflicts.length} pendências
        </Status>
      </div>
      {diagnosis.conflicts.map((conflict, index) => (
        <section
          className="migration-conflict-group"
          key={`${conflict.entityType}-${conflict.externalId}-${conflict.code}-${index}`}
        >
          <div className="migration-conflict-head">
            <div>
              <h3>{entityLabel(conflict.entityType)}</h3>
              <p>{conflict.message}</p>
            </div>
            <span className="badge">{conflict.code}</span>
          </div>
        </section>
      ))}
      <div className="migration-actions">
        <Link className="btn btn-secondary" href="/configuracoes/agenda">
          Voltar para configurações
        </Link>
        <Link
          className="btn btn-primary"
          href={`/migracao/diagnostico${query}`}
        >
          Executar diagnóstico novamente
        </Link>
      </div>
    </section>
  );
}

function ReviewPanel({
  confirmed,
  diagnosis,
  names,
  onConfirmed,
  onStart,
  starting,
}: {
  confirmed: boolean;
  diagnosis: MigrationDiagnosis;
  names: ReturnType<typeof sourceNames>;
  onConfirmed: (value: boolean) => void;
  onStart: () => void;
  starting: boolean;
}) {
  if (!diagnosis.supported || diagnosis.conflicts.length > 0) {
    return (
      <section className="migration-panel">
        <StatePanel
          actionHref="/configuracoes/agenda"
          actionLabel="Voltar para configurações"
          description="O corte não pode iniciar enquanto existirem limitações bloqueantes ou conflitos."
          icon="alert"
          title="Migração ainda não está pronta"
          tone="error"
        />
      </section>
    );
  }
  const total = Object.values(diagnosis.entities).reduce(
    (sum, entity) => sum + entity.importable,
    0,
  );
  return (
    <section className="migration-panel">
      <div className="migration-panel-header">
        <div>
          <h2>Revisão consciente</h2>
          <p>Confira o destino e o impacto operacional antes de iniciar.</p>
        </div>
        <Status icon="shield" tone="is-warning">
          Sem exclusão automática
        </Status>
      </div>
      <div className="migration-review">
        <ReviewRow label="Fonte atual" value={names.source} />
        <ReviewRow label="Nova fonte oficial" value={names.target} />
        <ReviewRow label="Itens importáveis" value={String(total)} />
        <ReviewRow
          label="Condições do corte"
          value="Serviço e disponibilidade válidos"
        />
      </div>
      <label className="check migration-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => onConfirmed(event.target.checked)}
        />
        <span className="check-box" aria-hidden="true" />
        <span className="check-copy">
          <strong>Revisei a nova fonte e o impacto do corte</strong>
          <span>
            Se a validação final falhar, {names.source} continua oficial.
          </span>
        </span>
      </label>
      <div className="migration-actions">
        <Link className="btn btn-secondary" href="/configuracoes/agenda">
          Manter fonte atual
        </Link>
        <button
          className="btn btn-primary"
          type="button"
          disabled={!confirmed || starting}
          onClick={onStart}
        >
          {starting ? "Iniciando migração..." : "Iniciar migração"}
        </button>
      </div>
    </section>
  );
}

function MigrationProgress({
  migrationId,
  resultOnly,
  target,
}: {
  migrationId?: string;
  resultOnly: boolean;
  target: CalendarSource;
}) {
  const router = useRouter();
  const names = sourceNames(target);
  const [migration, setMigration] = useState<Migration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayError = migrationId
    ? error
    : "O identificador da migração não foi informado.";
  const terminal = migration
    ? ["PARTIAL", "COMPLETED", "FAILED"].includes(migration.status)
    : false;

  useEffect(() => {
    if (!migrationId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    const load = async () => {
      try {
        const result = await getProductServices().migration.get(
          migrationId,
          controller.signal,
        );
        setMigration(result);
        setError(null);
        if (!["PARTIAL", "COMPLETED", "FAILED"].includes(result.status)) {
          timer = window.setTimeout(() => void load(), 1_500);
        }
      } catch (caught: unknown) {
        if (!controller.signal.aborted) setError(requestError(caught));
      }
    };
    void load();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [migrationId]);

  useEffect(() => {
    if (!migration || resultOnly || !terminal) return;
    const route =
      migration.status === "COMPLETED"
        ? "sucesso"
        : migration.status === "PARTIAL"
          ? "parcial"
          : "erro";
    router.replace(
      `/migracao/${route}?target=${publicTarget(target)}&migrationId=${encodeURIComponent(migration.migrationId)}`,
    );
  }, [migration, resultOnly, router, target, terminal]);

  const complete = migration?.status === "COMPLETED";
  return (
    <MigrationShell target={target} complete={complete}>
      <Frame
        title={
          terminal
            ? complete
              ? "Migração concluída"
              : migration?.status === "PARTIAL"
                ? "Resultado parcial"
                : "Falha na migração"
            : "Validando a nova fonte"
        }
        description={
          complete
            ? "A nova fonte foi ativada somente depois da validação bem-sucedida."
            : "A fonte anterior continua oficial enquanto o processo não termina com sucesso."
        }
        step={3}
        back="/configuracoes/agenda"
        badge={
          migration && (
            <span className="badge badge-attention">
              {statusLabel(migration.status)}
            </span>
          )
        }
      >
        <Route
          source={names.source}
          target={names.target}
          complete={complete}
        />
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            {!migration && !displayError && <MigrationLoading />}
            {displayError && (
              <section className="migration-panel">
                <StatePanel
                  actionHref="/configuracoes/agenda"
                  actionLabel="Voltar para configurações"
                  description={displayError}
                  icon="alert"
                  title="Não foi possível acompanhar a migração"
                  tone="error"
                />
              </section>
            )}
            {migration && !terminal && <RunningPanel migration={migration} />}
            {migration && terminal && (
              <ResultPanel migration={migration} names={names} />
            )}
          </div>
          <SideNotes />
        </div>
      </Frame>
    </MigrationShell>
  );
}

function RunningPanel({ migration }: { migration: Migration }) {
  const completedSegments = Math.floor(migration.progress / 25);
  return (
    <section className="migration-process" aria-busy="true" aria-live="polite">
      <span className="migration-process-icon">
        <Icon name="refresh" />
      </span>
      <h2>Migração em andamento</h2>
      <p>
        A troca ainda não foi concluída. A fonte anterior permanece oficial até
        o corte seguro.
      </p>
      <div
        className="migration-process-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={migration.progress}
      >
        {[0, 1, 2, 3].map((segment) => (
          <span
            className={
              segment < completedSegments
                ? "is-complete"
                : segment === completedSegments
                  ? "is-active"
                  : undefined
            }
            key={segment}
          />
        ))}
      </div>
      <p className="migration-current-step">
        {stepLabel(migration.currentStep)} · {migration.progress}%
      </p>
      <div className="alert banner-warning migration-inline-state">
        <Icon name="alert" />
        <div>
          <p className="alert-title">Operações temporariamente limitadas</p>
          <p className="alert-text">
            Evite alterar a fonte externa enquanto os dados são validados.
          </p>
        </div>
      </div>
      <div className="migration-actions">
        <Link className="btn btn-secondary" href="/inicio">
          Acompanhar em segundo plano
        </Link>
      </div>
    </section>
  );
}

function ResultPanel({
  migration,
  names,
}: {
  migration: Migration;
  names: ReturnType<typeof sourceNames>;
}) {
  const success = migration.status === "COMPLETED";
  const partial = migration.status === "PARTIAL";
  const summary = migrationSummary(migration.summary);
  return (
    <section className="migration-result">
      <span
        className={`migration-result-mark${partial ? " is-warning" : success ? "" : " is-danger"}`}
      >
        <Icon name={success ? "check" : partial ? "alert" : "x"} />
      </span>
      <span
        className={`badge ${success ? "badge-success" : partial ? "badge-attention" : "badge-danger"}`}
      >
        {statusLabel(migration.status)}
      </span>
      <h2>
        {success
          ? `${names.target} agora é a fonte oficial`
          : partial
            ? "A migração precisa de correções"
            : "Não foi possível concluir a migração"}
      </h2>
      <p>
        {success
          ? "Os dados foram validados e o corte foi concluído."
          : `${names.source} continua como fonte oficial. Nenhum sucesso foi simulado.`}
      </p>
      <div className="migration-review">
        <ReviewRow
          label="Fonte oficial"
          value={success ? names.target : names.source}
        />
        <ReviewRow
          label="Serviços importados"
          value={
            summary?.services === undefined ? "—" : String(summary.services)
          }
        />
        <ReviewRow
          label="Clientes importados"
          value={
            summary?.customers === undefined ? "—" : String(summary.customers)
          }
        />
        <ReviewRow
          label="Agendamentos importados"
          value={
            summary?.appointments === undefined
              ? "—"
              : String(summary.appointments)
          }
        />
        {migration.error && (
          <ReviewRow label="Falha" value={migration.error.message} />
        )}
      </div>
      {migration.conflicts.length > 0 && (
        <div className="alert banner-warning migration-inline-state">
          <Icon name="alert" />
          <div>
            <p className="alert-title">
              {migration.conflicts.length} pendências exigem correção
            </p>
            <p className="alert-text">
              Execute um novo diagnóstico depois de corrigir os dados na fonte
              atual.
            </p>
          </div>
        </div>
      )}
      <div className="migration-actions">
        {success ? (
          <>
            <Link className="btn btn-secondary" href="/agenda/novo">
              Testar agendamento
            </Link>
            <Link className="btn btn-primary" href="/inicio">
              Ir para o Início
            </Link>
          </>
        ) : (
          <>
            <Link className="btn btn-secondary" href="/configuracoes/agenda">
              Voltar para configurações
            </Link>
            <Link
              className="btn btn-primary"
              href={`/migracao/diagnostico?target=${publicTarget(migration.target)}`}
            >
              Executar novo diagnóstico
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

function MigrationShell({
  children,
  complete = false,
  target,
}: {
  children: ReactNode;
  complete?: boolean;
  target: CalendarSource;
}) {
  const source = complete
    ? target
    : target === "ATENDLY"
      ? "EXTERNAL"
      : "ATENDLY";
  return (
    <AppShell
      active="configuracoes"
      module="migration"
      source={source === "EXTERNAL" ? "external" : "atendly"}
    >
      {children}
    </AppShell>
  );
}

function MigrationLoading() {
  return (
    <section className="migration-process" aria-busy="true">
      <span className="migration-process-icon">
        <Icon name="refresh" />
      </span>
      <h2>Analisando dados reais</h2>
      <p>Consultando a fonte oficial e validando as condições do destino.</p>
    </section>
  );
}

function MigrationFact({ text }: { text: string }) {
  return (
    <li>
      <Icon name="check" />
      <div>
        <strong>{text}</strong>
      </div>
    </li>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="migration-review-row">
      <div>
        <strong>{label}</strong>
      </div>
      <Status>{value}</Status>
    </div>
  );
}

function sourceNames(target: CalendarSource) {
  return target === "EXTERNAL"
    ? { source: "Agenda Atendly", target: "Minha Agenda" }
    : { source: "Minha Agenda", target: "Agenda Atendly" };
}

function publicTarget(source: CalendarSource): "atendly" | "external" {
  return source === "EXTERNAL" ? "external" : "atendly";
}

function requestError(error: unknown): string {
  return error instanceof BffHttpError
    ? error.message
    : "Não foi possível concluir esta etapa da migração.";
}

function entityLabel(value: string): string {
  return (
    {
      SERVICE: "Serviços",
      CUSTOMER: "Clientes",
      APPOINTMENT: "Agendamentos futuros",
      AVAILABILITY: "Disponibilidade",
    }[value] ?? "Dados da agenda"
  );
}

function statusLabel(status: Migration["status"]): string {
  return {
    PENDING: "Pendente",
    ANALYZING: "Analisando",
    RUNNING: "Em andamento",
    PARTIAL: "Parcial",
    COMPLETED: "Concluída",
    FAILED: "Falha",
  }[status];
}

function stepLabel(step: string | null): string {
  return (
    {
      QUEUED: "Aguardando execução",
      RECOVERING: "Retomando execução",
      ANALYZING_SOURCE: "Analisando a fonte",
      IMPORTING_DATA: "Importando dados",
      SOURCE_SWITCHED: "Fonte oficial alterada",
      REQUIRES_CORRECTION: "Correções necessárias",
      FAILED: "Falha no processo",
    }[step ?? ""] ?? "Processando migração"
  );
}

function migrationSummary(value: unknown):
  | {
      services?: number;
      customers?: number;
      appointments?: number;
      availability?: number;
    }
  | undefined {
  if (!value || typeof value !== "object") return undefined;
  const imported = (value as Record<string, unknown>).imported;
  if (!imported || typeof imported !== "object") return undefined;
  const record = imported as Record<string, unknown>;
  return {
    services: numberValue(record.services),
    customers: numberValue(record.customers),
    appointments: numberValue(record.appointments),
    availability: numberValue(record.availability),
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
