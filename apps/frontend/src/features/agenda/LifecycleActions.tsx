"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import {
  type Appointment,
  type AppointmentLifecycle,
  type AppointmentNotification,
  type AppointmentNotificationReason,
} from "@/data";
import { type PushedBarMenuItem } from "@/shared/layout/PushedBar";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import {
  recalledAppointmentNotifications,
  rememberAppointmentNotifications,
} from "./agendaMemory";
import { appointmentHasStarted, requestError } from "./occupancy";

type Busy = "complete" | "confirm-presence" | "final-value" | "no-show" | null;

/**
 * Motivo no vocabulário fechado do dono do dado, traduzido num lugar só. A
 * tela nunca inventa motivo: o que não está aqui não chega aqui.
 */
const NOTIFICATION_REASON_LABELS: Record<
  AppointmentNotificationReason,
  string
> = {
  LEAD_ALREADY_PASSED: "a antecedência configurada já tinha passado",
  APPOINTMENT_VERSION_SUPERSEDED: "o agendamento mudou antes do envio",
  APPOINTMENT_NOT_CONFIRMED: "o agendamento não estava confirmado",
  APPOINTMENT_CANCELLED: "o agendamento foi cancelado",
  APPOINTMENT_ALREADY_STARTED: "o atendimento já tinha começado",
  REMINDER_CONFIGURATION_CHANGED: "a configuração de lembretes mudou",
  CUSTOMER_WITHOUT_PHONE: "o cliente não tem telefone",
  CONTACT_IGNORED: "o contato está ignorado na IA",
  AI_NOT_ENABLED: "a IA não está habilitada",
  CHANNEL_NOT_CONNECTED: "o canal não está conectado",
  TRANSPORT_FAILED: "o canal recusou o envio",
  TRANSPORT_UNKNOWN: "não foi possível confirmar o envio",
  ATTEMPTS_EXHAUSTED: "as tentativas se esgotaram",
};

function formatInstant(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function reasonLabel(reason: AppointmentNotificationReason | null): string {
  return reason ? NOTIFICATION_REASON_LABELS[reason] : "motivo não registrado";
}

/**
 * O que aconteceu com **esta** intenção, lido do estado gravado. A entrega é
 * no mínimo uma vez e `TRANSPORT_UNKNOWN` é estado terminal de "pode ter
 * saído": dizer "não enviado" nesse caso seria afirmar mais do que qualquer
 * camada sabe, então ele tem texto próprio.
 */
function notificationStateLabel(notification: AppointmentNotification): string {
  switch (notification.state) {
    case "SENT":
      return notification.sentAt
        ? `Enviado em ${formatInstant(notification.sentAt)}`
        : "Enviado";
    case "PENDING":
    case "CLAIMED":
      return `Agendado para ${formatInstant(notification.dueAt)}`;
    case "FAILED":
      return notification.reason === "TRANSPORT_UNKNOWN"
        ? `Envio sem confirmação: ${reasonLabel(notification.reason)}`
        : `Não enviado: ${reasonLabel(notification.reason)}`;
    // `CANCELLED` nunca chega aqui: a intenção que deixou de valer é
    // filtrada antes de virar linha de tela.
    default:
      return `Não enviado: ${reasonLabel(notification.reason)}`;
  }
}

/**
 * Só o que aconteceu ou ainda vai acontecer com este compromisso. A intenção
 * `CANCELLED` deixou de valer — remarcar substitui o lembrete do horário
 * velho pelo do novo — e mostrá-la seria encher o detalhe de linhas que não
 * descrevem nem um envio nem uma espera. O lembrete que **já saiu** continua
 * na lista mesmo depois de uma remarcação: ele saiu de verdade.
 */
function visibleNotifications(
  notifications: AppointmentNotification[],
): AppointmentNotification[] {
  return notifications.filter(
    (notification) => notification.state !== "CANCELLED",
  );
}

/**
 * "Lembrete" quando há um só; "1º lembrete"/"2º lembrete" quando os dois
 * aparecem — a posição vem da configuração do negócio, e repetir o mesmo
 * rótulo em duas linhas não diria qual é qual.
 */
function reminderLineLabel(
  notification: AppointmentNotification,
  total: number,
): string {
  if (total < 2) return "Lembrete";
  return notification.slot === "SECOND" ? "2º lembrete" : "1º lembrete";
}

/**
 * `SCHEDULED` é o legado pré-Goal008: para decidir transição, ele é lido
 * como `CONFIRMED`, do mesmo jeito que `appointmentStatusLabel` já lê.
 */
function normalizedStatus(status: string): string {
  const upper = status.toUpperCase();
  return upper === "SCHEDULED" ? "CONFIRMED" : upper;
}

/**
 * Intenções de envio **deste** agendamento que ainda descrevem um envio ou
 * uma espera. Leitura auxiliar: falhar aqui não afirma nem esconde um estado
 * real, só deixa de mostrar as linhas de envio — nunca bloqueia o ciclo.
 */
export function useAppointmentNotifications(
  appointmentId: string | null,
): AppointmentNotification[] | null {
  // `null` enquanto a leitura não voltou; falha conta como nenhuma.
  // Os avisos vistos por último nesta aba aparecem na hora (D-168); a
  // leitura abaixo os substitui no lugar.
  const [notifications, setNotifications] = useState<
    AppointmentNotification[] | null
  >(() =>
    appointmentId ? recalledAppointmentNotifications(appointmentId) : null,
  );
  // Outro atendimento: recomeça pelo lembrado dele, ou pela linha reservada.
  const [forId, setForId] = useState(appointmentId);
  if (forId !== appointmentId) {
    setForId(appointmentId);
    setNotifications(
      appointmentId ? recalledAppointmentNotifications(appointmentId) : null,
    );
  }
  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    getProductServices()
      .calendar.listAppointmentNotifications(appointmentId, controller.signal)
      .then((result) => {
        setNotifications(result);
        rememberAppointmentNotifications(appointmentId, result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setNotifications([]);
      });
    return () => controller.abort();
  }, [appointmentId]);
  return notifications ? visibleNotifications(notifications) : null;
}

