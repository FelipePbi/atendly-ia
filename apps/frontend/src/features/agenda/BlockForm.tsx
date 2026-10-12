"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  cloneElement,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type AvailabilityException,
  type CalendarState,
  type TimeBlock,
  type TimeBlockKind,
} from "@/data";
import { schedulingRefusalCode } from "@/data/http/schedulingRefusal";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useSplashPresenting } from "@/shared/motion/splash";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { DateField, TimeField } from "@/shared/ui/pickers/PickerFields";

import { AgendaLoading } from "./AgendaBoard";
import { recalledCalendar } from "./agendaMemory";
import {
  AppointmentFlowShell,
  ReadOnlyState,
  SummaryRow,
  zonedDateTimeToIso,
} from "./AppointmentFlowShell";
import { readOccupancy } from "./AppointmentForm";
import { occupyingEntries } from "./ConflictPanel";
import {
  type AgendaEntry,
  describeEntry,
  formatDate,
  isoDate,
  MINUTES_PER_DAY,
  requestError,
  timeBlockKindLabel,
} from "./occupancy";

type Field = "date" | "decidedReason" | "endTime" | "startTime";
type FieldErrors = Partial<Record<Field, string>>;

type Created =
  | { block: TimeBlock; type: "block" }
  | { exception: AvailabilityException; type: "closed" };

interface Conflict {
  entries: AgendaEntry[] | null;
}

/**
 * `?type=` de antes da tela única (D-169, revisão de 2026-10-12) só
 * pré-configura a tela: `PERSONAL` liga "É um compromisso pessoal" e
 * `CLOSED` liga "Dia inteiro". O que é gravado continua vindo do que a pessoa
 * deixa marcado.
 */
function initialTypeFromLocation(): TimeBlockKind | "CLOSED" {
  if (typeof window === "undefined") return "BLOCK";
  const requested = new URLSearchParams(window.location.search).get("type");
  return requested === "PERSONAL" || requested === "CLOSED"
    ? requested
    : "BLOCK";
}

/**
 * Dia e hora de uma hora vazia da Semana (`?date=AAAA-MM-DD&time=HH:MM`):
 * só a sugestão inicial do intervalo, de uma hora; tudo continua editável.
 */
function initialSlotFromLocation(): {
  date: string;
  endTime: string;
  startTime: string;
} {
  const fallback = {
    date: isoDate(new Date()),
    endTime: "10:00",
    startTime: "09:00",
  };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date");
  const time = params.get("time");
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const hour =
    time && /^\d{2}:00$/.test(time) ? Number(time.slice(0, 2)) : null;
  if (hour === null || hour > 23) {
    return { ...fallback, date: validDate ?? fallback.date };
  }
  return {
    date: validDate ?? fallback.date,
    endTime: hour === 23 ? "23:59" : `${String(hour + 1).padStart(2, "0")}:00`,
    startTime: `${String(hour).padStart(2, "0")}:00`,
  };
}

/**
 * "Bloquear horário" (D-169, revisão de 2026-10-12): uma tela só, direto no
 * período, que cabe no celular sem rolar. A etapa que perguntava o tipo saiu
 * porque os três tipos pareciam a mesma coisa. Agora:
 *
 * - "Dia inteiro" ligado fecha a data (`POST /v1/availability-exceptions/
 *   unavailable`, sem horário);
 * - com período, é sempre `POST /v1/time-blocks`: `kind` `BLOCK` (pausa no
 *   atendimento) ou `PERSONAL`, pela chave "É um compromisso pessoal", que
 *   fica em "Título e motivo". A chave mantém o compromisso distinguível na
 *   agenda (Goal016): bloqueio e compromisso nunca são a mesma coisa com
 *   outra cor.
 *
 * Período parcial de dia fechado (exceção com horário) não é mais criado
 * aqui. Barra empurrada com "×" do novo agendamento, sem cartão de resumo.
 * O dia fechado que cobre atendimento confirmado é recusado pelo contrato
 * (`409 EXCEPTION_APPOINTMENT_CONFLICT`); a tela mostra o que será afetado e
 * só reenvia com `decidedReason` explícito. `decidedBy` não é campo: o ator
 * vem da sessão.
 */
