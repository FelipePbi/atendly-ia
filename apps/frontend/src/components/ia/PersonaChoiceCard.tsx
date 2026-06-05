"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import {
  PERSONA_DEFINITIONS,
  type VirtualAttendantAssistantSex,
  type VirtualAttendantPersonaType,
} from "@/lib/virtual-attendant";

type PersonaGender = "feminino" | "masculino";
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

const personaVisuals: Record<
  VirtualAttendantPersonaType,
  {
    icon: string;
    minHeight: string;
    content: string;
    character: string;
    characterBox: string;
    iconBubble: string;
    quote: string;
    quoteIcon: string;
    waveBase: string;
    waveAccent: string;
    selectedWaveBase: string;
    selectedWaveAccent: string;
  }
> = {
  CORPORATE: {
    icon: "/personas-ui/icons/briefcase.svg",
    minHeight: "min-h-[148px] sm:min-h-[158px]",
    content: "ml-[34%] px-0 py-3 pr-3 sm:ml-[35%] sm:py-4 sm:pr-4",
    character: "left-[10px] top-2 bottom-2",
    characterBox: "w-[26%] max-w-[96px] sm:max-w-[108px]",
    iconBubble: "bg-[rgba(220,237,229,0.82)]",
    quote: "border-[rgba(7,148,95,0.16)] bg-white/75",
    quoteIcon: "text-[#07945f]",
    waveBase: "bg-[rgba(220,237,229,0.72)]",
    waveAccent: "bg-[rgba(7,148,95,0.13)]",
    selectedWaveBase: "bg-[rgba(215,240,230,0.92)]",
    selectedWaveAccent: "bg-[rgba(7,148,95,0.22)]",
  },
  WARM: {
    icon: "/personas-ui/icons/heart.svg",
    minHeight: "min-h-[152px] sm:min-h-[162px]",
    content: "ml-[34%] px-0 py-3 pr-3 sm:ml-[35%] sm:py-4 sm:pr-4",
    character: "left-[8px] top-1.5 bottom-[-4px]",
    characterBox: "w-[30%] max-w-[112px] sm:max-w-[124px]",
    iconBubble: "bg-[rgba(220,237,229,0.86)]",
    quote: "border-[rgba(7,148,95,0.18)] bg-white/72",
    quoteIcon: "text-[#07945f]",
    waveBase: "bg-[rgba(220,237,229,0.78)]",
    waveAccent: "bg-[rgba(7,148,95,0.16)]",
    selectedWaveBase: "bg-[rgba(215,240,230,0.96)]",
    selectedWaveAccent: "bg-[rgba(7,148,95,0.24)]",
  },
  CUSTOM: {
    icon: "/personas-ui/icons/magic.svg",
    minHeight: "min-h-[142px] sm:min-h-[152px]",
    content: "ml-[34%] px-0 py-3 pr-3 sm:ml-[35%] sm:py-4 sm:pr-4",
    character: "left-[10px] top-2 bottom-2",
    characterBox: "w-[27%] max-w-[98px] sm:max-w-[110px]",
    iconBubble: "bg-[rgba(237,231,247,0.95)]",
    quote: "border-[rgba(122,76,194,0.18)] bg-white/76",
    quoteIcon: "text-[#7a4cc2]",
    waveBase: "bg-[rgba(237,231,247,0.86)]",
    waveAccent: "bg-[rgba(122,76,194,0.15)]",
    selectedWaveBase: "bg-[rgba(237,231,247,0.92)]",
    selectedWaveAccent: "bg-[rgba(122,76,194,0.2)]",
  },
};

export function resolvePersonaImage(
  persona: VirtualAttendantPersonaType,
  sex: VirtualAttendantAssistantSex
): string {
  return personaImages[persona][sex];
}

function toPersonaGender(sex: VirtualAttendantAssistantSex): PersonaGender {
  return sex === "MALE" ? "masculino" : "feminino";
}

