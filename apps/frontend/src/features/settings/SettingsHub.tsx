"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  onImportChanged,
  onRetentionChanged,
  onServicesChanged,
  type RetentionSettings,
  type SettingsState,
} from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { formatBrazilianPhone } from "@/shared/phone";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";
import {
  aiCardView,
  useSystemStatus,
  type UseSystemStatusResult,
} from "@/shared/runtime/systemStatus";

import type { ImportState } from "../imports/types";
import {
  importDetail,
  retentionDetail,
  servicesDetail,
  toneLabel,
} from "./shared/labels";

type HubRow = {
  detail: string | null;
  detailTone?: "review";
  href: string;
  icon: IconName | "ia";
  iaActive?: boolean;
  /** Linha que a barra lateral da casca já oferece: some junto com ela. */
  shellDuplicate?: boolean;
  title: string;
};

type HubGroup = { rows: HubRow[]; title: string };

type HubReadings = {
  importState: ImportState | null;
  retention: RetentionSettings | null;
  services: { active: boolean; needsReview: boolean }[] | null;
};

const HUB_MEMORY_KEY = "settings:hub";

const EMPTY_READINGS: HubReadings = {
  importState: null,
  retention: null,
  services: null,
};

/**
 * Cada leitura é independente e opcional: uma que falha ou ainda carrega deixa
 * a linha sem segunda linha. O hub nunca espera por elas nem exibe um valor
 * que não veio do BFF.
 *
 * O que já foi lido nesta aba aparece na hora (D-167) e é relido quando a
 * lista monta. Ao lado da seção aberta a lista fica montada entre as seções
 * (`SettingsWorkspace`) e só relê a leitura cujo dado mudou, pelo aviso de
 * mudança: serviços, importação ou retenção.
 */
function useHubReadings(): HubReadings {
  const [readings, setReadings] = useState<HubReadings>(
    () => recall<HubReadings>(HUB_MEMORY_KEY) ?? EMPTY_READINGS,
  );

  useEffect(() => {
    const controller = new AbortController();
    const services = getProductServices();
    const keep =
      <K extends keyof HubReadings>(key: K) =>
      (value: HubReadings[K]) =>
        setReadings((current) => {
          const next = { ...current, [key]: value };
          remember(HUB_MEMORY_KEY, next);
          return next;
        });
    const ignore = () => undefined;

    const readServices = () =>
      services.serviceCatalog
        .list(controller.signal)
        .then((result) => keep("services")(result.items))
        .catch(ignore);
    const readImportState = () =>
      services.migration
        .getImportState(controller.signal)
        .then(keep("importState"))
        .catch(ignore);
    const readRetention = () =>
      services.retention
        .get(controller.signal)
        .then(keep("retention"))
        .catch(ignore);
    void readServices();
    void readImportState();
    void readRetention();
    const unsubscribe = [
      onServicesChanged(() => void readServices()),
      onImportChanged(() => void readImportState()),
      onRetentionChanged(() => void readRetention()),
    ];
    return () => {
      controller.abort();
      for (const stop of unsubscribe) stop();
    };
  }, []);

  return readings;
}

function aiDetail(
  status: UseSystemStatusResult,
  ai: SettingsState["ai"],
): string | null {
  const tone = ai.tone;
  // Ligada, mas com o WhatsApp desconectado: a IA não atende, então ela
  // aparece pausada; ao reconectar, volta sozinha (pedido de 2026-10-16,
  // R11-302). Nunca ligada, segue "Desligada".
  if (ai.enabled && status.whatsappView === "off")
    return "Pausada · WhatsApp desconectado";
  const state =
    status.aiView === "active"
      ? "Ativa"
      : status.aiView === "pending"
        ? "Em ativação"
        : status.aiView === "off"
          ? "Desligada"
          : null;
  if (!state) return null;
  return tone ? `${state} · estilo ${toneLabel(tone)}` : state;
}

function whatsappDetail(status: UseSystemStatusResult): string | null {
  if (status.whatsappView === "off") return "Desconectado";
  if (status.whatsappView !== "active") return null;
  const phone = status.whatsapp?.phoneNumber
    ? formatBrazilianPhone(status.whatsapp.phoneNumber, "plus")
    : null;
  return phone ? `${phone} · conectado` : "Conectado";
}

