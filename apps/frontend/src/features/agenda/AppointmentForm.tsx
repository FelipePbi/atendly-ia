"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import {
  type AvailabilitySlot,
  type CalendarState,
  type CreateAppointmentInput,
  type Customer,
  type CustomerList,
  type Service,
  type ServiceList,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import {
  AppointmentFlowShell,
  formatMoney,
  ReadOnlyState,
} from "./AppointmentFlowShell";
import { ConflictPanel, occupyingEntries } from "./ConflictPanel";
import {
  holdLostMessage,
  isHoldLostError,
  isSlotConflictError,
  newIdempotencyKey,
  useHoldSession,
} from "./holdSession";
import {
  CustomerField,
  DateStrip,
  DayList,
  durationLabel,
  weekdayShort,
} from "./NewAppointmentFields";
import {
  type AgendaEntry,
  buildAgendaEntries,
  isoDate,
  parseDate,
  requestError,
} from "./occupancy";
import { holdNotice } from "./SlotPicker";

type AppointmentFormProps = {
  /** Pessoa escolhida de antemão (Goal075, vinda de `/clientes`). Continua trocável. */
  customerId?: string;
};

/**
 * Criação de atendimento (Goal016, apresentação do A6 no Goal083).
 *
 * Três regras do domínio mandam nesta tela, e nenhuma delas é invenção dela:
 * a pessoa é identificada por `customerId` — nunca por telefone, que o
 * Goal006 tirou do domínio e o Goal015 tirou do perfil; o horário escolhido é
 * reservado por um hold antes da criação, e a reserva perdida leva a
 * reescolher, não a um erro genérico; e sobrepor um intervalo ocupado é
 * decisão humana com motivo obrigatório.
 *
 * "Outro, sem cadastro" é o atendimento manual excepcional do Goal008: sem
 * serviço, com título e duração, e sem hold — o hold exige serviço.
 */
