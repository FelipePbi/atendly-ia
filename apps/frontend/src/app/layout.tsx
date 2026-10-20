import "./globals.css";

import type { Metadata, Viewport } from "next";

import { ProductRuntimeProvider } from "@/shared/runtime/ProductRuntime";
import { DEFAULT_BROWSER_THEME_COLOR } from "@/shared/theme/appearance";
import { AppearanceBootScript } from "@/shared/theme/AppearanceBootScript";
import { AppearanceProvider } from "@/shared/theme/AppearanceProvider";
import { OrientationBootScript } from "@/shared/ui/OrientationBootScript";
import { OrientationGuard } from "@/shared/ui/OrientationGuard";
import { RouteAnnouncer } from "@/shared/ui/RouteAnnouncer";

export const metadata: Metadata = {
  title: { default: "Avenly", template: "%s · Avenly" },
  description: "Atendimento e agendamento pelo WhatsApp, com apoio de IA.",
  icons: [
    { rel: "icon", url: "/brand/avenly-icon.svg", type: "image/svg+xml" },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Padrão claro; com outra aparência, o provider troca pela cor do fundo.
  themeColor: DEFAULT_BROWSER_THEME_COLOR,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // O script do <head> põe `data-accent`/`data-theme` no <html> antes da
  // primeira pintura (D-181); o React não declara esses atributos. O outro
  // trava o retrato só no celular instalado (D-211).
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <AppearanceBootScript />
        <OrientationBootScript />
      </head>
      <body>
        <ProductRuntimeProvider>
          <AppearanceProvider>
            <RouteAnnouncer />
            {children}
          </AppearanceProvider>
        </ProductRuntimeProvider>
        <OrientationGuard />
      </body>
    </html>
  );
}
