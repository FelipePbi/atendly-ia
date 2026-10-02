"use client";

import { Icon } from "@/shared/icons/Icon";

import {
  type AgendaEntry,
  appointmentServiceColors,
  daySummaryHeading,
  describeEntry,
  entriesForDate,
  parseDate,
  type ServiceColorMap,
} from "./occupancy";

interface ServiceCount {
  color: string | null;
  count: number;
  name: string;
}

function serviceCounts(
  dayEntries: AgendaEntry[],
  colors: ServiceColorMap,
): ServiceCount[] {
  const counts = new Map<string, ServiceCount>();
  for (const entry of dayEntries) {
    if (entry.kind !== "appointment" || !entry.appointment) continue;
    const tokens = appointmentServiceColors(entry.appointment, colors);
    entry.appointment.services.forEach((service, index) => {
      const current = counts.get(service.serviceId);
      if (current) {
        current.count += 1;
        return;
      }
      counts.set(service.serviceId, {
        color: tokens[index] ?? null,
        count: 1,
        name: service.name,
      });
    });
  }
  return Array.from(counts.values());
}

/**
 * Cartão de resumo do dia focado, compartilhado pela Semana e pelo Mês
 * (A10/A11): quantos atendimentos, quais serviços (com a cor do catálogo) e os
 * bloqueios e compromissos do dia, mais o caminho para abrir o Dia.
 */
export function DaySummaryCard({
  date,
  entries,
  hasAvailability = null,
  isToday,
  onOpenDay,
  serviceColors,
}: {
  date: string;
  entries: AgendaEntry[];
  hasAvailability?: boolean | null;
  isToday: boolean;
  onOpenDay: (date: Date) => void;
  serviceColors: ServiceColorMap;
}) {
  const dayEntries = entriesForDate(entries, date);
  const appointmentCount = dayEntries.filter(
    (entry) => entry.kind === "appointment",
  ).length;
  const services = serviceCounts(dayEntries, serviceColors);
  const others = dayEntries
    .filter((entry) => entry.kind === "block" || entry.kind === "personal")
    .map((entry) => describeEntry(entry).title);
  const heading = daySummaryHeading(date, isToday);

  return (
    <section aria-label="Resumo do dia" className="agenda-day-summary-card">
      <span className="agenda-summary-heading">
        {heading}
        {appointmentCount > 0 && (
          <span className="agenda-summary-count">
            {" "}
            · {appointmentCount}{" "}
            {appointmentCount === 1 ? "atendimento" : "atendimentos"}
          </span>
        )}
      </span>
      <div className="agenda-summary-chips">
        {appointmentCount === 0 && (
          <span className="agenda-summary-empty">
            {hasAvailability === false
              ? "Você não atende neste dia."
              : "Nenhum atendimento neste dia."}
          </span>
        )}
        {services.map((service) => (
          <span className="agenda-summary-chip" key={service.name}>
            <span
              aria-hidden="true"
              className="agenda-summary-dot"
              data-color={service.color ?? undefined}
            />
            {service.name}
            {service.count > 1 ? ` ×${service.count}` : ""}
          </span>
        ))}
        {others.length > 0 && (
          <span className="agenda-summary-others">
            + {others.join(" · ")}
          </span>
        )}
      </div>
      <button
        className="agenda-summary-open"
        onClick={() => onOpenDay(parseDate(date))}
        type="button"
      >
        Abrir dia
        <Icon name="chevron-right" />
      </button>
    </section>
  );
}
