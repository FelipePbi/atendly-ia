"use client";

import Link from "next/link";

import type { SettingsState } from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";

import { sourceLabel, toneLabel } from "./shared/labels";
import { SettingsPage } from "./shared/SettingsPage";

type HubCard = {
  copy: string;
  href: string;
  icon: IconName;
  title: string;
};

/**
 * Hub de Configurações (Goal024/WU-01): entradas na ordem do vault —
 * Negócio, Agenda (com Disponibilidade só quando a fonte é Atendly), IA,
 * WhatsApp, Importação, Conversas, Conta. Importação é entrada própria
 * apontando direto para `/importacao`; `ImportSettingsSection` (Goal020, o
 * bloco que vivia dentro de Agenda) saiu do repositório junto desta troca,
 * porque perdeu o único consumidor que tinha.
 */
export function SettingsHub({ settings }: { settings: SettingsState }) {
  const cards: HubCard[] = [
    {
      href: "/configuracoes/negocio",
      icon: "briefcase",
      title: "Negócio",
      copy: settings.business?.name ?? "Complete seus dados",
    },
    {
      href: "/configuracoes/agenda",
      icon: "calendar",
      title: "Agenda",
      copy: sourceLabel(settings.calendar.source),
    },
  ];
  if (settings.calendar.source === "ATENDLY")
    cards.push({
      href: "/configuracoes/disponibilidade",
      icon: "clock",
      title: "Disponibilidade",
      copy: "Dias e horários habituais",
    });
  cards.push(
    {
      href: "/configuracoes/ia",
      icon: "spark",
      title: "Atendente virtual",
      copy: toneLabel(settings.ai.tone),
    },
    {
      href: "/configuracoes/whatsapp",
      icon: "chat",
      title: "WhatsApp",
      copy: "Conexão e recuperação da sessão",
    },
    {
      href: "/importacao",
      icon: "refresh",
      title: "Importação",
      copy: "Traga dados do Minha Agenda",
    },
    {
      href: "/configuracoes/conversas",
      icon: "chat",
      title: "Conversas",
      copy: "Prazo de retenção das mensagens",
    },
    {
      href: "/configuracoes/conta",
      icon: "user",
      title: "Conta",
      copy: "Senha e acesso",
    },
  );

  return (
    <SettingsPage
      title="Configurações"
      description="Gerencie os dados e conexões usados pela operação."
    >
      <div className="settings-hub-grid">
        {cards.map((card) => (
          <Link className="settings-hub-card" href={card.href} key={card.href}>
            <span className="settings-hub-icon">
              <Icon name={card.icon} />
            </span>
            <span className="settings-hub-copy">
              <strong>{card.title}</strong>
              <span>{card.copy}</span>
            </span>
            <Icon name="chevron-right" />
          </Link>
        ))}
      </div>
    </SettingsPage>
  );
}