export function PersonaChoiceCard({
  persona,
  selected,
  visualSex,
  onSelect,
  children,
}: {
  persona: VirtualAttendantPersonaType;
  selected: boolean;
  visualSex: VirtualAttendantAssistantSex;
  onSelect: () => void;
  children?: ReactNode;
}) {
  const definition = PERSONA_DEFINITIONS[persona];
  const visual = personaVisuals[persona];
  const assetId = personaAssetIds[persona];
  const gender = toPersonaGender(visualSex);

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-[18px] border bg-white text-[#0f1f1d] transition",
        selected
          ? "border-[#07945f] shadow-[0_10px_22px_rgba(7,148,95,0.1)]"
          : "border-[#dde4e0] shadow-[0_8px_18px_rgba(14,35,30,0.07)] hover:-translate-y-px hover:border-[#cbd8d1] hover:shadow-[0_12px_24px_rgba(14,35,30,0.09)]"
      )}
    >
      <button
        className={clsx(
          "relative isolate block w-full overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(247,250,248,0.96))] text-left outline-none transition active:scale-[0.995] focus-visible:ring-4 focus-visible:ring-[#07945f]/25",
          visual.minHeight
        )}
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        data-persona={assetId}
      >
        <span
          className={clsx(
            "pointer-events-none absolute bottom-[-54%] left-[-38%] z-0 h-[112%] w-[70%] rotate-[-18deg] rounded-[48%_52%_44%_56%]",
            selected ? visual.selectedWaveBase : visual.waveBase
          )}
          aria-hidden="true"
        />
        <span
          className={clsx(
            "pointer-events-none absolute bottom-[-34px] left-[-48%] z-[1] h-20 w-[88%] rotate-[-16deg] rounded-full",
            selected ? visual.selectedWaveAccent : visual.waveAccent
          )}
          aria-hidden="true"
        />

        <span className={clsx("pointer-events-none absolute z-[2] block", visual.character, visual.characterBox)} aria-hidden="true">
          <Image
            src={resolvePersonaImage(persona, visualSex)}
            alt={`Persona ${definition.title}`}
            fill
            sizes="(max-width: 360px) 96px, (max-width: 640px) 112px, 124px"
            className="object-contain object-bottom drop-shadow-[0_7px_9px_rgba(14,35,30,0.08)]"
            priority={selected}
          />
        </span>

        <span className={clsx("relative z-[3] block max-[360px]:ml-[32%] max-[360px]:pr-3", visual.content)}>
          <span className="mb-2 flex items-center gap-2 sm:mb-2.5">
            <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full sm:h-9 sm:w-9", visual.iconBubble)}>
              <Image src={visual.icon} alt="" width={19} height={19} aria-hidden="true" />
            </span>
            <span className="min-w-0 whitespace-nowrap text-[clamp(18px,1.8vw,23px)] font-black leading-none tracking-normal text-[#0f1f1d]">
              {definition.title}
            </span>
          </span>

          <span className="block text-[clamp(11.5px,1.1vw,13.5px)] font-medium leading-[1.38] text-[#647370]">
            {definition.description}
          </span>

          <span
            className={clsx(
              "relative mt-2.5 block rounded-[14px] border py-2.5 pl-8 pr-3 text-[clamp(11.5px,1.05vw,13px)] leading-[1.38] text-[#172522] shadow-[0_5px_12px_rgba(14,35,30,0.03)] backdrop-blur-[2px] sm:mt-3 sm:pl-9",
              visual.quote
            )}
          >
            <span
              className={clsx("absolute left-3 top-1 text-[24px] font-black leading-none", visual.quoteIcon)}
              aria-hidden="true"
            >
              “
            </span>
            {definition.preview}
          </span>
        </span>

        {selected ? (
          <span className="absolute right-2.5 top-2.5 z-[4] grid h-8 w-8 place-items-center rounded-full bg-[linear-gradient(135deg,#0ca76d,#078553)] shadow-[0_7px_12px_rgba(7,148,95,0.2)] sm:right-3 sm:top-3 sm:h-9 sm:w-9">
            <Image src="/personas-ui/icons/check.svg" alt="" width={21} height={21} aria-hidden="true" />
          </span>
        ) : null}

        <span className="sr-only">
          {selected ? "Persona selecionada" : "Selecionar persona"} {definition.title} {gender}
        </span>
      </button>
      {children ? <div className="border-t border-[#dde4e0] bg-white px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-4">{children}</div> : null}
    </div>
  );
}
