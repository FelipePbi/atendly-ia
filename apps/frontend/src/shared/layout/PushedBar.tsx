"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/shared/icons/Icon";

export type PushedBarMenuItem = {
  label: string;
  onSelect: () => void;
};

type PushedBarProps = {
  /** Sem ele não há voltar: só o `⋯` (painel do Dia ao lado da lista, D-165). */
  backHref?: string;
  backIcon?: "chevron-left" | "x";
  backLabel?: string;
  /** Esconde o voltar de 1024 px em diante, mesmo com título (N1): a lista já está ao lado. */
  hideBackWide?: boolean;
  /** `h2` quando outro cabeçalho da tela já é o `h1` (lista em painel na rota do hub). */
  headingLevel?: "h1" | "h2";
  /** Título centralizado da barra (CL4, S4); sem ele o voltar some de 1024 px em diante (CL5). */
  title?: string;
  /** Linha pequena sob o título, como "alterações não salvas" (S4). */
  subtitle?: string;
  menuItems?: PushedBarMenuItem[];
  menuLabel?: string;
};

/**
 * Barra própria da tela empurrada: voltar à esquerda e menu `⋯` à direita.
 * De 1024 px em diante a lista fica ao lado e o voltar some (continua
 * ocupando o lugar para o título não pular), como no quadro do protótipo.
 */
export function PushedBar({
  backHref,
  backIcon = "chevron-left",
  backLabel,
  headingLevel: Heading = "h1",
  hideBackWide = false,
  subtitle,
  title,
  menuItems,
  menuLabel = "Mais ações",
}: PushedBarProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="pushed-bar">
      {backHref && (
        <Link
          aria-label={backLabel}
          className={clsx(
            "pushed-bar-back",
            title && "is-titled",
            hideBackWide && "is-hidden-wide",
          )}
          data-motion="back"
          href={backHref}
        >
          <Icon name={backIcon} />
        </Link>
      )}
      {title && (
        <div className="pushed-bar-title">
          <Heading>{title}</Heading>
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
      {title && !(menuItems && menuItems.length > 0) && (
        <span aria-hidden="true" className="pushed-bar-spacer" />
      )}
      {menuItems && menuItems.length > 0 && (
        <div
          className="dropdown pushed-bar-menu"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !open) return;
            event.preventDefault();
            setOpen(false);
            event.currentTarget
              .querySelector<HTMLButtonElement>(".pushed-bar-more")
              ?.focus();
          }}
          ref={rootRef}
        >
          <button
            aria-controls={open ? menuId : undefined}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={menuLabel}
            className="pushed-bar-more"
            type="button"
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name="dots" />
          </button>
          {open && (
            <div className="menu" id={menuId} role="menu">
              {menuItems.map((item) => (
                <button
                  className="menu-item"
                  key={item.label}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
