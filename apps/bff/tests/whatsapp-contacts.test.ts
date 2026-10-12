import { describe, expect, it } from "vitest";

import { selectWhatsappContacts } from "../src/lib/whatsapp-contacts.js";

/**
 * Contatos do número conectado para a escolha dos contatos ignorados: só
 * pessoas, um por número, melhor nome, busca sem acento, ordem alfabética.
 * Sem HTTP, sem Evolution.
 */
const raw = [
  { Jid: "5511999990001@s.whatsapp.net", FullName: "Ana Beatriz", PushName: "Bia" },
  { Jid: "5511999990002@s.whatsapp.net", PushName: "Júlio" },
  { Jid: "5511999990003@s.whatsapp.net" },
  { Jid: "120363000000000000@g.us", FullName: "Grupo da família" },
  { Jid: "status@broadcast", FullName: "Status" },
  { Jid: "123456789012345@lid", FullName: "Interno" },
  { Jid: "5511999990004@s.whatsapp.net", FirstName: "Mãe" },
  { Jid: "5511999990009@s.whatsapp.net", FullName: "Eu mesmo" },
  // Mesmo número de novo, agora com nome: fica o nome.
  { Jid: "5511999990003@s.whatsapp.net", BusinessName: "Barbearia do Zé" },
];

describe("selectWhatsappContacts", () => {
  it("só pessoas, um por número, com o melhor nome, em ordem alfabética", () => {
    expect(
      selectWhatsappContacts(raw, { excludePhone: "5511999990009", limit: 50 }),
    ).toEqual([
      { name: "Ana Beatriz", phone: "5511999990001" },
      { name: "Barbearia do Zé", phone: "5511999990003" },
      { name: "Júlio", phone: "5511999990002" },
      { name: "Mãe", phone: "5511999990004" },
    ]);
  });

  it("busca por nome sem acento nem caixa, e por dígitos do telefone", () => {
    expect(
      selectWhatsappContacts(raw, { limit: 50, search: "julio" }).map((c) => c.phone),
    ).toEqual(["5511999990002"]);
    expect(
      selectWhatsappContacts(raw, { limit: 50, search: "MAE" }).map((c) => c.phone),
    ).toEqual(["5511999990004"]);
    expect(
      selectWhatsappContacts(raw, { limit: 50, search: "9990001" }).map((c) => c.phone),
    ).toEqual(["5511999990001"]);
  });

  it("sem nome vai para o fim e o limite corta", () => {
    const list = selectWhatsappContacts(
      [
        { Jid: "5511988880000@s.whatsapp.net" },
        { Jid: "5511977770000@s.whatsapp.net", FullName: "Zé" },
      ],
      { limit: 1 },
    );
    expect(list).toEqual([{ name: "Zé", phone: "5511977770000" }]);
  });
});
