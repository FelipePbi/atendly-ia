"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/shared/layout/AppShell";
import { Icon, type IconName } from "@/shared/icons/Icon";
import type { MigrationScenario, MigrationTarget } from "./types";

function Stepper({ step }: { step: number }) {
  return (
    <ol className="migration-stepper" aria-label="Progresso da migração">
      {[
        ["Preparar", 1],
        ["Revisar", 2],
        ["Realizar corte", 3],
      ].map(([label, number]) => (
        <li
          className={clsx(
            Number(number) < step && "is-complete",
            number === step && "is-current",
          )}
          aria-current={number === step ? "step" : undefined}
          key={label}
        >
          <span className="migration-step-index">
            {Number(number) < step ? (
              <Icon name="check" />
            ) : (
              String(number).padStart(2, "0")
            )}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Route({
  source,
  target,
  complete,
}: {
  source: string;
  target: string;
  complete: boolean;
}) {
  return (
    <section className="migration-route" aria-label="Mudança da fonte oficial">
      <div className="migration-route-node">
        <span>{complete ? "Fonte anterior" : "Fonte atual"}</span>
        <strong>{source}</strong>
      </div>
      <Icon name="chevron-right" />
      <div className="migration-route-node">
        <span>{complete ? "Fonte oficial" : "Destino proposto"}</span>
        <strong>{target}</strong>
      </div>
    </section>
  );
}

function SideNotes({ children }: { children?: ReactNode }) {
  return (
    <aside className="migration-side" aria-label="Proteções da migração">
      <section className="migration-side-card">
        <h2>Proteções mantidas</h2>
        <ul className="migration-side-list">
          <li>
            <Icon name="shield" />
            <span>A fonte atual continua oficial durante a preparação.</span>
          </li>
          <li>
            <Icon name="check" />
            <span>A troca só ocorre após validar o destino.</span>
          </li>
          <li>
            <Icon name="chat" />
            <span>Conversas e histórico local permanecem na Atendly.</span>
          </li>
        </ul>
      </section>
      {children}
    </aside>
  );
}

function Status({
  icon,
  tone,
  children,
}: {
  icon?: IconName;
  tone?: "is-ready" | "is-warning" | "is-danger";
  children: ReactNode;
}) {
  return (
    <span className={clsx("migration-status", tone)}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

function Frame({
  title,
  description,
  step,
  back,
  badge,
  children,
}: {
  title: string;
  description: string;
  step: number;
  back: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="migration-page">
      <div className="migration-toolbar">
        <Link className="migration-back" href={back}>
          <Icon name="chevron-right" />
          Configurações
        </Link>
        <span className="migration-progress-label">MIGRAÇÃO ASSISTIDA</span>
      </div>
      <header className="migration-header">
        <div className="migration-header-copy">
          <p className="eyebrow">Fonte oficial da agenda</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {badge}
      </header>
      <Stepper step={step} />
      {children}
    </div>
  );
}

export function MigrationScreen({
  scenario,
  target: targetProp,
}: {
  scenario: MigrationScenario;
  target?: MigrationTarget;
}) {
  const target =
    targetProp ??
    (scenario.includes("external") || scenario === "to-external-intro"
      ? "external"
      : "atendly");
  const toExternal = target === "external";
  const sourceName = toExternal ? "Agenda Atendly" : "Minha Agenda";
  const targetName = toExternal ? "Minha Agenda" : "Agenda Atendly";
  const complete = scenario === "success";
  const activeSource = complete ? target : toExternal ? "atendly" : "external";
  const query = `?target=${target}`;
  const [resolutions, setResolutions] = useState<Record<number, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const route = (
    <Route source={sourceName} target={targetName} complete={complete} />
  );
  const settings = "/configuracoes/agenda";
  let content: ReactNode;

  if (scenario === "to-atendly-intro" || scenario === "to-external-intro") {
    const facts = toExternal
      ? [
          [
            "Minha Agenda passará a controlar os dados",
            "A troca só acontece depois da validação e do corte final.",
          ],
          [
            "A conta de destino precisa ser conectada",
            "Nenhum método específico de autenticação é antecipado nesta etapa.",
          ],
          [
            "A transferência pode não ser automática",
            "A Atendly mostra a capacidade real da integração antes de continuar.",
          ],
          [
            "Agendamentos futuros serão protegidos",
            "Conflitos precisam ser resolvidos antes da mudança.",
          ],
        ]
      : [
          [
            "Importação única, não sincronização contínua",
            "Os dados compatíveis são copiados para a Atendly durante a migração.",
          ],
          [
            "A Atendly controlará novos agendamentos",
            "A integração contínua é encerrada somente após o corte concluído.",
          ],
          [
            "Histórico e pendências serão revisados",
            "Itens incompatíveis aparecem antes da confirmação.",
          ],
          [
            "A fonte atual permanece ativa",
            "Minha Agenda continua oficial durante análise e preparação.",
          ],
        ];
    content = (
      <Frame
        title={`Migrar para ${targetName}`}
        description={
          toExternal
            ? "Antes de conectar o Minha Agenda, a Atendly verifica a conta de destino e o que a integração realmente permite transferir."
            : "Prepare a importação única e revise os dados antes de tornar a Agenda Atendly responsável por novos agendamentos."
        }
        step={1}
        back={settings}
      >
        {route}
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            <section className="migration-panel">
              <div className="migration-panel-header">
                <div>
                  <h2>O que muda</h2>
                  <p>Primeiro analisamos. Nada é trocado nesta etapa.</p>
                </div>
                <span className="badge">Sem corte agora</span>
              </div>
              <ul className="migration-facts">
                {facts.map(([title, detail]) => (
                  <li key={title}>
                    <Icon name="check" />
                    <div>
                      <strong>{title}</strong>
                      <span>{detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="migration-actions">
                <Link className="btn btn-secondary" href={settings}>
                  Manter fonte atual
                </Link>
                <Link
                  className="btn btn-primary"
                  href={`/migracao/diagnostico${query}`}
                >
                  {toExternal ? "Conectar e verificar" : "Preparar migração"}
                </Link>
              </div>
            </section>
          </div>
          <SideNotes />
        </div>
      </Frame>
    );
  } else if (scenario.startsWith("diagnosis")) {
    const unavailable = scenario === "diagnosis-external";
    const rows: [
      string,
      string,
      "is-ready" | "is-warning" | "is-danger",
      IconName,
    ][] = unavailable
      ? [
          ["Conta de destino", "Conexão necessária", "is-warning", "alert"],
          ["Serviços", "Revisão manual", "is-warning", "alert"],
          ["Clientes", "Capacidade não confirmada", "is-warning", "info"],
          [
            "Agendamentos futuros",
            "Não transferir automaticamente",
            "is-danger",
            "alert",
          ],
          [
            "Migração automática",
            "Indisponível nesta variação",
            "is-danger",
            "x",
          ],
        ]
      : toExternal
        ? [
            [
              "Conta de destino",
              "Validada para este diagnóstico",
              "is-ready",
              "check",
            ],
            ["Serviços", "Disponíveis para mapear", "is-ready", "check"],
            ["Clientes", "Disponíveis para mapear", "is-ready", "check"],
            [
              "Agendamentos futuros",
              "Revisão obrigatória",
              "is-warning",
              "alert",
            ],
            [
              "Transferência",
              "Disponível pela conexão validada",
              "is-ready",
              "check",
            ],
          ]
        : [
            ["Serviços", "Disponíveis para validar", "is-ready", "check"],
            ["Clientes", "Disponíveis para validar", "is-ready", "check"],
            [
              "Agendamentos futuros",
              "Revisão obrigatória",
              "is-warning",
              "alert",
            ],
            ["Disponibilidade", "Revisão obrigatória", "is-warning", "alert"],
            [
              "Importação para Atendly",
              "Prevista pelo produto",
              "is-ready",
              "check",
            ],
          ];
    content = (
      <Frame
        title="Verificar se a troca é segura"
        description="A fonte atual continua ativa enquanto serviços, clientes, agendamentos e disponibilidade são analisados."
        step={1}
        back={
          toExternal
            ? `/migracao/para-minha-agenda${query}`
            : `/migracao/para-atendly${query}`
        }
        badge={<span className="badge">Diagnóstico</span>}
      >
        {route}
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            <section className="migration-panel">
              <div className="migration-panel-header">
                <div>
                  <h2>
                    {unavailable
                      ? "Transferência automática indisponível"
                      : "Diagnóstico da origem e do destino"}
                  </h2>
                  <p>
                    A conexão informa a capacidade real antes de qualquer corte.
                  </p>
                </div>
                <Status
                  icon={unavailable ? "x" : "alert"}
                  tone={unavailable ? "is-danger" : "is-warning"}
                >
                  {unavailable ? "Não automatizar" : "Revisão necessária"}
                </Status>
              </div>
              <ul className="migration-diagnostics">
                {rows.map(([label, state, tone, icon]) => (
                  <li key={label}>
                    <div>
                      <strong>{label}</strong>
                      <small>
                        {label === "Agendamentos futuros"
                          ? "O corte não avança sem proteger horários já registrados."
                          : "A categoria será validada antes da mudança."}
                      </small>
                    </div>
                    <Status icon={icon} tone={tone}>
                      {state}
                    </Status>
                  </li>
                ))}
              </ul>
              {unavailable ? (
                <>
                  <div
                    className="alert banner-warning migration-inline-state"
                    role="status"
                  >
                    <Icon name="alert" />
                    <div>
                      <p className="alert-title">
                        A mudança não será automatizada
                      </p>
                      <p className="alert-text">
                        Prepare os dados no Minha Agenda e retorne à Atendly
                        para validar a nova fonte. A Agenda Atendly continua
                        oficial.
                      </p>
                    </div>
                  </div>
                  <div className="migration-actions">
                    <Link className="btn btn-primary" href={settings}>
                      Voltar para configurações
                    </Link>
                  </div>
                </>
              ) : (
                <div className="migration-actions">
                  <Link
                    className="btn btn-secondary"
                    href={
                      toExternal ? `/migracao/diagnostico${query}` : settings
                    }
                  >
                    {toExternal
                      ? "Ver integração sem transferência"
                      : "Cancelar preparação"}
                  </Link>
                  <Link
                    className="btn btn-primary"
                    href={`/migracao/conflitos${query}`}
                  >
                    Revisar conflitos
                  </Link>
                </div>
              )}
            </section>
          </div>
          <SideNotes>
            <section className="migration-side-card">
              <h2>Capacidade real</h2>
              <p>
                {toExternal
                  ? "A transferência para o Minha Agenda depende das operações oferecidas pela integração conectada."
                  : "A importação copia dados compatíveis uma única vez e não cria sincronização contínua."}
              </p>
            </section>
          </SideNotes>
        </div>
      </Frame>
    );
  } else if (scenario === "conflicts") {
    const conflicts = [
      ["Serviços", "Campos obrigatórios ausentes", "Manter para corrigir"],
      [
        "Clientes",
        "Possíveis duplicidades por telefone",
        "Mesclar após revisar",
      ],
      ["Agendamentos futuros", "Horários concorrentes", "Manter fonte atual"],
    ];
    const pending = 3 - Object.keys(resolutions).length;
    content = (
      <Frame
        title="Resolver diferenças antes do corte"
        description="Agrupe decisões por categoria para reduzir carga cognitiva e impedir alterações irreversíveis silenciosas."
        step={2}
        back={`/migracao/diagnostico${query}`}
      >
        {route}
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            <section className="migration-panel">
              <div className="migration-panel-header">
                <div>
                  <h2>Resolver por categoria</h2>
                  <p>
                    Somente categorias com atenção aparecem aqui. Revise a
                    recomendação antes de decidir.
                  </p>
                </div>
                <Status
                  icon={pending ? "alert" : "check"}
                  tone={pending ? "is-warning" : "is-ready"}
                >
                  {pending
                    ? `${pending} ${pending === 1 ? "categoria pendente" : "categorias pendentes"}`
                    : "Decisões revisadas"}
                </Status>
              </div>
              {conflicts.map(([title, detail, recommendation], index) => (
                <section className="migration-conflict-group" key={title}>
                  <div className="migration-conflict-head">
                    <div>
                      <h3>{title}</h3>
                      <p>{detail}</p>
                    </div>
                    <span className="badge">Recomendação segura</span>
                  </div>
                  <div
                    className="migration-conflict-options"
                    role="group"
                    aria-label={`Decisão para ${title}`}
                  >
                    {[
                      ["recommended", recommendation],
                      ["review", "Revisar individualmente"],
                    ].map(([value, label]) => (
                      <button
                        className={clsx(
                          "migration-option",
                          resolutions[index] === value && "is-selected",
                        )}
                        type="button"
                        aria-pressed={resolutions[index] === value}
                        onClick={() =>
                          setResolutions((current) => ({
                            ...current,
                            [index]: value,
                          }))
                        }
                        key={value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              <div className="migration-actions is-split">
                <span className="migration-actions-note">
                  Nenhuma decisão é aplicada antes da revisão final.
                </span>
                <Link
                  className="btn btn-primary"
                  href={pending ? "#" : `/migracao/revisao${query}`}
                  aria-disabled={pending > 0}
                  tabIndex={pending ? -1 : undefined}
                  onClick={(event) => pending > 0 && event.preventDefault()}
                >
                  Revisar mudança
                </Link>
              </div>
            </section>
          </div>
          <SideNotes />
        </div>
      </Frame>
    );
  } else if (scenario === "review") {
    const rows = [
      [
        "Nova fonte oficial",
        targetName,
        "A mudança só ocorre após o corte concluído.",
      ],
      [
        "Dados copiados",
        "Itens compatíveis e revisados",
        "Quantidades reais aparecem no resultado.",
      ],
      [
        "Histórico local",
        "Permanece na Atendly",
        "Conversas e histórico não são removidos.",
      ],
      [
        "Itens não transferidos",
        "Mantidos na fonte anterior",
        "Nada é excluído automaticamente.",
      ],
      [
        "Duração do corte",
        "Ainda não informada",
        "A estimativa só aparece quando o processo puder calculá-la.",
      ],
      [
        "Operação durante o corte",
        "Pode ficar temporariamente limitada",
        "O estado exato é comunicado antes de iniciar.",
      ],
    ];
    content = (
      <Frame
        title="Revisar a mudança da fonte oficial"
        description="A confirmação inicia o corte assistido. A fonte anterior não será excluída automaticamente."
        step={2}
        back={`/migracao/conflitos${query}`}
      >
        {route}
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            <section className="migration-panel">
              <div className="migration-panel-header">
                <div>
                  <h2>Revisão consciente</h2>
                  <p>
                    Confira o destino e o impacto operacional antes de iniciar.
                  </p>
                </div>
                <Status icon="shield" tone="is-warning">
                  Sem exclusão automática
                </Status>
              </div>
              <div className="migration-review">
                {rows.map(([label, value, help]) => (
                  <div className="migration-review-row" key={label}>
                    <div>
                      <strong>{label}</strong>
                      <small>{help}</small>
                    </div>
                    <Status>{value}</Status>
                  </div>
                ))}
              </div>
              <label className="check migration-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span className="check-box" aria-hidden="true" />
                <span className="check-copy">
                  <strong>Revisei a nova fonte e o impacto do corte</strong>
                  <span>
                    Se a validação final falhar, {sourceName} continua oficial.
                  </span>
                </span>
              </label>
              <div className="migration-actions">
                <Link
                  className="btn btn-secondary"
                  href={`/migracao/conflitos${query}`}
                >
                  Voltar aos conflitos
                </Link>
                <Link
                  className="btn btn-primary"
                  href={confirmed ? `/migracao/progresso${query}` : "#"}
                  aria-disabled={!confirmed}
                  tabIndex={confirmed ? undefined : -1}
                  onClick={(event) => !confirmed && event.preventDefault()}
                >
                  Iniciar migração
                </Link>
              </div>
            </section>
          </div>
          <SideNotes />
        </div>
      </Frame>
    );
  } else if (scenario === "progress") {
    content = (
      <Frame
        title="Validando a nova fonte"
        description="O corte protege agendamentos e mantém a fonte anterior como referência até a conclusão."
        step={3}
        back={`/migracao/revisao${query}`}
        badge={
          <span className="badge badge-attention">Mudanças limitadas</span>
        }
      >
        {route}
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            <section
              className="migration-process"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="migration-process-icon">
                <Icon name="refresh" />
              </span>
              <h2>Migração em andamento</h2>
              <p>
                A troca ainda não foi concluída. Evite alterar dados em{" "}
                {sourceName} enquanto os agendamentos futuros são validados.
              </p>
              <div
                className="migration-process-track"
                role="progressbar"
                aria-label="Progresso da migração"
                aria-valuetext="Validando agendamentos futuros"
              >
                <span className="is-complete" />
                <span className="is-complete" />
                <span className="is-active" />
                <span />
              </div>
              <p className="migration-current-step">
                Etapa atual: validar agendamentos futuros
              </p>
              <div className="alert banner-warning migration-inline-state">
                <Icon name="alert" />
                <div>
                  <p className="alert-title">
                    Operações temporariamente limitadas
                  </p>
                  <p className="alert-text">
                    Não confirme novas mudanças na fonte de agenda até o
                    resultado. Se o corte falhar, {sourceName} permanece
                    oficial.
                  </p>
                </div>
              </div>
              <div className="migration-actions">
                <Link className="btn btn-secondary" href="/inicio">
                  Acompanhar em segundo plano
                </Link>
                <Link
                  className="btn btn-primary"
                  href={`/migracao/sucesso${query}`}
                >
                  Atualizar andamento
                </Link>
              </div>
            </section>
          </div>
          <SideNotes />
        </div>
      </Frame>
    );
  } else {
    const success = scenario === "success";
    const partial = scenario === "partial";
    const rows = success
      ? [
          ["Fonte oficial", targetName, "Corte concluído"],
          [
            "Itens transferidos",
            "Resultado real do processo",
            "Valores não são simulados",
          ],
          ["Histórico local", "Preservado na Atendly", "Conversas mantidas"],
          ["Pendências críticas", "Nenhuma neste estado", "Pronto para testar"],
        ]
      : partial
        ? [
            ["Fonte oficial", sourceName, "Sem troca até corrigir"],
            [
              "Requisitos mínimos",
              "Ainda não validados",
              "Correção obrigatória",
            ],
            ["Itens revisados", "Preservados", "Sem exclusão automática"],
            [
              "Próximo passo",
              "Resolver pendências",
              "Nova validação necessária",
            ],
          ]
        : [
            ["Fonte oficial", sourceName, "Mantida sem alteração"],
            ["Corte", "Não concluído", "Sem confirmação de sucesso"],
            ["Dados anteriores", "Preservados", "Nada foi excluído"],
            ["Identificador", "Não disponível", "Exibido quando fornecido"],
          ];
    content = (
      <Frame
        title={
          success
            ? "Migração concluída"
            : partial
              ? "Resultado parcial"
              : "Falha na migração"
        }
        description={
          success
            ? "A nova fonte foi ativada somente depois da validação bem-sucedida."
            : "A fonte anterior continua oficial enquanto o problema é resolvido."
        }
        step={3}
        back={settings}
      >
        {route}
        <div className="migration-layout migration-content">
          <div className="migration-stack">
            <section className="migration-result">
              <span
                className={clsx(
                  "migration-result-mark",
                  partial && "is-warning",
                  !success && !partial && "is-danger",
                )}
              >
                <Icon name={success ? "check" : partial ? "alert" : "x"} />
              </span>
              <span
                className={clsx(
                  "badge",
                  success
                    ? "badge-success"
                    : partial
                      ? "badge-attention"
                      : "badge-danger",
                )}
              >
                {success ? "Concluída" : partial ? "Ação necessária" : "Falha"}
              </span>
              <h2>
                {success
                  ? `${targetName} agora é a fonte oficial`
                  : partial
                    ? "A migração precisa de correções"
                    : "Não foi possível concluir a migração"}
              </h2>
              <p>
                {success
                  ? "A validação e o corte foram concluídos. Novos agendamentos passam a ser confirmados no destino."
                  : partial
                    ? `Os requisitos mínimos ainda não foram validados. ${sourceName} continua oficial e nenhum sucesso foi simulado.`
                    : `${sourceName} continua como fonte oficial. Nenhum horário foi apresentado como transferido ou confirmado.`}
              </p>
              <div className="migration-review">
                {rows.map(([label, value, help]) => (
                  <div className="migration-review-row" key={label}>
                    <div>
                      <strong>{label}</strong>
                      <small>{help}</small>
                    </div>
                    <Status
                      tone={
                        partial && label === "Requisitos mínimos"
                          ? "is-warning"
                          : !success && !partial && label === "Corte"
                            ? "is-danger"
                            : undefined
                      }
                    >
                      {value}
                    </Status>
                  </div>
                ))}
              </div>
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
                    <Link className="btn btn-secondary" href={settings}>
                      Voltar para configurações
                    </Link>
                    <Link
                      className="btn btn-primary"
                      href={
                        partial
                          ? `/migracao/conflitos${query}`
                          : `/migracao/progresso${query}`
                      }
                    >
                      {partial ? "Revisar pendências" : "Tentar novamente"}
                    </Link>
                  </>
                )}
              </div>
            </section>
          </div>
          <SideNotes />
        </div>
      </Frame>
    );
  }

  return (
    <AppShell active="configuracoes" module="migration" source={activeSource}>
      {content}
    </AppShell>
  );
}