function hubGroups(
  settings: SettingsState,
  status: UseSystemStatusResult,
  readings: HubReadings,
  email: string | null,
): HubGroup[] {
  const services = readings.services ? servicesDetail(readings.services) : null;
  const timeZone = settings.business?.timezone ?? "America/Sao_Paulo";
  return [
    {
      title: "Atendimento",
      rows: [
        {
          detail: services?.text ?? null,
          detailTone: services?.review ? "review" : undefined,
          href: "/servicos",
          icon: "nav-list",
          shellDuplicate: true,
          title: "Serviços",
        },
        {
          detail: aiDetail(status, settings.ai),
          href: "/configuracoes/ia",
          iaActive: status.aiView === "active" && status.whatsappView !== "off",
          icon: "ia",
          title: "IA",
        },
        {
          detail: whatsappDetail(status),
          href: "/configuracoes/whatsapp",
          icon: "phone",
          title: "WhatsApp",
        },
      ],
    },
    {
      title: "Seu negócio",
      rows: [
        {
          detail: "Endereço, pagamento, informações para a IA",
          href: "/configuracoes/negocio",
          icon: "map-pin",
          title: "Negócio",
        },
        {
          detail: "Horários, lembretes, regras de agendamento",
          href: "/configuracoes/agenda",
          icon: "nav-calendar",
          title: "Agenda",
        },
      ],
    },
    {
      title: "Dados e conta",
      rows: [
        {
          detail: readings.importState
            ? importDetail(readings.importState, timeZone)
            : null,
          href: "/importacao",
          icon: "import",
          title: "Importação",
        },
        {
          detail: readings.retention
            ? retentionDetail(readings.retention)
            : null,
          href: "/configuracoes/conversas",
          icon: "nav-chat",
          title: "Conversas",
        },
        {
          detail: "O que você e a IA fizeram",
          href: "/configuracoes/atividade",
          icon: "clock",
          title: "Atividade",
        },
        {
          detail: email,
          href: "/configuracoes/conta",
          icon: "nav-user",
          title: "Conta",
        },
      ],
    },
  ];
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function HubIdentity({
  settings,
  status,
}: {
  settings: SettingsState;
  status: UseSystemStatusResult;
}) {
  const business = settings.business;
  if (!business) return null;
  const pill = aiCardView(status.aiView, status.whatsappView);
  const subtitle = [business.category, business.address]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return (
    <div className="hub-identity">
      <span aria-hidden="true" className="hub-identity-avatar">
        {initials(business.name)}
      </span>
      <div className="hub-identity-copy">
        <strong>{business.name}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      <span className={clsx("hub-identity-pill", `is-${pill.tone}`)}>
        <span aria-hidden="true" className="hub-identity-pill-dot" />
        {pill.title}
      </span>
    </div>
  );
}

function HubBody({
  openHref,
  settings,
}: {
  openHref?: string;
  settings: SettingsState;
}) {
  const status = useSystemStatus();
  const { session } = useProductRuntime();
  const readings = useHubReadings();
  const groups = hubGroups(
    settings,
    status,
    readings,
    session?.user.email ?? null,
  );
  return (
    <>
      <HubIdentity settings={settings} status={status} />
      <div className="hub-groups">
        {groups.map((group) => (
          <section className="hub-group" key={group.title}>
            <h2 className="hub-group-title">{group.title}</h2>
            <div className="hub-group-card">
              {group.rows.map((row) => (
                <Link
                  aria-current={row.href === openHref ? "page" : undefined}
                  className={clsx(
                    "hub-row",
                    row.href === openHref && "is-open",
                    row.shellDuplicate && "hub-row-shell-duplicate",
                  )}
                  href={row.href}
                  key={row.href}
                >
                  {row.icon === "ia" ? (
                    <span aria-hidden="true" className="hub-row-ia">
                      <span
                        className={clsx(
                          "hub-row-ia-ring",
                          row.iaActive && "is-breathing",
                        )}
                      />
                      <span className="hub-row-ia-dot" />
                    </span>
                  ) : (
                    <Icon className="hub-row-icon" name={row.icon} />
                  )}
                  <span className="hub-row-copy">
                    <strong>{row.title}</strong>
                    {row.detail && (
                      <span
                        className={clsx(
                          "hub-row-detail",
                          row.detailTone === "review" && "is-review",
                          row.href === "/configuracoes/whatsapp" &&
                            "is-numeric",
                        )}
                      >
                        {row.detail}
                      </span>
                    )}
                  </span>
                  <Icon className="hub-row-chevron" name="chevron-right" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function SettingsHub({ settings }: { settings: SettingsState }) {
  return (
    <div className="hub">
      <h1 className="hub-title">Configurações</h1>
      <HubBody settings={settings} />
    </div>
  );
}

/**
 * Hub em painel (de 1024 px em diante): os mesmos grupos ao lado da seção
 * aberta, com o item aberto marcado. Não chama `useShellConfig`.
 */
export function SettingsHubPanel({
  heading: Heading,
  openHref,
  settings,
}: {
  heading: "h1" | "h2";
  openHref: string;
  settings: SettingsState;
}) {
  return (
    <div className="hub hub-panel">
      <Heading className="hub-title">Configurações</Heading>
      <HubBody openHref={openHref} settings={settings} />
    </div>
  );
}
