import type { MetadataRoute } from "next";

/**
 * Pedido de 2026-10-12: no celular, travar a orientação em retrato.
 * O navegador não deixa uma página travar a rotação; `orientation` só vale
 * quando a Avenly é instalada na tela inicial (display standalone). No
 * navegador comum, o aviso "Gire o celular" (OrientationGuard) cobre a tela.
 * Cores: canvas (`--at-color-canvas`), igual ao `themeColor` do layout raiz.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avenly",
    short_name: "Avenly",
    description: "Atendimento e agendamento pelo WhatsApp, com apoio de IA.",
    lang: "pt-BR",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f4ef",
    theme_color: "#f7f4ef",
    icons: [
      {
        src: "/brand/avenly-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
