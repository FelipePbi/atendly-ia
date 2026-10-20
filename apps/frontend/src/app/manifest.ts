import type { MetadataRoute } from "next";

/**
 * Sem `orientation` (D-211): o campo vale para todo aparelho onde a Avenly é
 * instalada, e o tablet deitado abria em retrato. O retrato do celular
 * instalado vem do script do `<head>` (`OrientationBootScript`); no
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
