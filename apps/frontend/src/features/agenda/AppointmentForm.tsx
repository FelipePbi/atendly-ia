"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import {
  type AvailabilitySlot,
  type CalendarState,
  type CreateAppointmentInput,
  type CustomerList,
  type Service,
  type ServiceList,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";

import {
  AppointmentFlowShell,
  formatMoney,
  ReadOnlyState,
  Summary,
  SummaryRow,
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
  type AgendaEntry,
  buildAgendaEntries,
  formatDate,
  isoDate,
  requestError,
} from "./occupancy";
import { SlotPicker } from "./SlotPicker";

const NEW_CUSTOMER = "new";

type AppointmentFormProps = {
  /** Pessoa escolhida de antemão (Goal075, vinda de `/clientes`). Continua trocável. */
  customerId?: string;
};

/**
 * Criação de atendimento (Goal016).
 *
 * Três regras do domínio mandam nesta tela, e nenhuma delas é invenção dela:
 * a pessoa é identificada por `customerId` — nunca por telefone, que o
 * Goal006 tirou do domínio e o Goal015 tirou do perfil; o horário escolhido é
 * reservado por um hold antes da confirmação, e a reserva perdida leva a
 * reescolher, não a um erro genérico; e sobrepor um intervalo ocupado é
 * decisão humana com motivo obrigatório.
 */
