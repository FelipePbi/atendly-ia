"use client";

import { AgendaBoard } from "./AgendaBoard";
import { AppointmentDetail } from "./AppointmentDetail";
import { AppointmentForm } from "./AppointmentForm";
import { AvailabilityExceptions } from "./AvailabilityExceptions";
import { BlockForm } from "./BlockForm";
import { BlockSeriesForm } from "./BlockSeriesForm";
import { CancelFlow } from "./CancelFlow";
import { RescheduleFlow } from "./RescheduleFlow";

/**
 * Despacho dos estados da Agenda (D-031): um branch mutuamente exclusivo por
 * cenário, e cada branch declara `useShellConfig` uma única vez, dentro do
 * componente que ele monta.
 *
 * Cada cenário aqui é alcançável por uma rota de `app/(platform)/agenda/`:
 * fluxo que existe como componente e não tem cenário é fluxo que o produto
 * não entrega.
 */
type AgendaScenario =
  | "block-series"
  | "block-time"
  | "cancel"
  | "detail"
  | "exceptions"
  | "list"
  | "new"
  | "reschedule";

export function ProductAgendaScreen({
  appointmentId,
  customerId,
  initialDate,
  repeat = false,
  returnTo,
  scenario = "list",
}: {
  appointmentId?: string;
  /** Pessoa escolhida de antemão para um agendamento novo (Goal075). */
  customerId?: string;
  /**
   * Dia escolhido numa hora vazia da Semana, para um agendamento novo; na
   * Agenda, o `?dia=` em que ela abre (volta do detalhe, D-167).
   */
  initialDate?: string;
  /** "Repetir este atendimento" já ligado no agendamento novo (D-171). */
  repeat?: boolean;
  /** `?voltar=` do detalhe, de Remarcar e de Cancelar: para onde o "voltar" leva (D-167). */
  returnTo?: string;
  scenario?: AgendaScenario;
}) {
  if (scenario === "list") return <AgendaBoard initialDate={initialDate} />;
  if (scenario === "new")
    return (
      <AppointmentForm
        customerId={customerId}
        initialDate={initialDate}
        initialRepeat={repeat}
      />
    );
  if (scenario === "block-time") return <BlockForm />;
  if (scenario === "block-series") return <BlockSeriesForm />;
  if (scenario === "exceptions") return <AvailabilityExceptions />;
  if (scenario === "detail")
    return (
      <AppointmentDetail appointmentId={appointmentId} returnTo={returnTo} />
    );
  if (scenario === "reschedule")
    return <RescheduleFlow appointmentId={appointmentId} returnTo={returnTo} />;
  return <CancelFlow appointmentId={appointmentId} returnTo={returnTo} />;
}
