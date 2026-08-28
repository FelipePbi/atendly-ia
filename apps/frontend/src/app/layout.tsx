import type { Metadata, Viewport } from "next";
import { RouteAnnouncer } from "@/shared/ui/RouteAnnouncer";
import "./globals.css";

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
        <RouteAnnouncer />
        {children}
      </body>
    </html>
  );
}
