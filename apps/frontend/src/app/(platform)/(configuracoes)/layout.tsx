import { SettingsWorkspace } from "@/features/settings/SettingsWorkspace";

/**
 * A lista de Configurações e a leitura das configurações moram aqui, e não em
 * cada página: o layout persiste entre o hub, as seções de `/configuracoes` e
 * `/importacao` (que a lista também oferece), então trocar de seção não
 * remonta a lista nem busca de novo o que é comum a todas.
 */
export default function ConfiguracoesGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsWorkspace>{children}</SettingsWorkspace>;
}
