"use client";

import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/shared/icons/Icon";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { useSystemStatus } from "@/shared/runtime/systemStatus";

import { MoreMenu } from "./MoreMenu";
import { notificationsBadgeLabel } from "./navigation";
import { useShellConfig } from "./ShellConfig";

/**
 * Tela "Mais" (pedido de 2026-10-18, D-186): o que era a folha do botão
 * "Mais" da barra inferior vira uma tela de navegação, com voltar à tela
 * anterior. Tocar numa opção navega para ela.
 */
export function MoreScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { setUnauthenticated } = useProductRuntime();
  const status = useSystemStatus();

  useShellConfig({ active: "mais", title: "Mais" });

  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  function back() {
    // Veio de outra tela do app: volta para ela; aberta direto, vai ao Início.
    if (window.history.length > 1) router.back();
    else router.push("/inicio");
  }

  async function logout() {
    await getProductServices()
      .auth.logout()
      .catch(() => undefined);
    setUnauthenticated();
    router.replace("/login");
  }

  return (
    <section className="directory-page more-page">
      <div className="pushed-bar">
        <button
          aria-label="Voltar"
          className="pushed-bar-back is-titled"
          data-motion="back"
          onClick={back}
          type="button"
        >
          <Icon name="chevron-left" />
        </button>
        <div className="pushed-bar-title">
          <h1>Mais</h1>
        </div>
        <span aria-hidden="true" className="pushed-bar-spacer" />
      </div>
      <MoreMenu
        isCurrent={isCurrent}
        notificationsBadge={notificationsBadgeLabel(
          status.notificationsSummary?.unreadCount ?? 0,
        )}
        onLogout={() => void logout()}
      />
    </section>
  );
}
