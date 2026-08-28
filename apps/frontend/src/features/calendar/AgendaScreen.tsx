"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { AppShell } from "@/shared/layout/AppShell";
import { Dialog } from "@/shared/ui/Dialog";
import { Icon } from "@/shared/icons/Icon";
import { mockAppointments } from "@/mocks/data/appointments";
import type { AgendaScenario, Appointment } from "./types";

function subscribeCompact(callback: () => void) {
  const query = window.matchMedia("(max-width: 780px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function useCompactAgenda() {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia("(max-width: 780px)").matches,
    () => false,
  );
}

function SourceStrip({ external = false }: { external?: boolean }) {
  return (
    <section className="agenda-source-strip">
      <div className="agenda-source-copy">
        <span className="agenda-source-icon">
          <Icon name={external ? "link" : "calendar"} />
        </span>
        <div>
          <strong>
            {external ? "Minha Agenda" : "Agenda Atendly"} é a fonte oficial
          </strong>
          <span>
            {external
              ? "A Atendly exibe os dados disponíveis da conexão."
              : "Disponibilidade e alterações são controladas aqui."}
          </span>
        </div>
      </div>
      <span className={external ? "badge" : "badge badge-success"}>
        {external ? "Última atualização · —" : "Operacional"}
      </span>
    </section>
  );
}

function AppointmentItem({
  item,
  external = false,
}: {
  item: Appointment;
  external?: boolean;
}) {
  const content = (
    <>
      <time className="agenda-item-time">{item.start}</time>
      <span className="agenda-item-copy">
        <strong>{item.customer}</strong>
        <span>
          {item.service} · {item.duration} min
        </span>
        <span className="agenda-item-signals">
          <span className={item.origin === "ai" ? "badge badge-ai" : "badge"}>
            {item.origin === "ai"
              ? "Criado pela IA"
              : item.origin === "external"
                ? "Origem externa"
                : "Criado manualmente"}
          </span>
          {!external && <span className="badge badge-success">Confirmado</span>}
          {external && <span className="badge">Minha Agenda</span>}
        </span>
      </span>
    </>
  );
  return external ? (
    <div className="agenda-item is-readonly">{content}</div>
  ) : (
    <Link className="agenda-item" href="/agenda/agendamento">
      {content}
    </Link>
  );
}