export function AppointmentForm({ customerId }: AppointmentFormProps = {}) {
  const router = useRouter();
  const hold = useHoldSession();
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [services, setServices] = useState<ServiceList | null>(null);
  const [customers, setCustomers] = useState<CustomerList | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [customerChoice, setCustomerChoice] = useState(
    customerId ?? NEW_CUSTOMER,
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

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

  const selectableServices = (services?.items ?? []).filter(
    (item) => item.active && item.durationMinutes !== null,
  );
  const selectedServices = selectableServices.filter((item) =>
    serviceIds.includes(item.id),
  );
  const durationMinutes = selectedServices.reduce(
    (sum, item) => sum + (item.durationMinutes ?? 0),
    0,
  );
  const total = agreementTotal(selectedServices);
  const selectedCustomer = customers?.items.find(
    (item) => item.id === customerChoice,
  );
  const customerSummary =
    customerChoice === NEW_CUSTOMER
      ? customerName.trim() || "—"
      : (selectedCustomer?.name ??
        selectedCustomer?.phone ??
        "Cliente sem identificação");
  // Telefone não identifica ninguém aqui: uma pessoa já cadastrada é agendada
  // pelo próprio ID, mesmo sem telefone nenhum no perfil.
  const identityReady =
    customerChoice === NEW_CUSTOMER
      ? customerName.trim().length > 0
      : Boolean(selectedCustomer);
  const canSubmit =
    identityReady &&
    serviceIds.length > 0 &&
    Boolean(date) &&
    Boolean(startTime) &&
    !conflict &&
    hold.phase !== "reserving" &&
    hold.phase !== "expired";

  function resetSlotChoice() {
    hold.release();
    setStartTime("");
    setConflict(null);
  }

  function toggleService(service: Service) {
    const next = serviceIds.includes(service.id)
      ? serviceIds.filter((id) => id !== service.id)
      : [...serviceIds, service.id];
    resetSlotChoice();
    setSlots([]);
    setError(null);
    setServiceIds(next);
    setSlotsLoading(next.length > 0);
  }

  async function chooseTime(time: string) {
    if (!time || busy) return;
    setError(null);
    setConflict(null);
    setStartTime(time);
    try {
      await hold.reserve({
        customerId:
          customerChoice === NEW_CUSTOMER ? undefined : customerChoice,
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
        customerId:
          customerChoice === NEW_CUSTOMER ? undefined : customerChoice,
        customerName:
          customerChoice === NEW_CUSTOMER ? customerName.trim() : undefined,
        customerPhone:
          customerChoice === NEW_CUSTOMER
            ? customerPhone.trim() || undefined
            : undefined,
        date,
        holdId: hold.holdId ?? undefined,
        overlapOverride: overlapReason ? true : undefined,
        overlapOverrideReason: overlapReason,
        serviceIds,
        startTime,
      };
      const appointment = await getProductServices().calendar.createAppointment(
        input,
        newIdempotencyKey(),
      );
      router.replace(
        `/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`,
      );
    } catch (caught) {
      setConfirm(false);
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
        <div className="agenda-flow-layout">
          <form
            className="agenda-form-card"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (canSubmit) setConfirm(true);
            }}
          >
            <h2>Dados do agendamento</h2>
            <fieldset>
              <legend>Serviços</legend>
              {selectableServices.length === 0 ? (
                <p className="muted">
                  Nenhum serviço disponível para agendamento.
                </p>
              ) : (
                <div className="agenda-service-options">
                  {selectableServices.map((item) => (
                    <label className="agenda-service-option" key={item.id}>
                      <input
                        checked={serviceIds.includes(item.id)}
                        onChange={() => toggleService(item)}
                        type="checkbox"
                      />
                      <span>
                        {item.name} · {item.durationMinutes} min
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="agenda-form-status">
                {serviceIds.length === 0
                  ? "Nenhum serviço escolhido."
                  : `Duração total: ${durationMinutes} min`}
              </p>
            </fieldset>
            <div className="agenda-form-grid">
              {customers &&
                !customers.managedExternally &&
                customers.items.length > 0 && (
                  <label className="field is-wide">
                    <span>Cliente</span>
                    <select
                      value={customerChoice}
                      onChange={(event) => {
                        setCustomerChoice(event.target.value);
                        resetSlotChoice();
                      }}
                    >
                      <option value={NEW_CUSTOMER}>Novo cliente</option>
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
              {customerChoice === NEW_CUSTOMER && (
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
                    <span>Telefone (opcional)</span>
                    <input
                      inputMode="tel"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="field is-wide">
                <span>Observações</span>
                <textarea
                  rows={3}
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                />
              </label>
            </div>
            <SlotPicker
              date={date}
              disabled={serviceIds.length === 0}
              hold={hold}
              legend="Horários disponíveis"
              manualTime={manualTime}
              onDateChange={(value) => {
                setDate(value);
                setSlots([]);
                setSlotsLoading(serviceIds.length > 0);
                resetSlotChoice();
                setError(null);
              }}
              onManualTimeChange={setManualTime}
              onSelect={(time) => void chooseTime(time)}
              selected={startTime}
              slots={slots}
              slotsLoading={slotsLoading}
              timezone={calendar?.timezone}
            />
            <div className="agenda-form-footer">
              <Button href="/agenda" variant="secondary">
                Cancelar
              </Button>
              {/* Recorrência é oferecida ao agendar (Goal016, item 6): o fluxo
                  de série tem pré-visualização e confirmação atômica próprias,
                  que este formulário de ocorrência única não faz. */}
              <Button href="/agenda/serie" variant="secondary">
                Agendar série
              </Button>
              <Button disabled={!canSubmit} type="submit">
                Revisar e criar
              </Button>
            </div>
          </form>
          <Summary title="Resumo">
            <SummaryRow label="Cliente" value={customerSummary} />
            <SummaryRow
              label="Serviços"
              value={selectedServices.map((item) => item.name).join(", ") || "—"}
            />
            <SummaryRow
              label="Duração"
              value={durationMinutes ? `${durationMinutes} min` : "—"}
            />
            <SummaryRow label="Valor" value={totalLabel(total)} />
            <SummaryRow
              label="Quando"
              value={startTime ? `${formatDate(date)} às ${startTime}` : "—"}
            />
          </Summary>
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
      <Dialog
        eyebrow="Confirmação"
        onClose={() => !busy && setConfirm(false)}
        open={confirm}
        title="Criar este agendamento?"
      >
        <div className="agenda-summary-list">
          <SummaryRow label="Cliente" value={customerSummary} />
          <SummaryRow
            label="Serviços"
            value={selectedServices.map((item) => item.name).join(", ") || "—"}
          />
          <SummaryRow label="Duração" value={`${durationMinutes} min`} />
          <SummaryRow label="Valor" value={totalLabel(total)} />
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
