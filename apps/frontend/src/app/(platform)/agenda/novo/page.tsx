import { ProductAgendaScreen } from "@/features/agenda/ProductAgendaScreen";
export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;
  return <ProductAgendaScreen customerId={customerId} scenario="new" />;
}