function WeekPanel({ filter }: { filter: string }) {
  const events = [
    {
      day: 0,
      start: 1,
      time: "09:00",
      customer: "Cliente de demonstração",
      origin: "ai",
    },
    {
      day: 1,
      start: 2.5,
      time: "10:30",
      customer: "Cliente de demonstração",
      origin: "manual",
    },
    {
      day: 2,
      start: 6.5,
      time: "14:30",
      customer: "Contato de demonstração",
      origin: "ai",
    },
    {
      day: 3,
      start: 3,
      time: "11:00",
      customer: "Cliente de demonstração",
      origin: "manual",
    },
  ];
  const visible = events.filter(
    (item) =>
      filter === "all" ||
      filter === "confirmed" ||
      filter === "service-demo" ||
      item.origin === filter,
  );
  return (
    <section className="agenda-calendar agenda-panel" role="tabpanel">
      <div className="agenda-week-scroll">
        <div className="week-board">
          <div className="week-header">
            <span className="week-header-spacer" />
            {[
              ["TER", "25"],
              ["QUA", "26"],
              ["QUI", "27"],
              ["SEX", "28"],
              ["SÁB", "29"],
              ["DOM", "30"],
              ["SEG", "31"],
            ].map(([day, date], index) => (
              <span
                className={clsx("week-day-head", index === 0 && "is-today")}
                key={day}
              >
                <span>{day}</span>
                <strong>{date}</strong>
              </span>
            ))}
          </div>
          <div className="week-body">
            <div className="week-time-axis">
              {[
                "08:00",
                "09:00",
                "10:00",
                "11:00",
                "12:00",
                "13:00",
                "14:00",
                "15:00",
                "16:00",
                "17:00",
              ].map((time) => (
                <div className="week-time" key={time}>
                  {time}
                </div>
              ))}
            </div>
            <div className="week-days">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <div className="week-day" key={day}>
                  {visible
                    .filter((item) => item.day === day)
                    .map((item) => (
                      <Link
                        className={clsx(
                          "week-appointment",
                          item.origin === "ai" && "is-ai",
                        )}
                        href="/agenda/agendamento"
                        style={
                          {
                            "--start": item.start,
                            "--span": 1,
                          } as React.CSSProperties
                        }
                        key={`${item.day}-${item.time}`}
                      >
                        <span className="appointment-time">{item.time}</span>
                        <strong>{item.customer}</strong>
                        <span>
                          {item.origin === "ai" ? "IA" : "Manual"} · Serviço de
                          demonstração
                        </span>
                      </Link>
                    ))}
                  {day === 0 && filter === "all" && (
                    <div
                      className="week-appointment is-blocked"
                      style={
                        { "--start": 5, "--span": 1 } as React.CSSProperties
                      }
                    >
                      <span className="appointment-time">13:00</span>
                      <strong>Horário bloqueado</strong>
                      <span>Intervalo pessoal</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DayPanel({
  external = false,
  filter,
}: {
  external?: boolean;
  filter: string;
}) {
  const [selectedDay, setSelectedDay] = useState(1);
  const dayLabels = [
    "Segunda-feira, 24 de agosto",
    "Terça-feira, 25 de agosto",
    "Quarta-feira, 26 de agosto",
    "Quinta-feira, 27 de agosto",
    "Sexta-feira, 28 de agosto",
    "Sábado, 29 de agosto",
    "Domingo, 30 de agosto",
  ];
  const items = (
    external ? mockAppointments.slice(0, 2) : mockAppointments
  ).filter(
    (item) =>
      filter === "all" ||
      filter === "confirmed" ||
      filter === "service-demo" ||
      item.origin === filter,
  );
  return (
    <section
      className="agenda-calendar agenda-day-panel agenda-panel"
      role="tabpanel"
    >
      <div className="agenda-date-strip">
        {[
          ["SEG", "24"],
          ["TER", "25"],
          ["QUA", "26"],
          ["QUI", "27"],
          ["SEX", "28"],
          ["SÁB", "29"],
          ["DOM", "30"],
        ].map(([day, date], index) => (
          <button
            className={clsx(
              "agenda-date-button",
              index === selectedDay && "is-selected",
            )}
            type="button"
            aria-pressed={index === selectedDay}
            onClick={() => setSelectedDay(index)}
            key={day}
          >
            <span>{day}</span>
            <strong>{date}</strong>
          </button>
        ))}
      </div>
      <div className="agenda-day-summary">
        <span>{dayLabels[selectedDay]}</span>
        <strong>
          {external ? "Dados da conexão" : "3 agendamentos · 1 bloqueio"}
        </strong>
      </div>
      <div className="agenda-day-list">
        {items
          .filter((item) => item.start < "13:00")
          .map((item) => (
            <AppointmentItem item={item} external={external} key={item.id} />
          ))}
        {!external && filter === "all" && (
          <div className="agenda-item is-blocked">
            <time className="agenda-item-time">13:00</time>
            <span className="agenda-item-copy">
              <strong>Horário bloqueado</strong>
              <span>Intervalo pessoal · exemplo</span>
              <span className="agenda-item-signals">
                <span className="badge">Bloqueio</span>
              </span>
            </span>
          </div>
        )}
        {items
          .filter((item) => item.start >= "13:00")
          .map((item) => (
            <AppointmentItem item={item} external={external} key={item.id} />
          ))}
      </div>
    </section>
  );
}

function AgendaMain({
  scenario,
}: {
  scenario:
    | "atendly"
    | "external"
    | "empty"
    | "loading"
    | "integration-error"
    | "sync-conflict";
}) {
  const external =
    scenario === "external" ||
    scenario === "integration-error" ||
    scenario === "sync-conflict";
  const [view, setView] = useState<"day" | "week" | "list">(
    external ? "day" : "week",
  );
  const compact = useCompactAgenda();
  const visibleView = compact && view === "week" ? "day" : view;
  const [filter, setFilter] = useState("all");
  const [externalFeedback, setExternalFeedback] = useState("");
  const [periodOffset, setPeriodOffset] = useState(0);
  const periodTitle = external
    ? periodOffset === 0
      ? "Terça-feira, 25 de agosto"
      : periodOffset < 0
        ? "Segunda-feira, 24 de agosto"
        : "Quarta-feira, 26 de agosto"
    : periodOffset === 0
      ? "25 a 31 de agosto de 2026"
      : periodOffset < 0
        ? "18 a 24 de agosto de 2026"
        : "1 a 7 de setembro de 2026";
  return (
    <AppShell
      active="agenda"
      module="agenda"
      source={external ? "external" : "atendly"}
    >
      <div className="agenda-page">
        <header className="agenda-page-header">
          <div>
            <h1>
              {scenario === "integration-error"
                ? "Agenda indisponível"
                : scenario === "sync-conflict"
                  ? "Agenda com conflito"
                  : "Agenda"}
            </h1>
            <p>
              {external
                ? "Consulte os compromissos recebidos da sua fonte oficial."
                : scenario === "empty"
                  ? "Consulte compromissos e disponibilidade."
                  : scenario === "loading"
                    ? "Carregando compromissos e disponibilidade."
                    : "Organize compromissos, disponibilidade e bloqueios em uma única visão."}
            </p>
          </div>
          <div className="agenda-page-actions">
            {external ? (
              <button
                className="btn btn-primary"
                type="button"
                aria-label="Editar no Minha Agenda"
                onClick={() =>
                  setExternalFeedback(
                    "Não é possível abrir a Minha Agenda neste protótipo. Nenhum dado foi alterado.",
                  )
                }
              >
                <Icon name="external" />
                <span>Editar no Minha Agenda</span>
              </button>
            ) : scenario === "atendly" ? (
              <>
                <Link
                  className="btn btn-secondary"
                  href="/agenda/bloquear"
                  aria-label="Bloquear horário"
                >
                  <Icon name="lock" />
                  <span>Bloquear horário</span>
                </Link>
                <Link
                  className="btn btn-primary"
                  href="/agenda/novo"
                  aria-label="Novo agendamento"
                >
                  <Icon name="plus" />
                  <span>Novo agendamento</span>
                </Link>
              </>
            ) : null}
          </div>
        </header>
        <SourceStrip external={external} />
        {(scenario === "atendly" || scenario === "external") && (
          <div className="alert alert-info agenda-demo-note" role="note">
            <Icon name="info" />
            <div>
              <p className="alert-title">Conteúdo demonstrativo</p>
              <p className="alert-text">
                Os horários abaixo validam a interface e não representam
                compromissos reais.
              </p>
            </div>
          </div>
        )}
        {scenario === "integration-error" && (
          <div className="alert alert-error agenda-demo-note" role="alert">
            <Icon name="alert" />
            <div>
              <p className="alert-title">
                Não foi possível consultar o Minha Agenda
              </p>
              <p className="alert-text">
                Os horários podem estar desatualizados. Confirme no Minha Agenda
                antes de orientar um cliente.
              </p>
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() =>
                setExternalFeedback(
                  "A conexão continua indisponível. Os dados exibidos não foram alterados.",
                )
              }
            >
              Tentar novamente
            </button>
          </div>
        )}
        {scenario === "sync-conflict" && (
          <div className="banner banner-warning agenda-demo-note" role="alert">
            <Icon name="alert" />
            <div>
              <p className="banner-title">Há um conflito de sincronização</p>
              <p className="banner-text">
                Dois compromissos externos ocupam o mesmo horário. Revise a
                fonte oficial antes de fazer alterações.
              </p>
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() =>
                setExternalFeedback(
                  "Abra a Minha Agenda para revisar o conflito. Nenhum dado foi alterado aqui.",
                )
              }
            >
              Revisar no Minha Agenda
            </button>
          </div>
        )}
        {externalFeedback && (
          <p className="agenda-form-status" role="status" aria-live="polite">
            {externalFeedback}
          </p>
        )}
        {scenario !== "loading" &&
          scenario !== "empty" &&
          scenario !== "integration-error" && (
            <section className={clsx("agenda-next", external && "is-readonly")}>
              <span className="agenda-next-icon">
                <Icon name="clock" />
              </span>
              <span className="agenda-next-copy">
                <span>Próximo atendimento</span>
                <strong>Hoje · 09:00</strong>
                <small>Cliente de demonstração · Serviço de demonstração</small>
              </span>
              <span className={external ? "badge" : "badge badge-ai"}>
                {external ? "Minha Agenda" : "Criado pela IA"}
              </span>
              {!external && <Icon name="chevron-right" />}
            </section>
          )}
        {scenario === "loading" ? (
          <div className="agenda-loading-shell" aria-busy="true">
            <div className="agenda-loading-header">
              {[0, 1, 2, 3].map((item) => (
                <span className="skeleton skeleton-line" key={item} />
              ))}
            </div>
            <div className="agenda-loading-grid">
              {[0, 1, 2, 3, 4].map((item) => (
                <div className="agenda-loading-column" key={item}>
                  {item === 0 ? (
                    <>
                      <span className="skeleton skeleton-line" />
                      <span className="skeleton skeleton-line" />
                      <span className="skeleton skeleton-line" />
                    </>
                  ) : (
                    Array.from({
                      length: item === 1 || item === 3 ? 2 : 1,
                    }).map((_, block) => (
                      <span
                        className="skeleton agenda-loading-block"
                        key={block}
                      />
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : scenario === "empty" ? (
          <section className="agenda-state-surface">
            <div className="empty-state">
              <div className="state-icon">
                <Icon name="calendar" />
              </div>
              <h2>Ainda não há agendamentos</h2>
              <p>
                Agendamentos criados manualmente ou pela Atendly aparecerão
                aqui.
              </p>
              <div className="agenda-state-actions">
                <Link className="btn btn-primary" href="/agenda/novo">
                  Criar agendamento
                </Link>
                <Link className="btn btn-secondary" href="/agenda/bloquear">
                  Bloquear horário
                </Link>
              </div>
            </div>
          </section>
        ) : scenario === "integration-error" ? (
          <div className="agenda-readonly-list">
            <div className="agenda-day-summary">
              <span>Últimos dados recebidos</span>
              <strong>Atualização não informada</strong>
            </div>
            <div className="agenda-day-list">
              {mockAppointments.slice(0, 2).map((item) => (
                <AppointmentItem item={item} external key={item.id} />
              ))}
            </div>
            <div className="agenda-readonly-footer">
              <span>
                Somente leitura enquanto a conexão estiver indisponível.
              </span>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() =>
                  setExternalFeedback(
                    "Não é possível abrir a Minha Agenda neste protótipo. Nenhum dado foi alterado.",
                  )
                }
              >
                Editar no Minha Agenda
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="agenda-command-bar">
              <div className="agenda-date-tools">
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Período anterior"
                  onClick={() => setPeriodOffset(-1)}
                >
                  <Icon name="chevron-left" />
                </button>
                <strong className="agenda-date-title">{periodTitle}</strong>
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Próximo período"
                  onClick={() => setPeriodOffset(1)}
                >
                  <Icon name="chevron-right" />
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setPeriodOffset(0)}
                >
                  Hoje
                </button>
              </div>
              <div className="agenda-view-tabs">
                <div className="tab-list" role="tablist">
                  {(
                    ["day", ...(external ? [] : ["week"]), "list"] as const
                  ).map((item, index, items) => (
                    <button
                      className={clsx(
                        "tab",
                        item === "week" && "agenda-tab-week",
                        visibleView === item && "is-active",
                      )}
                      type="button"
                      role="tab"
                      aria-selected={visibleView === item}
                      tabIndex={visibleView === item ? 0 : -1}
                      onClick={() => setView(item as "day" | "week" | "list")}
                      onKeyDown={(event) => {
                        const direction =
                          event.key === "ArrowRight"
                            ? 1
                            : event.key === "ArrowLeft"
                              ? -1
                              : event.key === "Home"
                                ? -index
                                : event.key === "End"
                                  ? items.length - 1 - index
                                  : 0;
                        if (!direction) return;
                        event.preventDefault();
                        const nextIndex =
                          (index + direction + items.length) % items.length;
                        setView(items[nextIndex] as "day" | "week" | "list");
                        const tabs =
                          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                            '[role="tab"]',
                          );
                        tabs?.[nextIndex]?.focus();
                      }}
                      key={item}
                    >
                      {item === "day"
                        ? "Dia"
                        : item === "week"
                          ? "Semana"
                          : "Lista"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="agenda-filters">
              {[
                ["all", "Todos"],
                ["confirmed", "Confirmados"],
                ["ai", "Criados pela IA"],
                ["service-demo", "Serviço de demonstração"],
              ].map(([value, label]) => (
                <button
                  className={clsx(
                    "agenda-filter",
                    filter === value && "is-active",
                  )}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  key={value}
                >
                  {label}
                </button>
              ))}
            </div>
            {visibleView === "week" ? (
              <WeekPanel filter={filter} />
            ) : (
              <DayPanel external={external} filter={filter} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function FlowHeader({
  title,
  description,
  back = "/agenda",
}: {
  title: string;
  description: string;
  back?: string;
}) {
  return (
    <header className="agenda-flow-header">
      <Link className="icon-btn" href={back} aria-label="Voltar">
        <Icon name="chevron-left" />
      </Link>
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <span className="badge badge-success">Agenda Atendly</span>
    </header>
  );
}

function AppointmentForm({
  mode,
}: {
  mode: "new" | "reschedule" | "block-time";
}) {
  const [success, setSuccess] = useState(false);
  const [service, setService] = useState("");
  const [time, setTime] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setSuccess(true);
  }
  if (success)
    return (
      <div className="agenda-success-panel" role="status">
        <div className="state-icon">
          <Icon name="check" />
        </div>
        <h2>
          {mode === "block-time"
            ? "Horário bloqueado"
            : mode === "reschedule"
              ? "Novo horário confirmado"
              : "Agendamento registrado no exemplo"}
        </h2>
        <p>
          A disponibilidade foi validada novamente antes da confirmação na
          Agenda Atendly.
        </p>
        <Link className="btn btn-primary" href="/agenda/agendamento">
          Ver agendamento
        </Link>
      </div>
    );
  if (mode === "reschedule")
    return (
      <>
        <div className="agenda-flow-layout">
          <form className="agenda-form-card" onSubmit={submit}>
            <h2>Novo horário</h2>
            <div className="agenda-current-slot">
              <span>Horário atual</span>
              <strong>Quarta-feira, 26 de agosto · 10:30–11:30</strong>
            </div>
            <div className="agenda-form-grid">
              <label className="field is-wide">
                <span className="label">Nova data</span>
                <input className="input" type="date" required />
              </label>
              <fieldset className="field is-wide">
                <legend className="label">Novo horário disponível</legend>
                <div className="agenda-time-options">
                  {["09:00", "13:30", "15:00"].map((value) => (
                    <label className="agenda-time-option" key={value}>
                      <input
                        type="radio"
                        name="time"
                        value={value}
                        required={value === "09:00"}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <p className="field-help">
              Este protótipo não presume envio automático de mensagem ao
              cliente.
            </p>
            <div className="agenda-form-footer">
              <Link className="btn btn-secondary" href="/agenda/agendamento">
                Manter horário atual
              </Link>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setReviewOpen(true)}
              >
                Revisar alteração
              </button>
            </div>
          </form>
          <aside className="agenda-summary-card">
            <h2>O que muda</h2>
            <div className="agenda-summary-list">
              {[
                ["Cliente", "Cliente de demonstração"],
                ["Serviço", "Serviço de demonstração"],
                ["Horário atual", "26 ago · 10:30"],
                ["Novo horário", "Selecione data e horário"],
              ].map(([label, value]) => (
                <div className="agenda-summary-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </aside>
        </div>
        <Dialog
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          eyebrow="Revisar alteração"
          title="Confirmar novo horário?"
        >
          <p className="small muted">
            O horário anterior só será liberado depois que o novo registro for
            concluído.
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setReviewOpen(false)}
            >
              Voltar e revisar
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setSuccess(true)}
            >
              Reagendar atendimento
            </button>
          </div>
        </Dialog>
      </>
    );
  if (mode === "block-time")
    return (
      <div className="agenda-flow-layout">
        <form className="agenda-form-card agenda-block-form" onSubmit={submit}>
          <h2>Defina o período</h2>
          <p className="agenda-form-intro">
            Escolha uma data e um intervalo contínuo para impedir novos
            agendamentos.
          </p>
          <div className="agenda-form-grid">
            <label className="field is-wide">
              <span className="label">Data do bloqueio</span>
              <input className="input" type="date" required />
            </label>
            <label className="field">
              <span className="label">Início</span>
              <input
                className="input"
                type="time"
                defaultValue="13:00"
                required
              />
            </label>
            <label className="field">
              <span className="label">Término</span>
              <input
                className="input"
                type="time"
                defaultValue="14:00"
                required
              />
            </label>
            <label className="field is-wide">
              <span className="label">
                Motivo <span className="muted">(opcional)</span>
              </span>
              <input
                className="input"
                maxLength={80}
                placeholder="Ex.: intervalo pessoal"
              />
            </label>
          </div>
          <div className="agenda-form-footer">
            <Link className="btn btn-secondary" href="/agenda">
              Cancelar
            </Link>
            <button className="btn btn-primary" type="submit">
              Bloquear horário
            </button>
          </div>
        </form>
        <aside className="agenda-summary-card agenda-block-summary">
          <h2>Antes de salvar</h2>
          <div className="agenda-summary-list">
            {[
              ["Data", "26 de agosto"],
              ["Período", "13:00–14:00"],
              ["Motivo", "Não informado"],
              ["Fonte oficial", "Agenda Atendly"],
            ].map(([label, value]) => (
              <div className="agenda-summary-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="agenda-summary-note">
            O bloqueio vale somente para este período e não altera compromissos
            existentes.
          </p>
        </aside>
      </div>
    );
  return (
    <div className="agenda-flow-layout">
      <form className="agenda-form-card" onSubmit={submit}>
        <h2>Dados do agendamento</h2>
        <div className="agenda-form-grid">
          <>
            <label className="field is-wide">
              <span className="label">Cliente</span>
              <select className="input select" required defaultValue="">
                <option value="">Selecione um cliente</option>
                <option value="demo">Cliente de demonstração</option>
                <option value="new">Cadastrar novo cliente</option>
              </select>
            </label>
            <label className="field is-wide">
              <span className="label">Serviço</span>
              <select
                className="input select"
                required
                value={service}
                onChange={(event) => setService(event.target.value)}
              >
                <option value="">Selecione um serviço</option>
                <option value="demo">Serviço de demonstração · 60 min</option>
              </select>
              <span className="field-help">
                Somente serviços ativos podem gerar novos agendamentos.
              </span>
            </label>
          </>
          <label className="field">
            <span className="label">Data</span>
            <input
              className="input"
              type="date"
              defaultValue="2026-08-25"
              required
            />
          </label>
          <fieldset className="field is-wide" disabled={!service}>
            <legend className="label">Horário disponível</legend>
            <div className="agenda-time-options">
              {["09:00", "10:30", "14:00"].map((value) => (
                <label className="agenda-time-option" key={value}>
                  <input
                    type="radio"
                    name="time"
                    value={value}
                    checked={time === value}
                    onChange={() => setTime(value)}
                    required
                  />
                  <span>{value}</span>
                </label>
              ))}
            </div>
            <span className="field-help">
              Escolha o serviço para consultar os horários do exemplo.
            </span>
          </fieldset>
          <label className="field is-wide">
            <span className="label">
              Observação <span className="muted">(opcional)</span>
            </span>
            <textarea className="input" maxLength={240} />
          </label>
        </div>
        <div className="agenda-form-footer">
          <Link className="btn btn-secondary" href="/agenda">
            Cancelar
          </Link>
          <button className="btn btn-primary" type="submit">
            Criar agendamento
          </button>
        </div>
      </form>
      <aside className="agenda-summary-card">
        <h2>Resumo</h2>
        <div className="agenda-summary-list">
          <div className="agenda-summary-row">
            <span>Cliente</span>
            <strong>Escolha um cliente</strong>
          </div>
          <div className="agenda-summary-row">
            <span>Serviço</span>
            <strong>Escolha um serviço</strong>
          </div>
          <div className="agenda-summary-row">
            <span>Data</span>
            <strong>Escolha uma data</strong>
          </div>
          <div className="agenda-summary-row">
            <span>Horário</span>
            <strong>{time || "Escolha um horário"}</strong>
          </div>
          <div className="agenda-summary-row">
            <span>Valor registrado</span>
            <strong>Não informado</strong>
          </div>
        </div>
        <p className="field-help">
          Este resumo será revisado antes da confirmação.
        </p>
      </aside>
    </div>
  );
}

function AppointmentDetail() {
  const summary = [
    ["Cliente", "Cliente de demonstração"],
    ["Telefone", "(11) 99999-1234"],
    ["Serviço", "Serviço de demonstração"],
    ["Duração", "60 min"],
    ["Preço registrado", "Não informado"],
    ["Origem", "Criado pela IA · exemplo"],
    ["Observações", "Nenhuma observação"],
  ];
  return (
    <AppShell active="agenda" module="agenda">
      <div className="agenda-flow-page">
        <FlowHeader
          title="Detalhe do agendamento"
          description="Informações registradas na fonte oficial."
        />
        <div className="alert alert-info agenda-demo-note" role="note">
          <Icon name="info" />
          <div>
            <p className="alert-title">Conteúdo demonstrativo</p>
            <p className="alert-text">
              Os horários abaixo validam a interface e não representam
              compromissos reais.
            </p>
          </div>
        </div>
        <section className="agenda-detail-hero">
          <div>
            <span className="badge badge-success">
              <span className="badge-dot" aria-hidden="true" />
              Confirmado · exemplo
            </span>
            <h2 className="agenda-detail-date">
              Quarta-feira, 26 de agosto · 10:30
            </h2>
            <p className="agenda-detail-service">
              Serviço de demonstração · 60 min
            </p>
          </div>
          <div className="agenda-detail-actions">
            <Link className="btn btn-primary" href="/agenda/reagendar">
              Reagendar
            </Link>
            <Link className="btn btn-secondary" href="/conversas/ai-active">
              Abrir conversa
            </Link>
          </div>
        </section>
        <div className="agenda-detail-grid">
          <section className="agenda-detail-section">
            <h2>Resumo</h2>
            <div className="agenda-summary-list">
              {summary.map(([label, value]) => (
                <div className="agenda-summary-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="agenda-danger-zone">
              <p>
                O cancelamento preserva o histórico e só libera o horário após
                conclusão.
              </p>
              <Link className="btn btn-danger" href="/agenda/cancelar">
                Cancelar agendamento
              </Link>
            </div>
          </section>
          <aside className="agenda-detail-section">
            <h2>Histórico</h2>
            <div className="agenda-history">
              <div className="agenda-history-item">
                <strong>Agendamento confirmado</strong>
                <span>Registro concluído na Agenda Atendly · exemplo</span>
              </div>
              <div className="agenda-history-item">
                <strong>Criado pela IA</strong>
                <span>Origem identificada para auditoria · exemplo</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function CancelAppointment() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  return (
    <AppShell active="agenda" module="agenda">
      <div className="agenda-flow-page">
        <FlowHeader
          title="Cancelar agendamento"
          description="Revise o compromisso antes de cancelar."
          back="/agenda/agendamento"
        />
        {!cancelled ? (
          <div className="agenda-flow-layout">
            <form className="agenda-form-card">
              <h2>Confirmação</h2>
              <div className="agenda-current-slot">
                <span>Agendamento</span>
                <strong>Quarta-feira, 26 de agosto · 10:30</strong>
                <span>Cliente de demonstração · Serviço de demonstração</span>
              </div>
              <label className="field">
                <span className="label">
                  Motivo <span className="muted">(opcional)</span>
                </span>
                <select className="input select" name="reason" defaultValue="">
                  <option value="">Não informar</option>
                  <option>Pedido do cliente</option>
                  <option>Imprevisto do negócio</option>
                  <option>Outro motivo</option>
                </select>
              </label>
              <div className="alert alert-info" role="note">
                <Icon name="info" />
                <div>
                  <p className="alert-title">Notificação ao cliente</p>
                  <p className="alert-text">
                    Este protótipo não presume envio automático. Confirme pelo
                    canal habitual quando necessário.
                  </p>
                </div>
              </div>
              <div className="agenda-form-footer">
                <Link className="btn btn-secondary" href="/agenda/agendamento">
                  Manter agendamento
                </Link>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => setDialogOpen(true)}
                >
                  Cancelar agendamento
                </button>
              </div>
            </form>
            <aside className="agenda-summary-card">
              <h2>Após o cancelamento</h2>
              <div className="agenda-summary-list">
                {[
                  ["Status", "Cancelado"],
                  ["Disponibilidade", "Liberada após sucesso"],
                  ["Histórico", "Preservado"],
                  ["Cliente", "Sem notificação presumida"],
                ].map(([label, value]) => (
                  <div className="agenda-summary-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <div className="agenda-success-panel" role="status">
            <div className="state-icon">
              <Icon name="check" />
            </div>
            <h2>Agendamento cancelado no exemplo</h2>
            <p>
              O histórico foi preservado e o horário foi liberado somente após a
              conclusão.
            </p>
            <Link className="btn btn-primary" href="/agenda">
              Voltar para a agenda
            </Link>
          </div>
        )}
      </div>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        eyebrow="Ação destrutiva"
        title="Cancelar este agendamento?"
      >
        <p className="small muted">
          O compromisso ficará cancelado no histórico e deixará de ocupar o
          horário somente após a operação ser concluída.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setDialogOpen(false)}
          >
            Manter agendamento
          </button>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              setCancelled(true);
              setDialogOpen(false);
            }}
          >
            Cancelar agendamento
          </button>
        </div>
      </Dialog>
    </AppShell>
  );
}

export function AgendaScreen({
  scenario = "atendly",
}: {
  scenario?: AgendaScenario;
}) {
  if (
    [
      "atendly",
      "external",
      "empty",
      "loading",
      "integration-error",
      "sync-conflict",
    ].includes(scenario)
  )
    return (
      <AgendaMain
        scenario={
          scenario as
            | "atendly"
            | "external"
            | "empty"
            | "loading"
            | "integration-error"
            | "sync-conflict"
        }
      />
    );
  if (scenario === "detail") return <AppointmentDetail />;
  if (scenario === "cancel") return <CancelAppointment />;
  return (
    <AppShell active="agenda" module="agenda">
      <div className="agenda-flow-page">
        <FlowHeader
          title={
            scenario === "new"
              ? "Novo agendamento"
              : scenario === "reschedule"
                ? "Reagendar atendimento"
                : "Bloquear horário"
          }
          description={
            scenario === "new"
              ? "Crie um compromisso manual na fonte oficial."
              : scenario === "reschedule"
                ? "Escolha um novo horário sem liberar o atual antes da conclusão."
                : "Reserve um período indisponível na Agenda Atendly."
          }
          back={scenario === "reschedule" ? "/agenda/agendamento" : "/agenda"}
        />
        <div className="alert alert-info agenda-demo-note" role="note">
          <Icon name={scenario === "block-time" ? "info" : "shield"} />
          <div>
            <p className="alert-title">
              {scenario === "new"
                ? "Confirmação segura"
                : scenario === "reschedule"
                  ? "O horário atual permanece reservado"
                  : "Conflitos são verificados antes de salvar"}
            </p>
            <p className="alert-text">
              {scenario === "new"
                ? "O horário será validado novamente antes do registro na Agenda Atendly."
                : scenario === "reschedule"
                  ? "Se a alteração falhar, o agendamento original continua válido."
                  : "Um bloqueio nunca será aplicado silenciosamente sobre um agendamento existente."}
            </p>
          </div>
        </div>
        <AppointmentForm
          mode={scenario as "new" | "reschedule" | "block-time"}
        />
      </div>
    </AppShell>
  );
}
