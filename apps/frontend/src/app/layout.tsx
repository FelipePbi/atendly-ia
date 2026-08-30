import "./globals.css";

import type { Metadata, Viewport } from "next";

import { ProductRuntimeProvider } from "@/shared/runtime/ProductRuntime";
import { RouteAnnouncer } from "@/shared/ui/RouteAnnouncer";

export const metadata: Metadata = {
  title: { default: "Atendly", template: "%s — Atendly" },
  description: "Atendimento e agendamento pelo WhatsApp, com apoio de IA.",
  icons: [{ rel: "icon", url: "/brand/atendly-favicon-32x32.png" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7faf8",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <ProductRuntimeProvider>
          <RouteAnnouncer />
          {children}
        </ProductRuntimeProvider>
      </body>
    </html>
  );
}
