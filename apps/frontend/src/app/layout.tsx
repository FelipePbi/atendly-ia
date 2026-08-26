import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Sora } from "next/font/google";
import { RegistrationDraftProvider } from "@/components/auth/RegistrationDraftProvider";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atendly",
  description: "Painel mobile-first para atendimento via WhatsApp com IA.",
  icons: {
    icon: [
      { url: "/brand/atendly-favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/atendly-favicon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/atendly-favicon-512x512.png", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${sora.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <RegistrationDraftProvider>{children}</RegistrationDraftProvider>
      </body>
    </html>
  );
}