/**
 * As chamadas do ciclo do atendimento e quando cada uma é permitida, num
 * lugar só, para o menu "•••" do detalhe (`useLifecycleMenu`).
 */
function useLifecycleOperations(
  appointment: Appointment | null,
  onUpdated: (lifecycle: AppointmentLifecycle) => void,
) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const status = appointment ? normalizedStatus(appointment.status) : "";
  // O início já chegou (Goal069 AG-09): concluir ou marcar falta antes disso
  // afirmaria um atendimento que ainda não começou.
  const started = appointment ? appointmentHasStarted(appointment) : false;
  const canComplete = status === "CONFIRMED" && started;
  const canMarkNoShow =
    (status === "CONFIRMED" || status === "COMPLETED") && started;
  const canConfirmPresence = Boolean(
    appointment && status !== "CANCELLED" && !appointment.presenceConfirmedAt,
  );
  const canSetFinalValue = Boolean(appointment) && status !== "CANCELLED";

  async function run(
    kind: Exclude<Busy, null>,
    fallback: string,
    call: (id: string) => Promise<AppointmentLifecycle>,
  ): Promise<boolean> {
    if (!appointment) return false;
    setBusy(kind);
    setError(null);
    try {
      onUpdated(await call(appointment.id));
      return true;
    } catch (caught) {
      setError(requestError(caught, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const calendar = () => getProductServices().calendar;

  return {
    busy,
    canComplete,
    canConfirmPresence,
    canMarkNoShow,
    canSetFinalValue,
    error,
    setError,
    complete: () =>
      run("complete", "Não foi possível concluir o atendimento.", (id) =>
        calendar().completeAppointment(id),
      ),
    confirmPresence: () =>
      run("confirm-presence", "Não foi possível confirmar a presença.", (id) =>
        calendar().confirmAppointmentPresence(id),
      ),
    markNoShow: (note: string) =>
      run("no-show", "Não foi possível marcar a falta.", (id) =>
        calendar().markAppointmentNoShow(id, {
          note: note.trim() || undefined,
        }),
      ),
    setFinalValue: async (input: string) => {
      const amount = Number(input.replace(",", "."));
      if (!Number.isFinite(amount) || amount < 0) {
        setError("Informe um valor final válido.");
        return false;
      }
      return run(
        "final-value",
        "Não foi possível registrar o valor final.",
        (id) => calendar().setAppointmentFinalValue(id, { amount }),
      );
    },
  };
}

/**
 * As ações do ciclo do atendimento no menu "•••" do detalhe (A5, D-110 (c);
 * rota e painel do Dia, D-165). Estado, presença e valor final são eixos
 * independentes (Goal008): concluir não confirma presença, confirmar presença
 * não fecha valor. Concluir e Confirmar presença chamam direto; Não
 * compareceu e Registrar valor final abrem o formulário que pedem. Cada item
 * só existe quando a ação é permitida — agendamento cancelado não oferece
 * nenhum.
 */
export function useLifecycleMenu({
  appointment,
  onUpdated,
}: {
  appointment: Appointment | null;
  onUpdated: (lifecycle: AppointmentLifecycle) => void;
}): { menuItems: PushedBarMenuItem[]; panel: ReactNode } {
  const operations = useLifecycleOperations(appointment, onUpdated);
  const { busy, error, setError } = operations;
  const [open, setOpen] = useState<"final-value" | "no-show" | null>(null);
  const [noShowNote, setNoShowNote] = useState("");
  const [finalValueInput, setFinalValueInput] = useState("");

  const menuItems: PushedBarMenuItem[] = [];
  if (operations.canComplete)
    menuItems.push({
      label: "Concluir atendimento",
      onSelect: () => {
        setOpen(null);
        void operations.complete();
      },
    });
  if (operations.canMarkNoShow)
    menuItems.push({
      label: "Não compareceu",
      onSelect: () => {
        setError(null);
        setOpen("no-show");
      },
    });
  if (operations.canConfirmPresence)
    menuItems.push({
      label: "Confirmar presença",
      onSelect: () => {
        setOpen(null);
        void operations.confirmPresence();
      },
    });
  if (operations.canSetFinalValue)
    menuItems.push({
      label: "Registrar valor final",
      onSelect: () => {
        setError(null);
        setOpen("final-value");
      },
    });

  async function submitNoShow(event: FormEvent) {
    event.preventDefault();
    if (await operations.markNoShow(noShowNote)) {
      setOpen(null);
      setNoShowNote("");
    }
  }

  async function submitFinalValue(event: FormEvent) {
    event.preventDefault();
    if (await operations.setFinalValue(finalValueInput)) {
      setOpen(null);
      setFinalValueInput("");
    }
  }

  const panel = (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {open === "no-show" && operations.canMarkNoShow && (
        <form
          aria-label="Não compareceu"
          className="agenda-lifecycle-form agenda-appt-lifecycle-form"
          onSubmit={(event) => void submitNoShow(event)}
        >
          <label className="field">
            <span>Observação da falta (opcional)</span>
            <textarea
              autoFocus
              onChange={(event) => setNoShowNote(event.target.value)}
              rows={3}
              value={noShowNote}
            />
          </label>
          <div className="agenda-form-footer">
            <Button
              onClick={() => setOpen(null)}
              type="button"
              variant="secondary"
            >
              Voltar
            </Button>
            <Button loading={busy === "no-show"} type="submit" variant="danger">
              Confirmar falta
            </Button>
          </div>
        </form>
      )}
      {open === "final-value" && operations.canSetFinalValue && (
        <form
          aria-label="Registrar valor final"
          className="agenda-lifecycle-form agenda-appt-lifecycle-form"
          onSubmit={(event) => void submitFinalValue(event)}
        >
          <label className="field">
            <span>Valor efetivamente cobrado (R$)</span>
            <input
              autoFocus
              inputMode="decimal"
              onChange={(event) => setFinalValueInput(event.target.value)}
              required
              value={finalValueInput}
            />
          </label>
          <div className="agenda-form-footer">
            <Button
              onClick={() => setOpen(null)}
              type="button"
              variant="secondary"
            >
              Voltar
            </Button>
            <Button loading={busy === "final-value"} type="submit">
              Salvar valor final
            </Button>
          </div>
        </form>
      )}
    </>
  );

  return { menuItems, panel };
}

function formatReminderInstant(value: string): string {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(date)
    .replace("-feira", "");
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(date);
  return `${weekday}, ${day} às ${time}`;
}

/** Frase do quadro A5 para uma intenção, a partir do estado gravado. */
function reminderSentence(notification: AppointmentNotification): string {
  switch (notification.state) {
    case "SENT":
      return `Enviado ${formatReminderInstant(notification.sentAt ?? notification.dueAt)}.`;
    case "PENDING":
    case "CLAIMED":
      return `Será enviado ${formatReminderInstant(notification.dueAt)}.`;
    default:
      return `${notificationStateLabel(notification)}.`;
  }
}

/**
 * Seção "Lembrete" do detalhe (A5): o que aconteceu ou vai acontecer com o
 * lembrete **desta ocorrência**, lido das intenções gravadas — nunca de uma
 * data calculada na tela. Sem intenção nenhuma, nenhum estado é afirmado e a
 * seção não aparece. O aviso de alteração pedido ao cancelar ou remarcar
 * aparece junto, com rótulo próprio.
 */
export function AppointmentReminder({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const visible = useAppointmentNotifications(appointmentId);
  // Enquanto lê, reserva o bloco de uma linha (pedido de 2026-10-12): o
  // lembrete que chega não empurra Observações e Histórico para baixo.
  if (visible === null) return <AppointmentReminderReserved />;
  const reminders = visible.filter(
    (notification) => notification.kind === "REMINDER",
  );
  const changeNotices = visible.filter(
    (notification) => notification.kind === "CHANGE_NOTICE",
  );
  if (reminders.length === 0 && changeNotices.length === 0) return null;
  return (
    <section className="agenda-appt-block agenda-reveal">
      <h2 className="agenda-appt-label">Lembrete</h2>
      {reminders.map((notification) => (
        <p className="agenda-appt-text" key={notification.id}>
          {reminders.length > 1 &&
            `${reminderLineLabel(notification, reminders.length)}: `}
          {reminderSentence(notification)}
        </p>
      ))}
      {changeNotices.map((notification) => (
        <p className="agenda-appt-text" key={notification.id}>
          Aviso de alteração: {reminderSentence(notification)}
        </p>
      ))}
    </section>
  );
}

/**
 * O lugar do bloco de lembrete enquanto ele carrega: invisível e sem
 * esqueleto, na altura do bloco real (revisão de D-168, 2026-10-12).
 */
function AppointmentReminderReserved() {
  return (
    <div
      aria-hidden="true"
      className="agenda-appt-block agenda-appt-reminder-reserved"
    >
      <span className="agenda-appt-label">Lembrete</span>
      <p className="agenda-appt-text">Na véspera, pelo WhatsApp, às 18:00</p>
    </div>
  );
}
