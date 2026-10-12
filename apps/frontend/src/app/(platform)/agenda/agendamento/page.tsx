import { ProductAgendaScreen } from "@/features/agenda/ProductAgendaScreen";
export default async function AppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; voltar?: string }>;
}) {
  const { id, voltar } = await searchParams;
  return (
    <ProductAgendaScreen
      appointmentId={id}
      returnTo={voltar}
      scenario="detail"
    />
  );
}
