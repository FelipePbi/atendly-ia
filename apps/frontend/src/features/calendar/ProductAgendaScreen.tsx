"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type Appointment,
  type AvailabilitySlot,
  BffHttpError,
  type CalendarState,
  type CustomerList,
  type ServiceList,
  type TimeBlock,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { AppShell } from "@/shared/layout/AppShell";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";

type AgendaScenario =
  "block-time" | "cancel" | "detail" | "list" | "new" | "reschedule";

export function ProductAgendaScreen({
  appointmentId,
  scenario = "list",
}: {
  appointmentId?: string;
  scenario?: AgendaScenario;
}) {
  if (scenario === "list") return <AppointmentList />;
  if (scenario === "new") return <NewAppointment />;
  if (scenario === "block-time") return <BlockTime />;
  if (scenario === "detail")
    return <AppointmentDetail appointmentId={appointmentId} />;
  if (scenario === "reschedule")
    return <RescheduleAppointment appointmentId={appointmentId} />;
  return <CancelAppointment appointmentId={appointmentId} />;
}

function AppointmentList() {
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const end = addDays(cursor, 6);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getProductServices().calendar.getCalendar(controller.signal),
      getProductServices().calendar.listAppointments(
        { startDate: isoDate(cursor), endDate: isoDate(addDays(cursor, 6)) },
        controller.signal,
      ),
    ])
      .then(([calendarResult, appointmentResult]) => {
        setCalendar(calendarResult);
        setAppointments(appointmentResult);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(requestError(caught, "Não foi possível carregar a agenda."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cursor, reload]);

  const services = useMemo(
    () =>
      Array.from(
        new Map(
          appointments.flatMap((item) =>
            item.services.map((service) => [service.serviceId, service.name]),
          ),
        ),
      ),
    [appointments],
  );
  const visible = appointments.filter(
    (item) =>
      filter === "all" ||
      (filter === "ai" && item.source === "AI") ||
      item.services.some((service) => service.serviceId === filter),
  );
  const next = [...appointments]
    .filter((item) => item.status !== "CANCELLED")
    .sort(compareAppointments)[0];
  const external = calendar?.source === "EXTERNAL";

  return (
    <AppShell
      active="agenda"
      loading={loading}
      module="agenda"
      source={external ? "external" : "atendly"}
    >
      <div className="agenda-page">
        <header className="agenda-page-header">
          <div>
            <p className="eyebrow">Operação diária</p>
            <h1>Agenda</h1>
            <p>Agendamentos reais da fonte oficial do negócio.</p>
          </div>
          {calendar && (
            <div className="agenda-page-actions">
              {calendar.capabilities.manageAvailability && (
                <Button href="/agenda/bloquear" variant="secondary">
                  Bloquear horário
                </Button>
              )}
              {calendar.capabilities.createAppointments && (
                <Button href="/agenda/novo">Novo agendamento</Button>
              )}
            </div>
          )}
        </header>

        {calendar && <SourceStrip calendar={calendar} />}
        {error && (
          <div className="agenda-state-surface">
            <StatePanel
              actionLabel="Tentar novamente"
              description={error}
              icon="alert"
              onAction={() => setReload((value) => value + 1)}
              title="Agenda indisponível"
              tone="error"
            />
          </div>
        )}
        {!error && loading && <AgendaLoading />}
        {!error && !loading && calendar?.source === null && (
          <div className="agenda-state-surface">
            <StatePanel
              actionHref="/configuracoes/agenda"
              actionLabel="Configurar agenda"
              description="Conclua a escolha da fonte oficial antes de operar agendamentos."
              title="Fonte oficial não configurada"
            />
          </div>
        )}
        {!error && !loading && calendar?.source && (
          <>
            {next && (
              <Link
                className="agenda-next"
                href={`/agenda/agendamento?id=${encodeURIComponent(next.id)}`}
              >
                <span className="agenda-next-icon">
                  <Icon name="clock" />
                </span>
                <span className="agenda-next-copy">
                  <span>Próximo agendamento</span>
                  <strong>{customerLabel(next)}</strong>
                  <small>
                    {formatAppointmentDate(next)} · {serviceNames(next)}
                  </small>
                </span>
                <Icon name="chevron-right" />
              </Link>
            )}
            <section className="agenda-command-bar">
              <div className="agenda-date-tools">
                <button
                  className="icon-btn"
                  onClick={() => {
                    setLoading(true);
                    setError(null);
                    setCursor(addDays(cursor, -7));
                  }}
                  type="button"
                  aria-label="Semana anterior"
                >
                  <Icon name="chevron-left" />
                </button>
                <strong className="agenda-date-title">
                  {formatPeriod(cursor, end)}
                </strong>
                <button
                  className="icon-btn"
                  onClick={() => {
                    setLoading(true);
                    setError(null);
                    setCursor(addDays(cursor, 7));
                  }}
                  type="button"
                  aria-label="Próxima semana"
                >
                  <Icon name="chevron-right" />
                </button>
              </div>
              <div className="agenda-filters" aria-label="Filtrar agenda">
                <FilterButton
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  Todos
                </FilterButton>
                <FilterButton
                  active={filter === "ai"}
                  onClick={() => setFilter("ai")}
                >
                  Criados pela IA
                </FilterButton>
                {services.map(([id, name]) => (
                  <FilterButton
                    active={filter === id}
                    key={id}
                    onClick={() => setFilter(id)}
                  >
                    {name}
                  </FilterButton>
                ))}
              </div>
            </section>
            <section
              className="agenda-calendar agenda-list-panel"
              aria-label="Agendamentos da semana"
            >
              {visible.length === 0 ? (
                <div className="agenda-no-results">
                  Nenhum agendamento encontrado neste período.
                </div>
              ) : (
                groupByDate(visible).map(([date, items]) => (
                  <div className="agenda-list-group" key={date}>
                    <h2 className="agenda-list-heading">{formatDate(date)}</h2>
                    <div className="agenda-day-list">
                      {items.map((item) => (
                        <AppointmentRow item={item} key={item.id} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function NewAppointment() {
  const router = useRouter();
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [services, setServices] = useState<ServiceList | null>(null);
  const [customers, setCustomers] = useState<CustomerList | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [customerId, setCustomerId] = useState("new");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [startTime, setStartTime] = useState("");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getProductServices().calendar.getCalendar(controller.signal),
      getProductServices().serviceCatalog.list(controller.signal),
      getProductServices().customers.list(controller.signal),
    ])
      .then(([calendarResult, serviceResult, customerResult]) => {
        setCalendar(calendarResult);
        setServices(serviceResult);
        setCustomers(customerResult);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível preparar o agendamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!serviceId || !date || !calendar?.capabilities.createAppointments) {
      return;
    }
    const controller = new AbortController();
    getProductServices()
      .calendar.getAvailability(
        { serviceIds: [serviceId], startDate: date, days: 1, maxSlots: 100 },
        controller.signal,
      )
      .then((result) => {
        setSlots(result.filter((slot) => slot.date === date));
        setStartTime("");
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(
              caught,
              "Não foi possível consultar os horários disponíveis.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [calendar, date, serviceId]);

  const selectedCustomer = customers?.items.find(
    (item) => item.id === customerId,
  );
  const finalName =
    customerId === "new"
      ? customerName.trim()
      : (selectedCustomer?.name?.trim() ?? "");
  const finalPhone =
    customerId === "new"
      ? customerPhone.trim()
      : (selectedCustomer?.phone?.trim() ?? "");
  const selectedService = services?.items.find((item) => item.id === serviceId);
  const canSubmit = Boolean(
    finalName && finalPhone && serviceId && date && startTime,
  );

  async function create() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const appointment = await getProductServices().calendar.createAppointment(
        {
          comments: comments.trim() || undefined,
          customerName: finalName,
          customerPhone: finalPhone,
          date,
          serviceIds: [serviceId],
          startTime,
        },
        crypto.randomUUID(),
      );
      router.replace(
        `/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`,
      );
    } catch (caught) {
      setError(requestError(caught, "Não foi possível criar o agendamento."));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowShell
      calendar={calendar}
      description="Escolha cliente, serviço e um horário disponível na fonte oficial."
      loading={loading}
      title="Novo agendamento"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.createAppointments ? (
        <ReadOnlyState calendar={calendar} operation="criar agendamentos" />
      ) : (
        <div className="agenda-flow-layout">
          <form
            className="agenda-form-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) setConfirm(true);
            }}
          >
            <h2>Dados do agendamento</h2>
            <div className="agenda-form-grid">
              <label className="field is-wide">
                <span>Serviço</span>
                <select
                  required
                  value={serviceId}
                  onChange={(event) => {
                    setServiceId(event.target.value);
                    setSlots([]);
                    setStartTime("");
                    setSlotsLoading(Boolean(event.target.value));
                    setError(null);
                  }}
                >
                  <option value="">Selecione</option>
                  {services?.items
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.durationMinutes} min
                      </option>
                    ))}
                </select>
              </label>
              {customers &&
                !customers.managedExternally &&
                customers.items.length > 0 && (
                  <label className="field is-wide">
                    <span>Cliente</span>
                    <select
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                    >
                      <option value="new">Novo cliente</option>
                      {customers.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name ??
                            item.phone ??
                            "Cliente sem identificação"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              {customerId === "new" && (
                <>
                  <label className="field">
                    <span>Nome do cliente</span>
                    <input
                      required
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Telefone</span>
                    <input
                      required
                      inputMode="tel"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="field">
                <span>Data</span>
                <input
                  min={isoDate(new Date())}
                  required
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setSlots([]);
                    setStartTime("");
                    setSlotsLoading(Boolean(serviceId));
                    setError(null);
                  }}
                />
              </label>
              <label className="field is-wide">
                <span>Observações</span>
                <textarea
                  rows={3}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                />
              </label>
            </div>
            <fieldset disabled={!serviceId || slotsLoading}>
              <legend>Horários disponíveis</legend>
              {slotsLoading ? (
                <p>Consultando disponibilidade…</p>
              ) : slots.length === 0 ? (
                <p className="muted">
                  Nenhum horário disponível para esta seleção.
                </p>
              ) : (
                <div className="agenda-time-options">
                  {slots.map((slot) => (
                    <label
                      className="agenda-time-option"
                      key={`${slot.date}-${slot.startTime}`}
                    >
                      <input
                        checked={startTime === slot.startTime}
                        name="start-time"
                        onChange={() => setStartTime(slot.startTime)}
                        type="radio"
                      />
                      <span>{slot.startTime}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="agenda-form-footer">
              <Button href="/agenda" variant="secondary">
                Cancelar
              </Button>
              <Button disabled={!canSubmit} type="submit">
                Revisar e criar
              </Button>
            </div>
          </form>
          <Summary title="Resumo">
            <SummaryRow label="Cliente" value={finalName || "—"} />
            <SummaryRow label="Serviço" value={selectedService?.name ?? "—"} />
            <SummaryRow
              label="Quando"
              value={startTime ? `${formatDate(date)} às ${startTime}` : "—"}
            />
          </Summary>
        </div>
      )}
      <Dialog
        eyebrow="Confirmação"
        onClose={() => !busy && setConfirm(false)}
        open={confirm}
        title="Criar este agendamento?"
      >
        <div className="agenda-summary-list">
          <SummaryRow label="Cliente" value={finalName} />
          <SummaryRow label="Serviço" value={selectedService?.name ?? "—"} />
          <SummaryRow
            label="Quando"
            value={`${formatDate(date)} às ${startTime}`}
          />
        </div>
        <div className="modal-actions">
          <Button
            disabled={busy}
            onClick={() => setConfirm(false)}
            type="button"
            variant="secondary"
          >
            Voltar
          </Button>
          <Button loading={busy} onClick={() => void create()} type="button">
            Confirmar agendamento
          </Button>
        </div>
      </Dialog>
    </FlowShell>
  );
}

function AppointmentDetail({ appointmentId }: { appointmentId?: string }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );

  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    Promise.all([
      getProductServices().calendar.getAppointment(
        appointmentId,
        controller.signal,
      ),
      getProductServices().calendar.getCalendar(controller.signal),
    ])
      .then(([appointmentResult, calendarResult]) => {
        setAppointment(appointmentResult);
        setCalendar(calendarResult);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar o agendamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  const writable = Boolean(
    calendar?.capabilities.createAppointments &&
    appointment?.status !== "CANCELLED",
  );
  return (
    <FlowShell
      calendar={calendar}
      description="Dados persistidos na fonte oficial do negócio."
      loading={loading}
      title="Detalhes do agendamento"
    >
      {error && (
        <StatePanel
          actionHref="/agenda"
          actionLabel="Voltar à agenda"
          description={error}
          icon="alert"
          title="Agendamento indisponível"
          tone="error"
        />
      )}
      {appointment && (
        <>
          <section className="agenda-detail-hero">
            <div>
              <p className="eyebrow">{statusLabel(appointment.status)}</p>
              <h2>{customerLabel(appointment)}</h2>
              <p className="agenda-detail-date">
                {formatAppointmentDate(appointment)}
              </p>
              <p className="agenda-detail-service">
                {serviceNames(appointment)}
              </p>
            </div>
            {writable && (
              <div className="agenda-detail-actions">
                <Button
                  href={`/agenda/reagendar?id=${encodeURIComponent(appointment.id)}`}
                  variant="secondary"
                >
                  Reagendar
                </Button>
                <Button
                  href={`/agenda/cancelar?id=${encodeURIComponent(appointment.id)}`}
                  variant="danger"
                >
                  Cancelar agendamento
                </Button>
              </div>
            )}
          </section>
          {calendar?.source === "EXTERNAL" &&
            !calendar.capabilities.createAppointments && (
              <ReadOnlyNotice>
                Este calendário está em modo de consulta. Alterações devem ser
                feitas na fonte oficial.
              </ReadOnlyNotice>
            )}
          <div className="agenda-detail-grid">
            <section className="agenda-detail-section">
              <h2>Cliente</h2>
              <div className="agenda-summary-list">
                <SummaryRow label="Nome" value={customerLabel(appointment)} />
                <SummaryRow
                  label="Telefone"
                  value={appointment.customer?.phone ?? "Não informado"}
                />
              </div>
            </section>
            <section className="agenda-detail-section">
              <h2>Agendamento</h2>
              <div className="agenda-summary-list">
                <SummaryRow label="Data" value={formatDate(appointment.date)} />
                <SummaryRow
                  label="Horário"
                  value={`${appointment.startTime}–${appointment.endTime}`}
                />
                <SummaryRow
                  label="Duração"
                  value={`${appointment.durationMinutes} min`}
                />
                <SummaryRow
                  label="Origem"
                  value={sourceLabel(appointment.source)}
                />
                <SummaryRow
                  label="Valor"
                  value={formatMoney(appointment.totalPrice)}
                />
              </div>
            </section>
            {appointment.comments && (
              <section className="agenda-detail-section">
                <h2>Observações</h2>
                <p>{appointment.comments}</p>
              </section>
            )}
          </div>
        </>
      )}
    </FlowShell>
  );
}

function RescheduleAppointment({ appointmentId }: { appointmentId?: string }) {
  const router = useRouter();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [date, setDate] = useState(isoDate(new Date()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [startTime, setStartTime] = useState("");
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [slotsLoading, setSlotsLoading] = useState(Boolean(appointmentId));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );

  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    Promise.all([
      getProductServices().calendar.getAppointment(
        appointmentId,
        controller.signal,
      ),
      getProductServices().calendar.getCalendar(controller.signal),
    ])
      .then(([appointmentResult, calendarResult]) => {
        setAppointment(appointmentResult);
        setCalendar(calendarResult);
        setDate(
          appointmentResult.date < isoDate(new Date())
            ? isoDate(new Date())
            : appointmentResult.date,
        );
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível preparar o reagendamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  useEffect(() => {
    if (!appointment || !calendar?.capabilities.createAppointments || !date)
      return;
    const controller = new AbortController();
    getProductServices()
      .calendar.getAvailability(
        {
          serviceIds: appointment.services.map((service) => service.serviceId),
          startDate: date,
          days: 1,
          maxSlots: 100,
        },
        controller.signal,
      )
      .then((result) => {
        setSlots(result.filter((slot) => slot.date === date));
        setStartTime("");
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(
              caught,
              "Não foi possível consultar os horários disponíveis.",
            ),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [appointment, calendar, date]);

  async function reschedule() {
    if (!appointment || !startTime || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getProductServices().calendar.rescheduleAppointment(
        appointment.id,
        { date, startTime },
        crypto.randomUUID(),
      );
      router.replace(`/agenda/agendamento?id=${encodeURIComponent(result.id)}`);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível reagendar."));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowShell
      calendar={calendar}
      description="O horário anterior só é liberado depois da confirmação real do novo horário."
      loading={loading}
      title="Reagendar"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.createAppointments ? (
        <ReadOnlyState calendar={calendar} operation="reagendar" />
      ) : (
        appointment && (
          <div className="agenda-flow-layout">
            <form
              className="agenda-form-card"
              onSubmit={(event) => {
                event.preventDefault();
                if (startTime) setConfirm(true);
              }}
            >
              <div className="agenda-current-slot">
                <span>Horário atual</span>
                <strong>{formatAppointmentDate(appointment)}</strong>
              </div>
              <div className="agenda-form-grid">
                <label className="field">
                  <span>Nova data</span>
                  <input
                    min={isoDate(new Date())}
                    required
                    type="date"
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setSlots([]);
                      setStartTime("");
                      setSlotsLoading(true);
                    }}
                  />
                </label>
              </div>
              <fieldset disabled={slotsLoading}>
                <legend>Novo horário disponível</legend>
                {slotsLoading ? (
                  <p>Consultando disponibilidade…</p>
                ) : slots.length === 0 ? (
                  <p className="muted">Nenhum horário disponível nesta data.</p>
                ) : (
                  <div className="agenda-time-options">
                    {slots.map((slot) => (
                      <label
                        className="agenda-time-option"
                        key={slot.startTime}
                      >
                        <input
                          checked={startTime === slot.startTime}
                          name="start-time"
                          onChange={() => setStartTime(slot.startTime)}
                          type="radio"
                        />
                        <span>{slot.startTime}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <div className="agenda-form-footer">
                <Button
                  href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button disabled={!startTime} type="submit">
                  Revisar alteração
                </Button>
              </div>
            </form>
            <Summary title="Resumo">
              <SummaryRow label="Cliente" value={customerLabel(appointment)} />
              <SummaryRow label="Serviço" value={serviceNames(appointment)} />
              <SummaryRow
                label="Novo horário"
                value={startTime ? `${formatDate(date)} às ${startTime}` : "—"}
              />
            </Summary>
          </div>
        )
      )}
      <Dialog
        eyebrow="Confirmação"
        onClose={() => !busy && setConfirm(false)}
        open={confirm}
        title="Confirmar novo horário?"
      >
        <p>
          O horário anterior será liberado somente após a persistência deste
          novo agendamento.
        </p>
        <div className="modal-actions">
          <Button
            disabled={busy}
            onClick={() => setConfirm(false)}
            type="button"
            variant="secondary"
          >
            Voltar
          </Button>
          <Button
            loading={busy}
            onClick={() => void reschedule()}
            type="button"
          >
            Confirmar reagendamento
          </Button>
        </div>
      </Dialog>
    </FlowShell>
  );
}

function CancelAppointment({ appointmentId }: { appointmentId?: string }) {
  const router = useRouter();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );

  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    Promise.all([
      getProductServices().calendar.getAppointment(
        appointmentId,
        controller.signal,
      ),
      getProductServices().calendar.getCalendar(controller.signal),
    ])
      .then(([appointmentResult, calendarResult]) => {
        setAppointment(appointmentResult);
        setCalendar(calendarResult);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível preparar o cancelamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  async function cancel() {
    if (!appointment || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getProductServices().calendar.cancelAppointment(
        appointment.id,
        { comments: comments.trim() || undefined },
        crypto.randomUUID(),
      );
      router.replace(`/agenda/agendamento?id=${encodeURIComponent(result.id)}`);
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível cancelar o agendamento."),
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowShell
      calendar={calendar}
      description="O cancelamento preserva o histórico e só é confirmado após persistência real."
      loading={loading}
      title="Cancelar agendamento"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.createAppointments ? (
        <ReadOnlyState calendar={calendar} operation="cancelar agendamentos" />
      ) : (
        appointment && (
          <div className="agenda-flow-layout">
            <form
              className="agenda-form-card"
              onSubmit={(event) => {
                event.preventDefault();
                setConfirm(true);
              }}
            >
              <h2>{customerLabel(appointment)}</h2>
              <p>
                {formatAppointmentDate(appointment)} ·{" "}
                {serviceNames(appointment)}
              </p>
              <label className="field">
                <span>Motivo ou observação (opcional)</span>
                <textarea
                  rows={4}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                />
              </label>
              <div className="agenda-form-footer">
                <Button
                  href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
                  variant="secondary"
                >
                  Voltar
                </Button>
                <Button type="submit" variant="danger">
                  Revisar cancelamento
                </Button>
              </div>
            </form>
          </div>
        )
      )}
      <Dialog
        eyebrow="Atenção"
        onClose={() => !busy && setConfirm(false)}
        open={confirm}
        title="Cancelar este agendamento?"
      >
        <p>Esta ação altera o status do agendamento e mantém seu histórico.</p>
        <div className="modal-actions">
          <Button
            disabled={busy}
            onClick={() => setConfirm(false)}
            type="button"
            variant="secondary"
          >
            Manter agendamento
          </Button>
          <Button
            loading={busy}
            onClick={() => void cancel()}
            type="button"
            variant="danger"
          >
            Confirmar cancelamento
          </Button>
        </div>
      </Dialog>
    </FlowShell>
  );
}

function BlockTime() {
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [date, setDate] = useState(isoDate(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [reason, setReason] = useState("");
  const [created, setCreated] = useState<TimeBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .calendar.getCalendar(controller.signal)
      .then(setCalendar)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(requestError(caught, "Não foi possível carregar a agenda."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!calendar?.timezone || busy) return;
    const startAt = zonedDateTimeToIso(date, startTime, calendar.timezone);
    const endAt = zonedDateTimeToIso(date, endTime, calendar.timezone);
    if (new Date(endAt) <= new Date(startAt)) {
      setError("O fim do bloqueio deve ser posterior ao início.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setCreated(
        await getProductServices().calendar.createTimeBlock({
          startAt,
          endAt,
          reason: reason.trim() || null,
        }),
      );
    } catch (caught) {
      setError(requestError(caught, "Não foi possível bloquear o horário."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!created || busy) return;
    setBusy(true);
    setError(null);
    try {
      await getProductServices().calendar.deleteTimeBlock(created.id);
      setCreated(null);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível remover o bloqueio."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowShell
      calendar={calendar}
      description="Reserve um intervalo na Agenda Atendly para impedir novos agendamentos."
      loading={loading}
      title="Bloquear horário"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.manageAvailability ? (
        <ReadOnlyState calendar={calendar} operation="bloquear horários" />
      ) : created ? (
        <div className="agenda-flow-layout">
          <section className="agenda-form-card">
            <p className="eyebrow">Bloqueio confirmado</p>
            <h2>Horário indisponível</h2>
            <div className="agenda-summary-list">
              <SummaryRow
                label="Início"
                value={formatIsoDateTime(created.startAt, calendar?.timezone)}
              />
              <SummaryRow
                label="Fim"
                value={formatIsoDateTime(created.endAt, calendar?.timezone)}
              />
              <SummaryRow
                label="Motivo"
                value={created.reason ?? "Não informado"}
              />
            </div>
            <div className="agenda-form-footer">
              <Button href="/agenda">Voltar à agenda</Button>
              <Button
                loading={busy}
                onClick={() => void remove()}
                type="button"
                variant="danger"
              >
                Remover bloqueio
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <div className="agenda-flow-layout">
          <form
            className="agenda-form-card"
            onSubmit={(event) => void create(event)}
          >
            <h2>Intervalo</h2>
            <div className="agenda-form-grid">
              <label className="field is-wide">
                <span>Data</span>
                <input
                  min={isoDate(new Date())}
                  required
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Início</span>
                <input
                  required
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Fim</span>
                <input
                  required
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </label>
              <label className="field is-wide">
                <span>Motivo (opcional)</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </div>
            <div className="agenda-form-footer">
              <Button href="/agenda" variant="secondary">
                Cancelar
              </Button>
              <Button loading={busy} type="submit">
                Confirmar bloqueio
              </Button>
            </div>
          </form>
          <Summary title="Resumo">
            <SummaryRow label="Data" value={formatDate(date)} />
            <SummaryRow label="Horário" value={`${startTime}–${endTime}`} />
            <SummaryRow label="Fuso" value={calendar?.timezone ?? "—"} />
          </Summary>
        </div>
      )}
    </FlowShell>
  );
}

function FlowShell({
  calendar,
  children,
  description,
  loading,
  title,
}: {
  calendar: CalendarState | null;
  children: ReactNode;
  description: string;
  loading: boolean;
  title: string;
}) {
  return (
    <AppShell
      active="agenda"
      loading={loading}
      module="agenda"
      source={calendar?.source === "EXTERNAL" ? "external" : "atendly"}
    >
      <div className="agenda-flow-page">
        <header className="agenda-flow-header">
          <Link className="back-link" href="/agenda">
            <Icon name="chevron-left" /> Voltar à agenda
          </Link>
          <p className="eyebrow">Agenda</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {calendar && <SourceStrip calendar={calendar} />}
        {loading ? <AgendaLoading /> : children}
      </div>
    </AppShell>
  );
}

function SourceStrip({ calendar }: { calendar: CalendarState }) {
  const external = calendar.source === "EXTERNAL";
  const integrationFailed =
    external && calendar.integration?.status !== "CONNECTED";
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
              ? "A Atendly exibe e altera apenas o que a conexão permite."
              : "Disponibilidade e alterações são controladas aqui."}
          </span>
        </div>
      </div>
      <span
        className={clsx(
          "badge",
          !external && "badge-success",
          integrationFailed && "badge-danger",
        )}
      >
        {integrationFailed
          ? "Conexão requer atenção"
          : external
            ? lastSyncLabel(calendar)
            : "Operacional"}
      </span>
    </section>
  );
}

function ReadOnlyState({
  calendar,
  operation,
}: {
  calendar: CalendarState;
  operation: string;
}) {
  return (
    <div className="agenda-state-surface">
      <StatePanel
        actionHref="/agenda"
        actionLabel="Voltar à agenda"
        description={`A configuração atual de ${calendar.source === "EXTERNAL" ? "Minha Agenda" : "Agenda Atendly"} não permite ${operation} por aqui.`}
        icon="lock"
        title="Operação indisponível"
      />
    </div>
  );
}

function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <div className="agenda-demo-note">
      <Icon name="lock" />
      <span>{children}</span>
    </div>
  );
}

function Summary({ children, title }: { children: ReactNode; title: string }) {
  return (
    <aside className="agenda-summary-card">
      <h2>{title}</h2>
      <div className="agenda-summary-list">{children}</div>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="agenda-summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx("agenda-filter", active && "is-active")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function AppointmentRow({ item }: { item: Appointment }) {
  return (
    <Link
      className="agenda-item"
      href={`/agenda/agendamento?id=${encodeURIComponent(item.id)}`}
    >
      <time className="agenda-item-time">{item.startTime}</time>
      <span className="agenda-item-copy">
        <strong>{customerLabel(item)}</strong>
        <span>
          {serviceNames(item)} · {item.durationMinutes} min
        </span>
        <span className="agenda-item-signals">
          <span className={clsx("badge", item.source === "AI" && "badge-ai")}>
            {sourceLabel(item.source)}
          </span>
          <span
            className={clsx(
              "badge",
              item.status !== "CANCELLED" && "badge-success",
            )}
          >
            {statusLabel(item.status)}
          </span>
        </span>
      </span>
      <Icon name="chevron-right" />
    </Link>
  );
}

function AgendaLoading() {
  return (
    <div className="agenda-loading-shell" aria-label="Carregando agenda">
      <div className="skeleton agenda-loading-header" />
      <div className="agenda-loading-grid">
        <div className="skeleton agenda-loading-column" />
        <div className="skeleton agenda-loading-column" />
      </div>
    </div>
  );
}

function customerLabel(appointment: Appointment): string {
  return (
    appointment.customer?.name ??
    appointment.customer?.phone ??
    "Cliente não identificado"
  );
}

function serviceNames(appointment: Appointment): string {
  return (
    appointment.services.map((service) => service.name).join(", ") ||
    "Serviço não informado"
  );
}

function sourceLabel(source: Appointment["source"]): string {
  if (source === "AI") return "Criado pela IA";
  if (source === "INTEGRATION") return "Origem externa";
  return "Criado manualmente";
}

function statusLabel(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "CANCELLED") return "Cancelado";
  if (normalized === "COMPLETED") return "Concluído";
  return "Confirmado";
}

function compareAppointments(left: Appointment, right: Appointment): number {
  return `${left.date}T${left.startTime}`.localeCompare(
    `${right.date}T${right.startTime}`,
  );
}

function groupByDate(items: Appointment[]): [string, Appointment[]][] {
  const grouped = new Map<string, Appointment[]>();
  [...items]
    .sort(compareAppointments)
    .forEach((item) =>
      grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]),
    );
  return Array.from(grouped);
}

function startOfWeek(value: Date): Date {
  const result = new Date(value);
  const weekday = result.getDay();
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() - ((weekday + 6) % 7));
  return result;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function isoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
    parseDate(value),
  );
}

function formatPeriod(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatAppointmentDate(appointment: Appointment): string {
  return `${formatDate(appointment.date)} · ${appointment.startTime}–${appointment.endTime}`;
}

function formatMoney(value: number | null): string {
  if (value === null) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function lastSyncLabel(calendar: CalendarState): string {
  const value = calendar.integration?.lastSuccessfulSyncAt;
  if (!value) return "Conectada";
  return `Atualizada ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))}`;
}

function formatIsoDateTime(value: string, timezone?: string | null): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone ?? undefined,
  }).format(new Date(value));
}

function zonedDateTimeToIso(
  date: string,
  time: string,
  timeZone: string,
): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(guess))
        .map((part) => [part.type, Number(part.value)]),
    );
    const actual = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    guess += target - actual;
  }
  return new Date(guess).toISOString();
}

function requestError(caught: unknown, fallback: string): string {
  if (caught instanceof BffHttpError) return caught.message;
  if (caught instanceof Error && caught.message) return caught.message;
  return fallback;
}
