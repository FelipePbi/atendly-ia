import { ProductAgendaScreen } from "@/features/agenda/ProductAgendaScreen";

type AgendaSearchParams = Promise<{ dia?: string }>;

export default function AgendaPage({
  searchParams,
}: {
  searchParams?: AgendaSearchParams;
}) {
  // Montada sem a URL (renderização direta da página), a Agenda abre em hoje.
  if (!searchParams) return <ProductAgendaScreen />;
  return <AgendaAtDay searchParams={searchParams} />;
}

/**
 * `?dia=AAAA-MM-DD` (volta do detalhe, D-167). O dia vem do servidor: na
 * navegação pelo app, `window.location` ainda tem a URL anterior no primeiro
 * render.
 */
async function AgendaAtDay({ searchParams }: { searchParams: AgendaSearchParams }) {
  const { dia } = await searchParams;
  return <ProductAgendaScreen initialDate={dia} />;
}
