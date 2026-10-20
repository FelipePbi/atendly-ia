import { redirect } from "next/navigation";

/** As configurações do retorno moram no próprio Retorno (D-210). */
export default function LegacyReturnSettingsPage() {
  redirect("/retorno/configuracoes");
}
