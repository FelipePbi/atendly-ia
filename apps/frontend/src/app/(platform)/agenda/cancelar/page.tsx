import { ProductAgendaScreen } from "@/features/calendar/ProductAgendaScreen";

export default async function CancelAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <ProductAgendaScreen appointmentId={id} scenario="cancel" />;
}
