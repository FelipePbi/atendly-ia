"use client";

import clsx from "clsx";
import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  type Appointment,
  type CalendarState,
  type CustomerList,
  type SeriesOccurrencePreview,
  type Service,
  type ServiceList,
} from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { displayPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import {
  AppointmentFlowShell,
  ReadOnlyState,
  Summary,
  SummaryRow,
} from "./AppointmentFlowShell";
import { formatDate, isoDate, requestError } from "./occupancy";
import { SeriesConfirm } from "./SeriesConfirm";

const NEW_CUSTOMER = "new";

/** Intervalo de partida quando o serviço escolhido não traz recorrência própria. */
const DEFAULT_INTERVAL_DAYS = 7;

export const SERIES_RELEASED_NOTICE =
  "Nada foi agendado e as reservas da pré-visualização foram liberadas.";

/**
 * Série de atendimento: pré-visualizar, olhar cada ocorrência, confirmar de
 * uma vez (Goal009, consumido no Goal016).
 *
 * O fluxo é o do contrato e não outro. `previewAppointmentSeries` projeta as
 * ocorrências e **reserva** um hold por ocorrência encontrada; cada uma volta
 * dizendo o que aconteceu com ela: no horário pedido, `adjusted` (a agenda
 * ofereceu outro horário) ou `unavailable` (não havia horário). Esta tela
 * mostra as três coisas como elas são — ocorrência indisponível não é
 * escondida nem trocada por outro horário em silêncio — e desistir libera o
 * que foi reservado, em vez de deixar horário preso até o TTL.
 *
 * `recurrenceIntervalDays` do serviço (Goal007) é o ponto de partida do
 * intervalo, não uma imposição: o campo continua editável.
 */
export function SeriesPreview() {
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [services, setServices] = useState<ServiceList | null>(null);
  const [customers, setCustomers] = useState<CustomerList | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [customerChoice, setCustomerChoice] = useState(NEW_CUSTOMER);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [comments, setComments] = useState("");
  const [firstDate, setFirstDate] = useState(isoDate(new Date()));
  const [firstStartTime, setFirstStartTime] = useState("09:00");
  const [intervalDays, setIntervalDays] = useState(DEFAULT_INTERVAL_DAYS);
  const [intervalTouched, setIntervalTouched] = useState(false);
  const [occurrenceCount, setOccurrenceCount] = useState(4);
  const [occurrences, setOccurrences] = useState<
    SeriesOccurrencePreview[] | null
  >(null);
  const [created, setCreated] = useState<Appointment[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reservas vivas fora do ciclo de render: a liberação ao sair da tela
  // precisa delas depois de o componente já ter saído.
  const liveHolds = useRef<string[]>([]);

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
          setError(requestError(caught, "Não foi possível preparar a série."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Abandonar o fluxo devolve os horários na hora, sem esperar o TTL.
  useEffect(() => () => releaseHolds(liveHolds.current), []);

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
  const selectedCustomer = customers?.items.find(
    (item) => item.id === customerChoice,
  );
  const customerSummary =
    customerChoice === NEW_CUSTOMER
      ? customerName.trim() || "—"
      : (selectedCustomer?.name ??
        (selectedCustomer?.phone
          ? displayPhone(selectedCustomer.phone, "")
          : null) ??
        "Cliente sem identificação");
  // Telefone não identifica ninguém aqui: quem já está cadastrado vai por ID.
  const identityReady =
    customerChoice === NEW_CUSTOMER
      ? customerName.trim().length > 0
      : Boolean(selectedCustomer);

  function chooseServices(service: Service) {
    const next = serviceIds.includes(service.id)
      ? serviceIds.filter((id) => id !== service.id)
      : [...serviceIds, service.id];
    setServiceIds(next);
    setError(null);
    if (intervalTouched) return;
    const suggested = selectableServices
      .filter((item) => next.includes(item.id))
      .map((item) => item.recurrenceIntervalDays)
      .find((value): value is number => typeof value === "number" && value > 0);
    setIntervalDays(suggested ?? DEFAULT_INTERVAL_DAYS);
  }

  async function preview(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!identityReady || serviceIds.length === 0) {
      setError("Escolha o cliente e pelo menos um serviço.");
      return;
    }
    if (occurrenceCount < 1 || intervalDays < 1) {
      setError("Informe quantas ocorrências e o intervalo entre elas.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result =
        await getProductServices().calendar.previewAppointmentSeries({
          customerId:
            customerChoice === NEW_CUSTOMER ? undefined : customerChoice,
          firstDate,
          firstStartTime,
          intervalDays,
          occurrenceCount,
          serviceIds,
        });
      liveHolds.current = result
        .map((item) => item.holdId)
        .filter((value): value is string => Boolean(value));
      setOccurrences(result);
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível pré-visualizar a série."),
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sair da pré-visualização — por desistência ou para ajustar a série —
   * devolve tudo o que ela reservou. O horário volta a ficar disponível para
   * quem mais agenda nesta agenda.
   */
  function dropPreview(message: string) {
    releaseHolds(liveHolds.current);
    liveHolds.current = [];
    setOccurrences(null);
    setNotice(message);
  }

  function finish(appointments: Appointment[]) {
    // Confirmados, os holds foram consumidos pelo servidor: liberar agora
    // seria mexer em reserva que já virou atendimento.
    liveHolds.current = [];
    setOccurrences(null);
    setNotice(null);
    setCreated(appointments);
  }

  return (
    <AppointmentFlowShell
      calendar={calendar}
      description="Repita o mesmo atendimento em intervalo fixo, conferindo ocorrência por ocorrência antes de confirmar."
      loading={loading}
      title="Série de atendimentos"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="agenda-hold-status" role="status">
          {notice}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.createAppointments ? (
        <ReadOnlyState operation="criar séries de atendimento" />
      ) : created ? (
        <div className="agenda-flow-layout">
          <section className="agenda-form-card">
            <p className="eyebrow">Série confirmada</p>
            <h2>{created.length} atendimentos criados</h2>
            <ol className="agenda-series-list">
              {created.map((appointment) => (
                <li className="agenda-series-item" key={appointment.id}>
                  <strong>
                    {formatDate(appointment.date)} às {appointment.startTime}
                  </strong>
                  <a
                    href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
                  >
                    Abrir atendimento
                  </a>
                </li>
              ))}
            </ol>
            <p className="muted">
              Cada ocorrência é um atendimento independente: cancelar, remarcar
              ou concluir uma não toca as demais.
            </p>
            <div className="agenda-form-footer">
              <Button href="/agenda">Voltar à agenda</Button>
            </div>
          </section>
        </div>
      ) : occurrences ? (
        <div className="agenda-flow-layout">
          <section
            aria-labelledby="series-preview-title"
            className="agenda-form-card"
          >
            <p className="eyebrow">Pré-visualização</p>
            <h2 id="series-preview-title">
              {occurrences.length} ocorrência(s) projetadas
            </h2>
            <SeriesOccurrenceList occurrences={occurrences} />
          </section>
          <Summary title="Resumo">
            <SummaryRow label="Cliente" value={customerSummary} />
            <SummaryRow
              label="Serviços"
              value={
                selectedServices.map((item) => item.name).join(", ") || "—"
              }
            />
            <SummaryRow
              label="Duração"
              value={durationMinutes ? `${durationMinutes} min` : "—"}
            />
            <SummaryRow label="Intervalo" value={`${intervalDays} dia(s)`} />
          </Summary>
          <div className="agenda-series-actions">
            <SeriesConfirm
              comments={comments.trim() || undefined}
              customerId={
                customerChoice === NEW_CUSTOMER ? undefined : customerChoice
              }
              customerName={
                customerChoice === NEW_CUSTOMER
                  ? customerName.trim()
                  : undefined
              }
              customerPhone={
                customerChoice === NEW_CUSTOMER
                  ? customerPhone.trim() || undefined
                  : undefined
              }
              intervalDays={intervalDays}
              occurrences={occurrences}
              onConfirmed={finish}
              onGiveUp={() => dropPreview(SERIES_RELEASED_NOTICE)}
              onRestart={() =>
                dropPreview(
                  `${SERIES_RELEASED_NOTICE} Ajuste a série e pré-visualize de novo.`,
                )
              }
              serviceIds={serviceIds}
            />
          </div>
        </div>
      ) : (
        <div className="agenda-flow-layout">
          <form
            className="agenda-form-card"
            onSubmit={(event) => void preview(event)}
          >
            <h2>Dados da série</h2>
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
                        onChange={() => chooseServices(item)}
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
                      onChange={(event) =>
                        setCustomerChoice(event.target.value)
                      }
                    >
                      <option value={NEW_CUSTOMER}>Novo cliente</option>
                      {customers.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name ??
                            (item.phone ? displayPhone(item.phone, "") : null) ??
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
              <label className="field">
                <span>Primeira data</span>
                <input
                  min={isoDate(new Date())}
                  required
                  type="date"
                  value={firstDate}
                  onChange={(event) => setFirstDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Horário da primeira</span>
                <input
                  required
                  type="time"
                  value={firstStartTime}
                  onChange={(event) => setFirstStartTime(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Intervalo entre atendimentos (dias)</span>
                <input
                  min={1}
                  required
                  type="number"
                  value={intervalDays}
                  onChange={(event) => {
                    setIntervalTouched(true);
                    setIntervalDays(Number(event.target.value));
                  }}
                />
              </label>
              <label className="field">
                <span>Quantas ocorrências</span>
                <input
                  min={1}
                  required
                  type="number"
                  value={occurrenceCount}
                  onChange={(event) =>
                    setOccurrenceCount(Number(event.target.value))
                  }
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
            <p className="muted">
              A pré-visualização reserva um horário por ocorrência encontrada.
              Nada é agendado até a confirmação, que acontece de uma vez só.
            </p>
            <div className="agenda-form-footer">
              <Button href="/agenda" variant="secondary">
                Cancelar
              </Button>
              <Button loading={busy} type="submit">
                Pré-visualizar série
              </Button>
            </div>
          </form>
          <Summary title="Resumo">
            <SummaryRow label="Cliente" value={customerSummary} />
            <SummaryRow
              label="Serviços"
              value={
                selectedServices.map((item) => item.name).join(", ") || "—"
              }
            />
            <SummaryRow
              label="Duração"
              value={durationMinutes ? `${durationMinutes} min` : "—"}
            />
            <SummaryRow
              label="Primeira"
              value={`${formatDate(firstDate)} às ${firstStartTime}`}
            />
            <SummaryRow label="Intervalo" value={`${intervalDays} dia(s)`} />
            <SummaryRow
              label="Ocorrências"
              value={`${occurrenceCount}`}
            />
          </Summary>
        </div>
      )}
    </AppointmentFlowShell>
  );
}

/**
 * Cada ocorrência dita pelo que o contrato devolveu sobre ela. O estado nunca
 * é sinalizado só por cor: rótulo, ícone e texto dizem a mesma coisa.
 */
export function SeriesOccurrenceList({
  occurrences,
}: {
  occurrences: SeriesOccurrencePreview[];
}) {
  return (
    <ol className="agenda-series-list">
      {occurrences.map((occurrence) => {
        const presentation = describeOccurrence(occurrence);
        return (
          <li
            className={clsx(
              "agenda-series-item",
              occurrence.unavailable && "is-unavailable",
              occurrence.adjusted && "is-adjusted",
            )}
            key={occurrence.index}
          >
            <span className="agenda-item-kind">
              <Icon name={presentation.icon} />
              {presentation.kindLabel}
            </span>
            <strong>{presentation.title}</strong>
            <span>{presentation.detail}</span>
          </li>
        );
      })}
    </ol>
  );
}

export interface OccurrencePresentation {
  detail: string;
  icon: IconName;
  kindLabel: string;
  title: string;
}

export function describeOccurrence(
  occurrence: SeriesOccurrencePreview,
): OccurrencePresentation {
  const position = `${occurrence.index + 1}ª ocorrência`;
  if (occurrence.unavailable || !occurrence.date || !occurrence.startTime) {
    return {
      detail:
        "Não havia horário disponível para esta ocorrência. Nada foi reservado para ela.",
      icon: "alert",
      kindLabel: "Indisponível",
      title: `${position} — ${formatDate(occurrence.requestedDate)}`,
    };
  }
  const when = `${formatDate(occurrence.date)} às ${occurrence.startTime}`;
  if (occurrence.adjusted) {
    return {
      detail: `Pedida para ${formatDate(occurrence.requestedDate)}; a agenda ofereceu este horário no lugar.`,
      icon: "refresh",
      kindLabel: "Ajustada",
      title: `${position} — ${when}`,
    };
  }
  return {
    detail: occurrence.endTime
      ? `No horário pedido, até ${occurrence.endTime}.`
      : "No horário pedido.",
    icon: "check",
    kindLabel: "No horário pedido",
    title: `${position} — ${when}`,
  };
}

/** Liberação em melhor esforço: se falhar, o TTL do banco fecha o caso. */
function releaseHolds(holdIds: string[]) {
  for (const holdId of holdIds) {
    void getProductServices()
      .calendar.releaseHold(holdId)
      .catch(() => undefined);
  }
}