export function AppointmentForm({ customerId }: AppointmentFormProps = {}) {
  const router = useRouter();
  const hold = useHoldSession();
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [services, setServices] = useState<ServiceList | null>(null);
  const [customers, setCustomers] = useState<CustomerList | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [other, setOther] = useState(false);
  const [otherTitle, setOtherTitle] = useState("");
  const [otherDuration, setOtherDuration] = useState("");
  const [chosenCustomerId, setChosenCustomerId] = useState<string | null>(
    customerId ?? null,
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [comments, setComments] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [dayState, setDayState] = useState<{
    date: string;
    entries: AgendaEntry[] | null;
  } | null>(null);

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

  // A disponibilidade é consultada para o **conjunto** escolhido, não para o
  // primeiro serviço: é a duração somada que precisa caber no horário.
  const serviceKey = serviceIds.join(",");
  useEffect(() => {
    if (!serviceKey || !date || !calendar?.capabilities.createAppointments) {
      return;
    }
    const controller = new AbortController();
    getProductServices()
      .calendar.getAvailability(
        {
          serviceIds: serviceKey.split(","),
          startDate: date,
          days: 1,
          maxSlots: 100,
        },
        controller.signal,
      )
      .then((result) => {
        setSlots(result.filter((slot) => slot.date === date));
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
  }, [calendar, date, serviceKey]);

  const timezone = calendar?.timezone;
  const canCreate = Boolean(calendar?.capabilities.createAppointments);
  useEffect(() => {
    if (!canCreate) return;
    let active = true;
    void readOccupancy(date, timezone).then((entries) => {
      if (active) setDayState({ date, entries });
    });
    return () => {
      active = false;
    };
  }, [canCreate, date, timezone]);

  const selectableServices = (services?.items ?? []).filter(
    (item) => item.active && item.durationMinutes !== null,
  );
  const selectedServices = selectableServices.filter((item) =>
    serviceIds.includes(item.id),
  );
  const servicesMinutes = selectedServices.reduce(
    (sum, item) => sum + (item.durationMinutes ?? 0),
    0,
  );
  const otherMinutes = Number.parseInt(otherDuration, 10);
  const otherReady =
    otherTitle.trim().length > 0 &&
    Number.isInteger(otherMinutes) &&
    otherMinutes >= 1 &&
    otherMinutes <= 1440;
  const durationMinutes = other
    ? otherReady
      ? otherMinutes
      : 0
    : servicesMinutes;
  const total = agreementTotal(selectedServices);
  const selectedCustomer = chosenCustomerId
    ? customers?.items.find((item) => item.id === chosenCustomerId)
    : undefined;
  // Telefone não identifica ninguém aqui: uma pessoa já cadastrada é agendada
  // pelo próprio ID, mesmo sem telefone nenhum no perfil.
  const identityReady = selectedCustomer
    ? true
    : customerName.trim().length > 0;
  const serviceReady = other ? otherReady : serviceIds.length > 0;
  const canSubmit =
    identityReady &&
    serviceReady &&
    Boolean(date) &&
    Boolean(startTime) &&
    !busy &&
    !conflict &&
    hold.phase !== "reserving" &&
    hold.phase !== "expired";
  const blockedReason = !identityReady
    ? "Escolha ou cadastre o cliente."
    : !serviceReady
      ? other
        ? "Informe o título e a duração do atendimento."
        : "Escolha ao menos um serviço."
      : !startTime
        ? "Escolha um horário."
        : null;
  const ctaLabel = startTime
    ? `Criar agendamento · ${weekdayShort(date)} ${parseDate(date).getDate()}, ${startTime}`
    : "Criar agendamento";
  const dayEntries =
    dayState && dayState.date === date ? dayState.entries : null;

  function resetSlotChoice() {
    hold.release();
    setStartTime("");
    setConflict(null);
  }

  function chooseCustomer(customer: Customer) {
    resetSlotChoice();
    setChosenCustomerId(customer.id);
    setCustomerName("");
    setCustomerPhone("");
  }

  function swapCustomer() {
    resetSlotChoice();
    setChosenCustomerId(null);
  }

  function toggleService(service: Service) {
    const next = serviceIds.includes(service.id)
      ? serviceIds.filter((id) => id !== service.id)
      : [...serviceIds, service.id];
    resetSlotChoice();
    setSlots([]);
    setError(null);
    setOther(false);
    setServiceIds(next);
    setSlotsLoading(next.length > 0);
  }

  function toggleOther() {
    resetSlotChoice();
    setSlots([]);
    setSlotsLoading(false);
    setError(null);
    setServiceIds([]);
    setManualTime("");
    setOther((current) => !current);
  }

  function changeDate(value: string) {
    setDate(value);
    setSlots([]);
    setSlotsLoading(!other && serviceIds.length > 0);
    resetSlotChoice();
    setError(null);
  }

  async function chooseTime(time: string) {
    if (!time || busy) return;
    setError(null);
    setConflict(null);
    setStartTime(time);
    // "Outro, sem cadastro" não tem serviço, e o hold exige serviço: a
    // proteção contra choque fica por conta da recusa 409 na criação.
    if (other) return;
    try {
      await hold.reserve({
        customerId: selectedCustomer?.id,
        date,
        serviceIds,
        startTime: time,
      });
    } catch (caught) {
      if (isSlotConflictError(caught)) {
        await openConflict(time);
        return;
      }
      setError(requestError(caught, "Não foi possível reservar o horário."));
    }
  }

  async function openConflict(time: string) {
    setConflict({
      entries: null,
      loading: true,
      reason: "",
      reasonError: null,
      startTime: time,
    });
    const entries = await readOccupancy(date, calendar?.timezone);
    setConflict((current) =>
      current && current.startTime === time
        ? {
            ...current,
            entries:
              entries === null
                ? null
                : occupyingEntries(entries, {
                    date,
                    durationMinutes,
                    startTime: time,
                  }),
            loading: false,
          }
        : current,
    );
  }

  async function create(overlapReason?: string) {
    if (busy || !startTime) return;
    setBusy(true);
    setError(null);
    try {
      const input: CreateAppointmentInput = {
        comments: comments.trim() || undefined,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer ? undefined : customerName.trim(),
        customerPhone: selectedCustomer
          ? undefined
          : customerPhone.trim() || undefined,
        date,
        durationMinutes: other ? otherMinutes : undefined,
        holdId: other ? undefined : (hold.holdId ?? undefined),
        overlapOverride: overlapReason ? true : undefined,
        overlapOverrideReason: overlapReason,
        serviceIds: other ? [] : serviceIds,
        startTime,
        title: other ? otherTitle.trim() : undefined,
      };
      const appointment = await getProductServices().calendar.createAppointment(
        input,
        newIdempotencyKey(),
      );
      router.replace(
        `/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`,
      );
    } catch (caught) {
      if (isHoldLostError(caught)) {
        hold.markLost();
        setStartTime("");
        setConflict(null);
        setError(holdLostMessage(caught));
        return;
      }
      if (isSlotConflictError(caught)) {
        hold.release();
        await openConflict(startTime);
        return;
      }
      setError(requestError(caught, "Não foi possível criar o agendamento."));
    } finally {
      setBusy(false);
    }
  }

  function submitOverride() {
    if (!conflict) return;
    const reason = conflict.reason.trim();
    if (!reason) {
      // Sem motivo a sobreposição nem sai da tela: o contrato exige o motivo,
      // e enviar sem ele seria pedir uma recusa que ninguém entende.
      setConflict({
        ...conflict,
        reasonError:
          "Descreva o motivo da sobreposição. Sem motivo, o agendamento não é enviado.",
      });
      return;
    }
    setStartTime(conflict.startTime);
    void create(reason);
  }

  const timeHeading =
    !other && durationMinutes > 0
      ? `Horário · livres para ${durationLabel(durationMinutes)}`
      : "Horário";

  return (
    <AppointmentFlowShell
      calendar={calendar}
      description="Escolha cliente, serviços e um horário disponível."
      loading={loading}
      title="Novo agendamento"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.createAppointments ? (
        <ReadOnlyState operation="criar agendamentos" />
      ) : (
        <div className="agenda-new-layout">
          <form
            aria-label="Novo agendamento"
            className="agenda-new-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (canSubmit) void create();
            }}
          >
            <CustomerField
              customers={customers}
              name={customerName}
              onChoose={chooseCustomer}
              onName={setCustomerName}
              onPhone={setCustomerPhone}
              onSwap={swapCustomer}
              phone={customerPhone}
              selected={selectedCustomer}
            />
            <fieldset className="agenda-new-block">
              <legend className="label">Serviços</legend>
              {selectableServices.length === 0 ? (
                <p className="muted">
                  Nenhum serviço disponível para agendamento.
                </p>
              ) : (
                <div className="agenda-new-chips">
                  {selectableServices.map((item) => (
                    <label className="agenda-new-chip" key={item.id}>
                      <input
                        checked={serviceIds.includes(item.id)}
                        onChange={() => toggleService(item)}
                        type="checkbox"
                      />
                      <span>
                        {item.name} · {durationLabel(item.durationMinutes ?? 0)}
                      </span>
                    </label>
                  ))}
                  <button
                    aria-pressed={other}
                    className="agenda-new-chip agenda-new-chip-other"
                    onClick={toggleOther}
                    type="button"
                  >
                    Outro, sem cadastro
                  </button>
                </div>
              )}
              {!other && (
                <p className="agenda-new-total">
                  {selectedServices.length === 0
                    ? "Nenhum serviço escolhido."
                    : `${selectedServices.length} ${selectedServices.length === 1 ? "serviço" : "serviços"} · ${durationLabel(servicesMinutes)} · ${totalLabel(total)}`}
                </p>
              )}
              {other && (
                <div className="agenda-new-other">
                  <label className="field">
                    <span className="label">Título do atendimento</span>
                    <input
                      className="input"
                      maxLength={200}
                      onChange={(event) => {
                        resetSlotChoice();
                        setOtherTitle(event.target.value);
                      }}
                      value={otherTitle}
                    />
                  </label>
                  <label className="field">
                    <span className="label">Duração em minutos</span>
                    <input
                      className="input"
                      inputMode="numeric"
                      max={1440}
                      min={1}
                      onChange={(event) => {
                        setOtherDuration(event.target.value);
                        setConflict(null);
                      }}
                      type="number"
                      value={otherDuration}
                    />
                  </label>
                </div>
              )}
            </fieldset>
            <DateStrip
              date={date}
              onChange={changeDate}
              onTogglePicker={() => setShowDatePicker((current) => !current)}
              pickerOpen={showDatePicker}
            />
            <fieldset
              className="agenda-new-block"
              disabled={!other && serviceIds.length === 0}
            >
              <legend className="label">{timeHeading}</legend>
              {other ? (
                <p className="muted">
                  Sem serviço cadastrado não há horários sugeridos. Digite o
                  horário abaixo.
                </p>
              ) : serviceIds.length === 0 ? (
                <p className="muted">
                  Escolha um serviço para ver os horários livres.
                </p>
              ) : slotsLoading ? (
                <p>Consultando disponibilidade…</p>
              ) : slots.length === 0 ? (
                <p className="muted">
                  Nenhum horário disponível para esta seleção.
                </p>
              ) : (
                <div className="agenda-new-chips">
                  {slots.map((slot) => (
                    <label
                      className="agenda-new-chip"
                      key={`${slot.date}-${slot.startTime}`}
                    >
                      <input
                        checked={startTime === slot.startTime}
                        name="start-time"
                        onChange={() => void chooseTime(slot.startTime)}
                        type="radio"
                      />
                      <span>{slot.startTime}</span>
                    </label>
                  ))}
                </div>
              )}
              {!other && (
                <button
                  aria-expanded={showManual}
                  className="btn btn-tertiary"
                  disabled={serviceIds.length === 0}
                  onClick={() => setShowManual((current) => !current)}
                  type="button"
                >
                  Outro horário
                </button>
              )}
              {(other || showManual) && (
                <div className="agenda-new-manual">
                  <label className="field">
                    <span className="label">
                      Outro horário, fora dos oferecidos
                    </span>
                    <input
                      className="input"
                      onChange={(event) => setManualTime(event.target.value)}
                      type="time"
                      value={manualTime}
                    />
                  </label>
                  <button
                    className="btn btn-secondary"
                    disabled={!manualTime || (other && !otherReady)}
                    onClick={() => void chooseTime(manualTime)}
                    type="button"
                  >
                    Usar este horário
                  </button>
                  <p className="muted">
                    Um horário fora dos oferecidos pode estar ocupado. Se
                    estiver, a agenda mostra o que ocupa o intervalo e sobrepor
                    exige motivo.
                  </p>
                </div>
              )}
            </fieldset>
            <div className="agenda-new-block">
              {showComments ? (
                <label className="field">
                  <span className="label">Observações</span>
                  <textarea
                    className="input agenda-new-textarea"
                    onChange={(event) => setComments(event.target.value)}
                    rows={3}
                    value={comments}
                  />
                </label>
              ) : (
                <button
                  aria-expanded={false}
                  className="btn btn-tertiary"
                  onClick={() => setShowComments(true)}
                  type="button"
                >
                  Adicionar observação
                </button>
              )}
            </div>
            <div className="agenda-new-footer">
              {!other && (
                <p className="agenda-hold-status" role="status">
                  {holdNotice(hold, calendar?.timezone)}
                </p>
              )}
              {blockedReason && (
                <p className="muted agenda-new-blocked">{blockedReason}</p>
              )}
              <div className="agenda-new-actions">
                {/* Recorrência é oferecida ao agendar (Goal016, item 6): o fluxo
                    de série tem pré-visualização e confirmação atômica
                    próprias, que este formulário de ocorrência única não faz. */}
                <Button href="/agenda/serie" variant="tertiary">
                  Agendar série
                </Button>
                <Button disabled={!canSubmit} loading={busy} type="submit">
                  {ctaLabel}
                </Button>
              </div>
            </div>
          </form>
          <DayList
            date={date}
            entries={dayEntries}
            loading={!dayState || dayState.date !== date}
            preview={
              startTime && durationMinutes > 0
                ? {
                    label: "Novo agendamento",
                    minutes: durationMinutes,
                    startTime,
                  }
                : null
            }
          />
        </div>
      )}
      {conflict && (
        <ConflictPanel
          busy={busy}
          entries={conflict.entries}
          interval={{ date, durationMinutes, startTime: conflict.startTime }}
          loading={conflict.loading}
          onChooseAnother={() => resetSlotChoice()}
          onOverride={submitOverride}
          onReasonChange={(value) =>
            setConflict((current) =>
              current
                ? { ...current, reason: value, reasonError: null }
                : current,
            )
          }
          reason={conflict.reason}
          reasonError={conflict.reasonError}
        />
      )}
    </AppointmentFlowShell>
  );
}

