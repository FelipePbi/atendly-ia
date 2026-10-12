import { describe, expect, it } from "vitest";

import { replyAllowedForPhone } from "../../src/modules/graph/message-graph.js";

/**
 * Validacao local de 2026-10-11 com o WhatsApp real: a IA respondeu um
 * contato pessoal do dono enquanto ele testava pelo proprio numero.
 * `AI_REPLY_ONLY_PHONES` limita a resposta aos numeros de teste.
 */
describe("replyAllowedForPhone", () => {
  it("lista vazia nao filtra ninguem", () => {
    expect(replyAllowedForPhone("5555999999999", "")).toBe(true);
  });

  it("com lista, so os numeros dela recebem resposta", () => {
    const list = "555596513889, +55 55 9999-0000";
    expect(replyAllowedForPhone("555596513889", list)).toBe(true);
    expect(replyAllowedForPhone("555599990000", list)).toBe(true);
    expect(replyAllowedForPhone("260506979930294", list)).toBe(false);
  });
});
