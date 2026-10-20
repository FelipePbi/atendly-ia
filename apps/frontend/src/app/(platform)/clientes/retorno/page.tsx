import { redirect } from "next/navigation";

/** O retorno saiu de Clientes e virou destino do menu (D-210). */
export default function LegacyCustomerReturnPage() {
  redirect("/retorno");
}