interface ConflictState {
  entries: AgendaEntry[] | null;
  loading: boolean;
  reason: string;
  reasonError: string | null;
  startTime: string;
}

/**
 * Ocupação real do dia, para dizer o que toma o intervalo recusado. Falha de
 * leitura devolve `null` — a tela diz que não conseguiu listar, em vez de
 * afirmar que nada ocupa.
 */
export async function readOccupancy(
  date: string,
  timezone?: string | null,
): Promise<AgendaEntry[] | null> {
  try {
    const [appointments, timeBlocks] = await Promise.all([
      getProductServices().calendar.listAppointments({
        endDate: date,
        startDate: date,
      }),
      getProductServices().calendar.listTimeBlocks({
        endDate: date,
        startDate: date,
      }),
    ]);
    return buildAgendaEntries({
      appointments,
      exceptions: [],
      timeBlocks,
      timezone,
    });
  } catch {
    return null;
  }
}

export interface AgreementTotal {
  amount: number | null;
  type: "FIXED" | "STARTING_AT" | "NONE";
}

/**
 * Mesma regra única do total do acordo do Scheduling (`computeAgreementTotal`,
 * Goal007), reimplementada aqui por decisão de contrato (D-011): os dois lados
 * não compartilham pacote para este cálculo. Qualquer item `ON_REQUEST` ou
 * `NOT_INFORMED` derruba o total — a tela não fabrica valor fechado, e o
 * `totalPriceType` que o contrato devolve depois da criação é a mesma coisa.
 */
export function agreementTotal(
  items: Array<{ price: number | null; priceType: Service["priceType"] }>,
): AgreementTotal {
  if (items.length === 0) return { amount: null, type: "NONE" };
  const hasUnpriced = items.some(
    (item) =>
      item.priceType === "ON_REQUEST" || item.priceType === "NOT_INFORMED",
  );
  if (hasUnpriced) return { amount: null, type: "NONE" };
  const amount = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const allFixed = items.every((item) => item.priceType === "FIXED");
  return { amount, type: allFixed ? "FIXED" : "STARTING_AT" };
}

export function totalLabel(total: AgreementTotal): string {
  if (total.type === "NONE" || total.amount === null) return "Sob consulta";
  if (total.type === "STARTING_AT") {
    return `A partir de ${formatMoney(total.amount)}`;
  }
  return formatMoney(total.amount);
}
