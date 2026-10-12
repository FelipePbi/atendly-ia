"use client";

import { useId, useState } from "react";

import type { Service } from "@/data";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import { Icon } from "@/shared/icons/Icon";
import { useSheetClose } from "@/shared/motion/sheetClose";

import { durationLabel, normalize } from "./NewAppointmentFields";
import type { ServiceColorMap } from "./occupancy";

/** A partir de quantos serviços a folha ganha a busca por nome. */
const SEARCH_FROM = 8;

/**
 * "Ver outros serviços" do novo agendamento (D-170, pedido de 2026-10-12): os
 * serviços que ficaram fora dos 5 mais usados, na folha padrão (D-166) —
 * embaixo no celular, diálogo centrado de 768 px em diante. Escolher um
 * serviço fecha a folha e o adiciona à seleção; quem chama passa a mostrá-lo
 * entre os chips, então a seleção nunca fica escondida.
 */
export function MoreServicesSheet({
  colors,
  onChoose,
  onClose,
  services,
}: {
  colors: ServiceColorMap;
  onChoose: (service: Service) => void;
  onClose: () => void;
  services: Service[];
}) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const searchable = services.length >= SEARCH_FROM;
  const needle = normalize(query.trim());
  const shown = needle
    ? services.filter((item) => normalize(item.name).includes(needle))
    : services;

  return (
    <ChatSheetShell
      className="is-agenda-services"
      initialFocusSelector={searchable ? 'input[type="search"]' : undefined}
      onClose={onClose}
      title="Outros serviços"
      titleId={titleId}
    >
      <div className="agenda-services-head">
        <h2 className="agenda-services-title" id={titleId}>
          Outros serviços
        </h2>
        <CloseButton />
      </div>
      {searchable && (
        <input
          aria-label="Buscar serviço"
          autoComplete="off"
          className="input agenda-services-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar serviço"
          type="search"
          value={query}
        />
      )}
      {shown.length === 0 ? (
        <p className="agenda-services-empty" role="status">
          Nenhum serviço com “{query.trim()}”.
        </p>
      ) : (
        <ul aria-label="Serviços" className="agenda-services-list">
          {shown.map((item) => (
            <li key={item.id}>
              <ServiceOption
                color={colors.get(item.id)}
                onChoose={onChoose}
                service={item}
              />
            </li>
          ))}
        </ul>
      )}
    </ChatSheetShell>
  );
}

function CloseButton() {
  const close = useSheetClose();
  return (
    <button
      aria-label="Fechar"
      className="agenda-services-close"
      onClick={() => close?.()}
      type="button"
    >
      <Icon name="x" />
    </button>
  );
}

function ServiceOption({
  color,
  onChoose,
  service,
}: {
  color: string | undefined;
  onChoose: (service: Service) => void;
  service: Service;
}) {
  const close = useSheetClose();
  return (
    <button
      className="agenda-services-option"
      onClick={() => {
        // A folha sai e o serviço entra na seleção no mesmo quadro.
        if (close) close(() => onChoose(service));
        else onChoose(service);
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="agenda-appt-service-dot"
        data-color={color}
      />
      <span className="agenda-services-name">{service.name}</span>
      <span className="sr-only"> · </span>
      <small>{durationLabel(service.durationMinutes ?? 0)}</small>
    </button>
  );
}
