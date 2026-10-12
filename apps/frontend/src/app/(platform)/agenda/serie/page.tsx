import { redirect } from "next/navigation";

/**
 * A tela "Série de atendimentos" saiu (D-171, 2026-10-12): repetir é parte do
 * novo agendamento. O link antigo continua valendo e abre o novo agendamento
 * com "Repetir este atendimento" ligado.
 */
export default function AppointmentSeriesPage() {
  redirect("/agenda/novo?repetir=1");
}
