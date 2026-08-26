"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import {
  type VirtualAttendantAssistantSex,
  type VirtualAttendantPersonaType,
} from "@/lib/virtual-attendant";

type PersonaAssetId = "corporativa" | "leve-proxima" | "personalizada";

const personaAssetIds: Record<VirtualAttendantPersonaType, PersonaAssetId> = {
  CORPORATE: "corporativa",
  WARM: "leve-proxima",
  CUSTOM: "personalizada",
};

const personaImages: Record<VirtualAttendantPersonaType, Record<VirtualAttendantAssistantSex, string>> = {
  CORPORATE: {
    FEMALE: "/personas-ui/personas/tight/feminino/corporativa.png",
    MALE: "/personas-ui/personas/tight/masculino/corporativa.png",
  },
  WARM: {
    FEMALE: "/personas-ui/personas/tight/feminino/leve-proxima.png",
    MALE: "/personas-ui/personas/tight/masculino/leve-proxima.png",
  },
  CUSTOM: {
    FEMALE: "/personas-ui/personas/tight/feminino/personalizada.png",
    MALE: "/personas-ui/personas/tight/masculino/personalizada.png",
  },
};

const personaPresentation: Record<
  VirtualAttendantPersonaType,
  { title: string; description: string; mobileDescription?: string; preview: string; mobilePreview?: string }
> = {
  CORPORATE: {
    title: "Corporativa",
    description: "Clara, objetiva e profissional.",
    preview: "“Olá! Posso ajudar com serviços, horários ou agendamentos.”",
    mobilePreview: "“Olá! Posso ajudar com horários e serviços.”",
  },
  WARM: {
    title: "Leve e próxima",
    description: "Natural, acolhedora e profissional.",
    mobileDescription: "Natural e acolhedora.",
    preview: "“Oi! Me conta como posso te ajudar 😊”",
  },
  CUSTOM: {
    title: "Personalizada",
    description: "Aprende a linguagem da sua marca.",
    mobileDescription: "Aprende a voz da sua marca.",
    preview: "“Adapto meu tom com base nas conversas reais do negócio.”",
    mobilePreview: "“Adapto meu tom às conversas do negócio.”",
  },
};

export function resolvePersonaImage(
  persona: VirtualAttendantPersonaType,
  sex: VirtualAttendantAssistantSex
): string {
  return personaImages[persona][sex];
}

export function PersonaChoiceCard({
  persona,
  selected,
  visualSex,
  onSelect,
  children,
  disabled = false,
}: {
  persona: VirtualAttendantPersonaType;
  selected: boolean;
  visualSex: VirtualAttendantAssistantSex;
  onSelect: () => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const assetId = personaAssetIds[persona];
  const presentation = personaPresentation[persona];

  return (
    <div className="persona-card-shell">
      <button
        className="persona-card"
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        disabled={disabled}
        data-persona={assetId}
      >
        <span className="persona-card__avatar" aria-hidden="true">
          <Image
            src={resolvePersonaImage(persona, visualSex)}
            alt=""
            fill
            sizes="(max-width: 767px) 88px, 220px"
            className="persona-card__image"
            loading={selected ? "eager" : "lazy"}
          />
        </span>

        <span className="persona-card__content">
          <span className="persona-card__title">{presentation.title}</span>
          <span className="persona-card__description">
            <span className="responsive-copy--desktop">{presentation.description}</span>
            <span className="responsive-copy--mobile">
              {presentation.mobileDescription ?? presentation.description}
            </span>
          </span>
          <span className="persona-card__quote">
            <span className="responsive-copy--desktop">{presentation.preview}</span>
            <span className="responsive-copy--mobile">{presentation.mobilePreview ?? presentation.preview}</span>
          </span>
        </span>

        {selected ? (
          <span className="persona-card__check" aria-hidden="true">
            ✓
          </span>
        ) : null}

        <span className="sr-only">
          {selected ? "Persona selecionada" : "Selecionar persona"} {presentation.title}
        </span>
      </button>

      {children ? <div className="persona-card__details">{children}</div> : null}
    </div>
  );
}