export function BlockForm() {
  // O calendário que a Agenda já leu nesta aba (D-167) abre o formulário na
  // hora; a leitura abaixo revalida (D-168).
  const [calendar, setCalendar] = useState<CalendarState | null>(
    recalledCalendar,
  );
  const [initialType] = useState(initialTypeFromLocation);
  const [personal, setPersonal] = useState(initialType === "PERSONAL");
  const [allDay, setAllDay] = useState(initialType === "CLOSED");
  const [title, setTitle] = useState("");
  const [initialSlot] = useState(initialSlotFromLocation);
  const [date, setDate] = useState(initialSlot.date);
  const [startTime, setStartTime] = useState(initialSlot.startTime);
  const [endTime, setEndTime] = useState(initialSlot.endTime);
  const [reason, setReason] = useState("");
  const [decidedReason, setDecidedReason] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<Created | null>(null);
  const [loading, setLoading] = useState(calendar === null);
  // Esqueleto só se a carga passar de ~150 ms, e nunca sob o splash (D-168).
  const showSkeleton = useDeferredLoading(loading);
  // Depois do splash da marca a tela se apresenta: barra, depois o corpo.
  const presenting = useSplashPresenting();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extrasOpen, setExtrasOpen] = useState(initialType === "PERSONAL");
  const focusExtras = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const readOnly = Boolean(
    calendar && !calendar.capabilities.manageAvailability,
  );
  const formShown = !loading && !readOnly && !created;

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

  // Ao abrir, o foco vai para o título do formulário. No próximo quadro,
  // porque a casca leva o foco ao `main` na troca de rota, depois dos efeitos
  // desta tela.
  useEffect(() => {
    if (!formShown) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [formShown]);

  // Abrir os opcionais leva o foco ao primeiro campo que apareceu.
  useEffect(() => {
    if (!extrasOpen || !focusExtras.current) return;
    focusExtras.current = false;
    document
      .getElementById(allDay ? "block-reason" : "block-personal")
      ?.focus();
  }, [extrasOpen, allDay]);

  function openExtras() {
    focusExtras.current = true;
    setExtrasOpen(true);
  }

  /** O intervalo mudou: o conflito lido para o anterior não vale mais. */
  function changed(field: Field) {
    setConflict(null);
    setFieldErrors((current) => {
      if (!current[field] && !(field !== "endTime" && current.endTime)) {
        return current;
      }
      const next = { ...current, [field]: undefined };
      if (field === "startTime") next.endTime = undefined;
      return next;
    });
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!date) errors.date = "Informe a data.";
    if (!allDay) {
      if (!startTime) errors.startTime = "Informe o início.";
      if (!endTime) errors.endTime = "Informe o fim.";
      if (!errors.startTime && !errors.endTime && endTime <= startTime) {
        errors.endTime = "O fim deve ser posterior ao início.";
      }
    }
    if (allDay && conflict && !decidedReason.trim()) {
      errors.decidedReason =
        "Descreva o motivo da decisão. Sem motivo, o fechamento não é enviado.";
    }
    return errors;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!calendar?.timezone || busy) return;
    const errors = validate();
    setFieldErrors(errors);
    const first = (
      ["date", "startTime", "endTime", "decidedReason"] as const
    ).find((field) => errors[field]);
    if (first) {
      document.getElementById(`block-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (allDay) await createClosed();
      else await createBlock(personal ? "PERSONAL" : "BLOCK");
    } finally {
      setBusy(false);
    }
  }

  async function createBlock(kind: TimeBlockKind) {
    const timezone = calendar?.timezone;
    if (!timezone) return;
    try {
      const block = await getProductServices().calendar.createTimeBlock({
        endAt: zonedDateTimeToIso(date, endTime, timezone),
        kind,
        reason: reason.trim() || null,
        startAt: zonedDateTimeToIso(date, startTime, timezone),
        title: title.trim() || null,
      });
      setCreated({ block, type: "block" });
    } catch (caught) {
      setError(
        requestError(
          caught,
          kind === "PERSONAL"
            ? "Não foi possível criar o compromisso pessoal."
            : "Não foi possível bloquear o horário.",
        ),
      );
    }
  }

  async function createClosed() {
    try {
      const exception =
        await getProductServices().calendar.createUnavailability({
          date,
          decidedReason: conflict ? decidedReason.trim() : undefined,
          endTime: undefined,
          reason: reason.trim() || undefined,
          startTime: undefined,
        });
      setConflict(null);
      setDecidedReason("");
      setCreated({ exception, type: "closed" });
    } catch (caught) {
      if (
        schedulingRefusalCode(caught) === "EXCEPTION_APPOINTMENT_CONFLICT" &&
        !conflict
      ) {
        await openConflict();
        return;
      }
      setError(requestError(caught, "Não foi possível fechar a agenda."));
    }
  }

  async function openConflict() {
    setConflictLoading(true);
    const entries = await readOccupancy(date, calendar?.timezone);
    setConflict({
      entries: entries
        ? occupyingEntries(entries, {
            date,
            durationMinutes: MINUTES_PER_DAY,
            startTime: "00:00",
          }).filter((entry) => entry.kind === "appointment")
        : null,
    });
    setConflictLoading(false);
  }

  async function remove() {
    if (!created || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (created.type === "block") {
        await getProductServices().calendar.deleteTimeBlock(created.block.id);
      } else {
        await getProductServices().calendar.removeAvailabilityException(
          created.exception.id,
        );
      }
      setCreated(null);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível remover."));
    } finally {
      setBusy(false);
    }
  }

  const errorAlert = error && (
    <p className="form-error" role="alert">
      {error}
    </p>
  );

  let body;
  if (loading) {
    body = showSkeleton ? <AgendaLoading /> : null;
  } else if (readOnly) {
    body = (
      <>
        {errorAlert}
        <ReadOnlyState operation="bloquear horários" />
      </>
    );
  } else if (created) {
    body = (
      <CreatedState
        busy={busy}
        created={created}
        error={errorAlert}
        onRemove={() => void remove()}
        timezone={calendar?.timezone}
      />
    );
  } else {
    body = (
      <form
        aria-labelledby="block-form-title"
        className="block-flow-body"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        {errorAlert}
        <h2
          className="block-flow-title"
          id="block-form-title"
          ref={headingRef}
          tabIndex={-1}
        >
          Quando?
        </h2>
        <div className="block-flow-fields">
          <BlockField
            error={fieldErrors.date}
            id="block-date"
            label="Data"
            wide
          >
            <DateField
              min={isoDate(new Date())}
              required
              value={date}
              onValueChange={(value) => {
                setDate(value);
                changed("date");
              }}
            />
          </BlockField>
          <BlockSwitch
            checked={allDay}
            id="block-allDay"
            label="Dia inteiro"
            onToggle={() => {
              setAllDay((value) => !value);
              changed("startTime");
            }}
          />
          {!allDay && (
            <>
              <BlockField
                error={fieldErrors.startTime}
                id="block-startTime"
                label="Início"
              >
                <TimeField
                  required
                  value={startTime}
                  onValueChange={(value) => {
                    setStartTime(value);
                    changed("startTime");
                  }}
                />
              </BlockField>
              <BlockField
                error={fieldErrors.endTime}
                id="block-endTime"
                label="Fim"
              >
                <TimeField
                  required
                  value={endTime}
                  onValueChange={(value) => {
                    setEndTime(value);
                    changed("endTime");
                  }}
                />
              </BlockField>
            </>
          )}
          {extrasOpen && !allDay && (
            <>
              <BlockSwitch
                checked={personal}
                id="block-personal"
                label="É um compromisso pessoal"
                onToggle={() => setPersonal((value) => !value)}
              />
              {/* Título e motivo lado a lado: com as duas chaves, a tela
                  aberta continua sem rolar no celular. */}
              <BlockField id="block-title" label="Título (opcional)">
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={personal ? "Ex.: Dentista" : "Ex.: Almoço"}
                  value={title}
                />
              </BlockField>
            </>
          )}
          {extrasOpen && (
            <BlockField
              id="block-reason"
              label="Motivo (opcional)"
              wide={allDay}
            >
              <input
                onChange={(event) => setReason(event.target.value)}
                placeholder={allDay ? "Ex.: Feriado local" : undefined}
                value={reason}
              />
            </BlockField>
          )}
          {/* Os opcionais ficam recolhidos para a tela caber no celular sem
              rolar, mesmo com um aviso da casca no topo; "Repetir em dias
              fixos" divide a mesma linha e só vale para período. */}
          {(!extrasOpen || !allDay) && (
            <div className="block-flow-extras">
              {!extrasOpen && (
                <button
                  aria-expanded={false}
                  className="block-flow-extra"
                  onClick={openExtras}
                  type="button"
                >
                  <Icon name="plus" />
                  {allDay ? "Motivo" : "Título e motivo"}
                </button>
              )}
              {!allDay && (
                <Link
                  className="block-flow-extra"
                  href="/agenda/bloquear/serie"
                >
                  <Icon name="refresh" />
                  Repetir em dias fixos
                </Link>
              )}
            </div>
          )}
          {allDay && conflictLoading && (
            <p className="block-flow-wide muted" role="status">
              Consultando o que este fechamento afeta…
            </p>
          )}
          {allDay && conflict && !conflictLoading && (
            <ClosedConflict
              conflict={conflict}
              decidedReason={decidedReason}
              error={fieldErrors.decidedReason}
              onDecidedReason={(value) => {
                setDecidedReason(value);
                setFieldErrors((current) => ({
                  ...current,
                  decidedReason: undefined,
                }));
              }}
            />
          )}
        </div>
        <div className="block-flow-actions">
          <Button loading={busy} type="submit">
            {allDay
              ? conflict
                ? "Confirmar mesmo assim"
                : "Confirmar fechamento"
              : personal
                ? "Confirmar compromisso"
                : "Confirmar bloqueio"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <AppointmentFlowShell
      bare
      calendar={calendar}
      loading={loading}
      title="Bloquear horário"
    >
      <div
        className={clsx("block-flow", presenting && "is-presenting")}
        data-presenting={presenting ? "true" : undefined}
      >
        <PushedBar
          backHref="/agenda"
          backIcon="x"
          backLabel="Fechar bloqueio"
          title="Bloquear horário"
        />
        {body}
      </div>
    </AppointmentFlowShell>
  );
}

/** Chave liga/desliga de uma linha, com o rótulo à esquerda. */
function BlockSwitch({
  checked,
  id,
  label,
  onToggle,
}: {
  checked: boolean;
  id: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="block-flow-switch">
      <span id={`${id}-label`}>{label}</span>
      <button
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        className="agenda-days-switch"
        id={id}
        onClick={onToggle}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="agenda-days-knob" />
      </button>
    </div>
  );
}

/** O dia fechado cobre atendimento confirmado: o que é afetado e o motivo da decisão. */
function ClosedConflict({
  conflict,
  decidedReason,
  error,
  onDecidedReason,
}: {
  conflict: Conflict;
  decidedReason: string;
  error?: string;
  onDecidedReason: (value: string) => void;
}) {
  return (
    <section
      aria-labelledby="block-conflict-title"
      className="agenda-conflict block-flow-wide"
    >
      <h3 id="block-conflict-title">
        Este fechamento cobre atendimento já confirmado
      </h3>
      {conflict.entries === null ? (
        <p className="muted">
          Não foi possível listar o que este fechamento afeta. A agenda recusou
          o pedido mesmo assim.
        </p>
      ) : conflict.entries.length === 0 ? (
        <p className="muted">
          Nenhum atendimento desta agenda cobre o intervalo, mas a agenda
          recusou o pedido: confirme com um motivo para seguir mesmo assim.
        </p>
      ) : (
        <ul className="agenda-conflict-list">
          {conflict.entries.map((entry) => {
            const presentation = describeEntry(entry);
            return (
              <li key={entry.key}>
                <span className="agenda-item-kind">
                  <Icon name={presentation.icon} />
                  {presentation.typeLabel}
                </span>
                <strong>{presentation.title}</strong>
                {presentation.detail && <span>{presentation.detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <BlockField
        error={error}
        id="block-decidedReason"
        label="Motivo da decisão"
        wide
      >
        <input
          onChange={(event) => onDecidedReason(event.target.value)}
          value={decidedReason}
        />
      </BlockField>
    </section>
  );
}

function CreatedState({
  busy,
  created,
  error,
  onRemove,
  timezone,
}: {
  busy: boolean;
  created: Created;
  error: ReactElement | null | false | "";
  onRemove: () => void;
  timezone?: string | null;
}) {
  let eyebrow: string;
  let heading: string;
  let rows: Array<{ label: string; value: string }>;
  if (created.type === "block") {
    const { block } = created;
    eyebrow = `${timeBlockKindLabel(block.kind)} confirmado`;
    heading = block.title ?? timeBlockKindLabel(block.kind);
    rows = [
      { label: "Início", value: formatIsoDateTime(block.startAt, timezone) },
      { label: "Fim", value: formatIsoDateTime(block.endAt, timezone) },
      { label: "Motivo", value: block.reason ?? "Não informado" },
    ];
  } else {
    const { exception } = created;
    const whole = !exception.startTime || !exception.endTime;
    eyebrow = whole ? "Dia fechado confirmado" : "Período fechado confirmado";
    heading = formatDate(exception.date);
    rows = [
      {
        label: "Horário",
        value: whole
          ? "Dia inteiro"
          : `${exception.startTime} às ${exception.endTime}`,
      },
      { label: "Motivo", value: exception.reason ?? "Não informado" },
      ...(exception.decidedReason
        ? [{ label: "Decisão", value: exception.decidedReason }]
        : []),
    ];
  }
  return (
    <section aria-labelledby="block-created" className="block-flow-body">
      {error}
      <div className="block-flow-heading">
        <p className="block-flow-step">{eyebrow}</p>
        <h2 id="block-created">{heading}</h2>
      </div>
      <div className="agenda-summary-list">
        {rows.map((row) => (
          <SummaryRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
      <div className="block-flow-actions">
        <Button
          loading={busy}
          onClick={onRemove}
          type="button"
          variant="danger"
        >
          Remover
        </Button>
        <Button href="/agenda">Voltar à agenda</Button>
      </div>
    </section>
  );
}

/** Campo com rótulo e erro inline ligado por `aria-describedby` e `aria-invalid`. */
function BlockField({
  children,
  error,
  id,
  label,
  wide = false,
}: {
  children: ReactElement<InputHTMLAttributes<HTMLInputElement>>;
  error?: string;
  id: string;
  label: string;
  wide?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div
      className={clsx(
        "field block-flow-field",
        wide && "is-wide",
        error && "field-error",
      )}
    >
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, {
        "aria-describedby": error ? errorId : undefined,
        "aria-invalid": error ? true : undefined,
        className: "input",
        id,
      })}
      {error && (
        <span className="field-help" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

function formatIsoDateTime(value: string, timezone?: string | null): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone ?? undefined,
  }).format(new Date(value));
}
