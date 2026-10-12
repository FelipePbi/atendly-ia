import { ProductAgendaScreen } from "@/features/agenda/ProductAgendaScreen";
export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    customerId?: string;
    date?: string;
    dia?: string;
    repetir?: string;
  }>;
}) {
  const { customerId, date, dia, repetir } = await searchParams;
  return (
    <ProductAgendaScreen
      customerId={customerId}
      // `?date=` vem da hora vazia da Semana; `?dia=`, do dia aberto na Agenda.
      initialDate={date ?? dia}
      // `?repetir=1`: o link antigo da série (D-171).
      repeat={repetir === "1"}
      scenario="new"
    />
  );
}
