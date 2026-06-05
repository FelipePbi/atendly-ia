"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Bot, Building2, LogOut, MessageSquare, Smartphone, UserRound, UserX } from "lucide-react";
import { clsx } from "clsx";
import { useDashboard } from "@/components/layout/DashboardContext";

const navGroups = [
  {
    label: "Automação / IA",
    items: [
      { href: "/chat", label: "Chat", icon: MessageSquare },
      { href: "/automation/ai", label: "Atendente Virtual", icon: Bot },
      { href: "/automation/business", label: "Regras de Negócios", icon: Building2 },
      { href: "/automation/ignored-contacts", label: "Lista de ignorados", icon: UserX },
    ],
  },
  {
    label: "Configurações",
    items: [
      { href: "/settings/whatsapp", label: "WhatsApp", icon: Smartphone },
      { href: "/settings/account", label: "Conta", icon: UserRound },
    ],
  },
];

export function AppSidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useDashboard();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await signOut({ redirect: false });
    onNavigate?.();
    router.replace("/login");
  }

  return (
    <aside className={clsx("h-full w-64 shrink-0 border-r border-border bg-surface", className)}>
      <div className="flex h-full flex-col">
        <Link className="flex min-h-16 items-center gap-3 border-b border-border px-4" href="/chat" onClick={onNavigate}>
          <Image
            className="h-11 w-11 shrink-0 object-contain"
            src="/brand/atendly-logo-icon.png"
            alt=""
            width={44}
            height={44}
            priority
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-foreground">Atendly</span>
            <span className="block truncate text-xs text-muted">{user.email}</span>
          </span>
        </Link>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div className="mb-5" key={group.label}>
              <p className="px-2 text-[11px] font-black uppercase tracking-normal text-muted">{group.label}</p>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

                  return (
                    <Link
                      className={clsx(
                        "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-bold transition",
                        active
                          ? "bg-brand/10 text-brand-strong"
                          : "text-muted hover:bg-surface-muted hover:text-foreground"
                      )}
                      href={item.href}
                      key={item.href}
                      onClick={onNavigate}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <button
            className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-bold text-muted transition hover:bg-surface-muted hover:text-foreground"
            type="button"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
