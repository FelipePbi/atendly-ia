"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { WIDE_LAYOUT_QUERY } from "@/shared/layout/useWideLayout";
import { Dialog } from "@/shared/ui/Dialog";

import { NotificationsDrawerContent } from "./NotificationsScreen";

/**
 * A partir desta largura (a mesma de lista e detalhe lado a lado) a central
 * abre como gaveta sobre a tela; abaixo dela o sino leva à central em tela
 * empurrada.
 */
export const NOTIFICATIONS_DRAWER_QUERY = WIDE_LAYOUT_QUERY;

type NotificationsDrawerValue = {
  isOpen: boolean;
  open: () => void;
};

const NotificationsDrawerContext = createContext<NotificationsDrawerValue | null>(
  null,
);

/**
 * Uma gaveta só por casca: o sino da Home e o item "Notificações" da sidebar
 * abrem a mesma. Fecha sozinha quando a rota muda — por exemplo, quando a
 * usuária segue o link de uma notificação ou o das preferências.
 */
export function NotificationsDrawerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // A rota em que a gaveta foi aberta: trocar de rota a fecha sem efeito.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const isOpen = openedAt !== null && openedAt === pathname;
  const open = useCallback(() => setOpenedAt(pathname), [pathname]);
  const close = useCallback(() => setOpenedAt(null), []);

  const value = useMemo(() => ({ isOpen, open }), [isOpen, open]);

  return (
    <NotificationsDrawerContext.Provider value={value}>
      {children}
      <Dialog
        onClose={close}
        open={isOpen}
        title="Notificações"
        variant="drawer"
      >
        <NotificationsDrawerContent onNavigate={close} />
      </Dialog>
    </NotificationsDrawerContext.Provider>
  );
}

/** `null` fora da casca: quem chama cai no link para `/notificacoes`. */
export function useNotificationsDrawer(): NotificationsDrawerValue | null {
  return useContext(NotificationsDrawerContext);
}

/**
 * Se a largura atual pede a gaveta. Começa `false` — no servidor e no
 * primeiro render o sino é o link, que funciona em qualquer largura — e
 * acompanha a mudança de largura depois de montar.
 */
export function useNotificationsDrawerViewport(): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(NOTIFICATIONS_DRAWER_QUERY);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return matches;
}
