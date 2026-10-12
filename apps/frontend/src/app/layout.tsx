import "./globals.css";

import type { Metadata, Viewport } from "next";

import { ProductRuntimeProvider } from "@/shared/runtime/ProductRuntime";
import { OrientationGuard } from "@/shared/ui/OrientationGuard";
import { RouteAnnouncer } from "@/shared/ui/RouteAnnouncer";

export const metadata: Metadata = {
  title: { default: "Avenly", template: "%s · Avenly" },
  description: "Atendimento e agendamento pelo WhatsApp, com apoio de IA.",
  icons: [{ rel: "icon", url: "/brand/avenly-icon.svg", type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f4ef",
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
        <OrientationGuard />
      </body>
    </html>
  );
}
