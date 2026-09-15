"use client";

import { type FormEvent, useEffect, useState } from "react";

import {
  type Appointment,
  type AppointmentLifecycle,
  type AppointmentNotification,
  type AppointmentNotificationReason,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import { formatMoney } from "./AppointmentFlowShell";
import { requestError, statusLabel } from "./occupancy";

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
 * Estado, presença e valor final são eixos independentes (Goal008): concluir
 * não confirma presença, confirmar presença não fecha valor, e nenhum dos
 * três infere o outro. Cada linha aqui representa um eixo — nunca uma ação
 * genérica de "editar agendamento".
 */
export function LifecycleActions({
  appointment,
  onUpdated,
}: {
  appointment: Appointment;
  onUpdated: (lifecycle: AppointmentLifecycle) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noShowNote, setNoShowNote] = useState("");
  const [finalValueOpen, setFinalValueOpen] = useState(false);
  const [finalValueInput, setFinalValueInput] = useState("");
  const [notifications, setNotifications] = useState<AppointmentNotification[]>(
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .calendar.listAppointmentNotifications(appointment.id, controller.signal)
      .then(setNotifications)
      // Leitura auxiliar: falhar aqui não afirma nem esconde um estado real,
      // só deixa de mostrar as linhas de envio — nunca bloqueia o ciclo.
      .catch(() => undefined);
    return () => controller.abort();
  }, [appointment.id]);

  const visible = visibleNotifications(notifications);
  const reminders = visible.filter(
    (notification) => notification.kind === "REMINDER",
  );
  const changeNotices = visible.filter(
    (notification) => notification.kind === "CHANGE_NOTICE",
  );

  const status = normalizedStatus(appointment.status);
  const canComplete = status === "CONFIRMED";
  const canMarkNoShow = status === "CONFIRMED" || status === "COMPLETED";
  const canConfirmPresence =
    status !== "CANCELLED" && !appointment.presenceConfirmedAt;
  const canSetFinalValue = status !== "CANCELLED";

  async function complete() {
    setBusy("complete");
    setError(null);
    try {
      onUpdated(
        await getProductServices().calendar.completeAppointment(
          appointment.id,
        ),
      );
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível concluir o atendimento."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitNoShow(event: FormEvent) {
    event.preventDefault();
    setBusy("no-show");
    setError(null);
    try {
      onUpdated(
        await getProductServices().calendar.markAppointmentNoShow(
          appointment.id,
          { note: noShowNote.trim() || undefined },
        ),
      );
      setNoShowOpen(false);
      setNoShowNote("");
    } catch (caught) {
      setError(requestError(caught, "Não foi possível marcar a falta."));
    } finally {
      setBusy(null);
    }
  }

  async function confirmPresence() {
    setBusy("confirm-presence");
    setError(null);
    try {
      onUpdated(
        await getProductServices().calendar.confirmAppointmentPresence(
          appointment.id,
        ),
      );
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível confirmar a presença."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitFinalValue(event: FormEvent) {
    event.preventDefault();
    const amount = Number(finalValueInput.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Informe um valor final válido.");
      return;
    }
    setBusy("final-value");
    setError(null);
    try {
      onUpdated(
        await getProductServices().calendar.setAppointmentFinalValue(
          appointment.id,
          { amount },
        ),
      );
      setFinalValueOpen(false);
      setFinalValueInput("");
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível registrar o valor final."),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="agenda-lifecycle">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="agenda-lifecycle-row">
        <div>
          <strong>Estado</strong>
          <span>
            {status === "COMPLETED" && appointment.completionOrigin === "AUTO"
              ? "Concluído automaticamente"
              : statusLabel(appointment.status)}
          </span>
        </div>
        <div className="agenda-lifecycle-actions">
          {canComplete && (
            <Button
              loading={busy === "complete"}
              onClick={() => void complete()}
              type="button"
              variant="secondary"
            >
              Concluir atendimento
            </Button>
          )}
          {canMarkNoShow && (
            <Button
              onClick={() => setNoShowOpen((value) => !value)}
              type="button"
              variant="secondary"
            >
              Marcar falta
            </Button>
          )}
        </div>
      </div>
      {noShowOpen && (
        <form
          className="agenda-lifecycle-form"
          onSubmit={(event) => void submitNoShow(event)}
        >
          <label className="field">
            <span>Observação da falta (opcional)</span>
            <textarea
              onChange={(event) => setNoShowNote(event.target.value)}
              rows={3}
              value={noShowNote}
            />
          </label>
          <div className="agenda-form-footer">
            <Button
              onClick={() => setNoShowOpen(false)}
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

      <div className="agenda-lifecycle-row">
        <div>
          <strong>Presença</strong>
          <span>
            {appointment.presenceConfirmedAt
              ? "Presença confirmada"
              : "Aguardando confirmação"}
          </span>
        </div>
        {canConfirmPresence && (
          <Button
            loading={busy === "confirm-presence"}
            onClick={() => void confirmPresence()}
            type="button"
            variant="secondary"
          >
            Confirmar presença
          </Button>
        )}
      </div>

      {/* Estado do lembrete **desta ocorrência**, lido das intenções que a
          própria mutação criou — não da configuração do negócio, que só diz
          com quanta antecedência ele sairia. Sem nenhuma intenção (negócio
          sem lembrete configurado, atendimento passado, importação antiga),
          nenhum estado de lembrete é afirmado. */}
      {reminders.length > 0 && (
        <div className="agenda-lifecycle-row">
          <div>
            <strong>Lembrete</strong>
            {reminders.map((notification) => (
              <span key={notification.id}>
                {reminderLineLabel(notification, reminders.length)} ·{" "}
                {notificationStateLabel(notification)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Aviso de alteração pedido em cancelar ou remarcar: eixo próprio, e
          não uma variação do lembrete. Um lembrete já enviado não é desfeito
          por remarcação posterior — os dois convivem no detalhe. */}
      {changeNotices.length > 0 && (
        <div className="agenda-lifecycle-row">
          <div>
            <strong>Aviso de alteração</strong>
            {changeNotices.map((notification) => (
              <span key={notification.id}>
                {notificationStateLabel(notification)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="agenda-lifecycle-row">
        <div>
          <strong>Valor final</strong>
          <span>
            {appointment.finalValue === null
              ? "Ainda não registrado"
              : formatMoney(appointment.finalValue)}
          </span>
        </div>
        {canSetFinalValue && (
          <Button
            onClick={() => setFinalValueOpen((value) => !value)}
            type="button"
            variant="secondary"
          >
            Registrar valor final
          </Button>
        )}
      </div>
      {finalValueOpen && (
        <form
          className="agenda-lifecycle-form"
          onSubmit={(event) => void submitFinalValue(event)}
        >
          <label className="field">
            <span>Valor efetivamente cobrado (R$)</span>
            <input
              inputMode="decimal"
              onChange={(event) => setFinalValueInput(event.target.value)}
              required
              value={finalValueInput}
            />
          </label>
          <div className="agenda-form-footer">
            <Button
              onClick={() => setFinalValueOpen(false)}
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
    </div>
  );
}
