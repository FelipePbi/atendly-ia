"use client";

import { AgendaBoard } from "./AgendaBoard";
import { AppointmentDetail } from "./AppointmentDetail";
import { AppointmentForm } from "./AppointmentForm";
import { AvailabilityExceptions } from "./AvailabilityExceptions";
import { BlockForm } from "./BlockForm";
import { BlockSeriesForm } from "./BlockSeriesForm";
import { CancelFlow } from "./CancelFlow";
import { RescheduleFlow } from "./RescheduleFlow";
import { SeriesPreview } from "./SeriesPreview";

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
  | "appointment-series"
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
  scenario = "list",
}: {
  appointmentId?: string;
  /** Pessoa escolhida de antemão para um agendamento novo (Goal075). */
  customerId?: string;
  scenario?: AgendaScenario;
}) {
  if (scenario === "list") return <AgendaBoard />;
  if (scenario === "new") return <AppointmentForm customerId={customerId} />;
  if (scenario === "appointment-series") return <SeriesPreview />;
  if (scenario === "block-time") return <BlockForm />;
  if (scenario === "block-series") return <BlockSeriesForm />;
  if (scenario === "exceptions") return <AvailabilityExceptions />;
  if (scenario === "detail")
    return <AppointmentDetail appointmentId={appointmentId} />;
  if (scenario === "reschedule")
    return <RescheduleFlow appointmentId={appointmentId} />;
  return <CancelFlow appointmentId={appointmentId} />;
}
