import { ProductAgendaScreen } from "@/features/agenda/ProductAgendaScreen";
export default async function AppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <ProductAgendaScreen appointmentId={id} scenario="detail" />;
}
