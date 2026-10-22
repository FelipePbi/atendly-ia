/**
 * Goal151/WU-01 — a função pura que compara o serviço carregado com o estado
 * do formulário (normalizado como o `PATCH` o enviaria) e devolve as mudanças
 * reais e o texto da guarda "Salvar antes de sair?" (S9): cada campo com o
 * texto exato, na ordem; campo de volta ao original não conta; a junção com
 * um, dois e três ou mais itens; a segunda linha só com nome, duração, preço
 * ou intervalo.
 */

import { describe, expect, test } from "vitest";

import type { Service } from "@/data";
import {
  describeServiceChanges,
  SERVICE_SNAPSHOT_NOTE,
  type ServiceFormValues,
} from "@/features/services/serviceChanges";

function serviceFixture(overrides: Partial<Service> = {}): Service {
  return {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    colorToken: "SKY",
    description: null,
    durationMinutes: 45,
    id: "s1",
    name: "Corte feminino",
    needsReview: false,
    price: 90,
    priceType: "FIXED",
    recurrenceIntervalDays: null,
    reviewOrigin: null,
    ...overrides,
  };
}

/** O formulário recém-carregado com `service`: nada mudou. */
function untouched(service: Service): ServiceFormValues {
  return {
    active: service.active,
    aiInstruction: "Atende só com hora marcada.",
    aiInstructionOriginal: "Atende só com hora marcada.",
    aiInstructionReadError: false,
    bufferAfter: String(service.bufferAfterMinutes ?? 0),
    bufferBefore: String(service.bufferBeforeMinutes ?? 0),
    colorToken: service.colorToken ?? "",
    description: service.description ?? "",
    durationValue:
      service.durationMinutes === null ? "" : String(service.durationMinutes),
    name: service.name,
    priceCents: service.price === null ? null : Math.round(service.price * 100),
    priceType: service.priceType,
    recurrenceValue:
      service.recurrenceIntervalDays === null
        ? ""
        : String(service.recurrenceIntervalDays),
  };
}

function describe1(
  serviceOverrides: Partial<Service>,
  formOverrides: Partial<ServiceFormValues>,
) {
  const service = serviceFixture(serviceOverrides);
  return describeServiceChanges(service, {
    ...untouched(service),
    ...formOverrides,
  });
}

describe("Goal151 — describeServiceChanges", () => {
  test("sem mudança: nenhuma mudança, frase vazia e sem segunda linha", () => {
    const result = describe1({}, {});
    expect(result.hasChanges).toBe(false);
    expect(result.changes).toEqual([]);
    expect(result.sentence).toEqual([]);
    expect(result.sentenceText).toBe("");
    expect(result.snapshotNote).toBeNull();
  });

  test("o caso do quadro S9 dá exatamente a frase do protótipo", () => {
    const result = describe1({}, { durationValue: "50", priceCents: 9500 });
    expect(result.sentenceText).toBe(
      "Você mudou a duração (45 → 50 min) e o preço (R$ 90 → R$ 95) de Corte feminino.",
    );
    expect(result.snapshotNote).toBe(SERVICE_SNAPSHOT_NOTE);
    expect(result.snapshotNote).toBe(
      "Agendamentos já marcados continuam com os valores combinados na época.",
    );
  });

  test("a frase traz o rótulo de cada campo em destaque, para a interface pôr em <strong>", () => {
    const result = describe1({}, { durationValue: "50", priceCents: 9500 });
    expect(result.sentence).toEqual([
      { text: "Você mudou a " },
      { strong: true, text: "duração" },
      { text: " (45 → 50 min) e o " },
      { strong: true, text: "preço" },
      { text: " (R$ 90 → R$ 95) de Corte feminino." },
    ]);
  });

  describe("o texto de cada campo", () => {
    test("nome", () => {
      const result = describe1({}, { name: "Corte e escova" });
      expect(result.sentenceText).toBe(
        "Você mudou o nome (Corte feminino → Corte e escova) de Corte feminino.",
      );
    });

    test("duração abaixo de 60 min nos dois lados: '45 → 50 min'", () => {
      expect(describe1({}, { durationValue: "50" }).changes[0]).toMatchObject({
        detail: "45 → 50 min",
        field: "duration",
      });
    });

    test("duração com um lado de 60 min ou mais: cada lado por formatServiceDuration", () => {
      expect(
        describe1({ durationMinutes: 90 }, { durationValue: "120" }).changes[0]
          .detail,
      ).toBe("1 h 30 → 2 h");
      expect(
        describe1({ durationMinutes: 45 }, { durationValue: "90" }).changes[0]
          .detail,
      ).toBe("45 min → 1 h 30");
    });

    test("duração que some ou aparece: 'sem duração'", () => {
      expect(
        describe1({ durationMinutes: null }, { durationValue: "50" }).changes[0]
          .detail,
      ).toBe("sem duração → 50 min");
      expect(describe1({}, { durationValue: "" }).changes[0].detail).toBe(
        "45 min → sem duração",
      );
    });

    test("preço: valor", () => {
      expect(describe1({}, { priceCents: 9500 }).changes[0]).toMatchObject({
        article: "o",
        detail: "R$ 90 → R$ 95",
        field: "price",
        label: "preço",
      });
    });

    test("preço: tipo", () => {
      expect(
        describe1(
          { price: 60, priceType: "STARTING_AT" },
          { priceCents: null, priceType: "ON_REQUEST" },
        ).changes[0].detail,
      ).toBe("a partir de R$ 60 → sob consulta");
      expect(
        describe1({}, { priceType: "STARTING_AT" }).changes[0].detail,
      ).toBe("R$ 90 → a partir de R$ 90");
    });

    test("cor: nomes de colorTokenOptions e 'sem cor'", () => {
      expect(describe1({}, { colorToken: "AMBER" }).changes[0]).toMatchObject({
        article: "a",
        detail: "Ameixa → Terracota",
        label: "cor na agenda",
      });
      expect(describe1({}, { colorToken: "" }).changes[0].detail).toBe(
        "Ameixa → sem cor",
      );
      expect(
        describe1({ colorToken: null }, { colorToken: "ROSE" }).changes[0]
          .detail,
      ).toBe("sem cor → Rosa-antigo");
    });

    test("descrição: sem valores", () => {
      const change = describe1({}, { description: "Inclui lavagem" })
        .changes[0];
      expect(change).toMatchObject({
        article: "a",
        detail: null,
        field: "description",
        label: "descrição",
      });
      expect(
        describe1({}, { description: "Inclui lavagem" }).sentenceText,
      ).toBe("Você mudou a descrição de Corte feminino.");
    });

    test("recorrência: por formatServiceRecurrence e 'sem recorrência'", () => {
      expect(
        describe1({}, { recurrenceValue: "28" }).changes[0].detail,
      ).toBe("sem recorrência → a cada 4 semanas");
      expect(
        describe1({ recurrenceIntervalDays: 28 }, { recurrenceValue: "" })
          .changes[0].detail,
      ).toBe("a cada 4 semanas → sem recorrência");
      expect(
        describe1({ recurrenceIntervalDays: 28 }, { recurrenceValue: "10" })
          .changes[0].detail,
      ).toBe("a cada 4 semanas → a cada 10 dias");
    });

    test("intervalos: um ou os dois, sem valores", () => {
      expect(describe1({}, { bufferBefore: "10" }).sentenceText).toBe(
        "Você mudou o intervalo antes e depois de Corte feminino.",
      );
      const both = describe1({}, { bufferAfter: "5", bufferBefore: "10" });
      expect(both.changes).toHaveLength(1);
      expect(both.changes[0]).toMatchObject({
        article: "o",
        detail: null,
        field: "buffers",
        label: "intervalo antes e depois",
      });
    });

    test("instruções para a IA: só se a leitura não falhou", () => {
      expect(
        describe1({}, { aiInstruction: "Outra instrução." }).sentenceText,
      ).toBe("Você mudou as instruções para a IA de Corte feminino.");
      expect(
        describe1(
          {},
          { aiInstruction: "Outra instrução.", aiInstructionReadError: true },
        ).hasChanges,
      ).toBe(false);
    });

    test("status: ativo → inativo e inativo → ativo", () => {
      expect(describe1({}, { active: false }).changes[0]).toMatchObject({
        article: "o",
        detail: "ativo → inativo",
        field: "active",
        label: "status",
      });
      expect(
        describe1({ active: false }, { active: true }).changes[0].detail,
      ).toBe("inativo → ativo");
    });
  });

  describe("campo de volta ao valor original não conta", () => {
    test("o formulário igual ao serviço carregado não muda nada", () => {
      expect(describe1({}, {}).hasChanges).toBe(false);
    });

    test("duração e preço editados e devolvidos", () => {
      const service = serviceFixture();
      const edited = {
        ...untouched(service),
        durationValue: "50",
        priceCents: 9500,
      };
      expect(describeServiceChanges(service, edited).changes).toHaveLength(2);
      const back = { ...edited, durationValue: "45", priceCents: 9000 };
      expect(describeServiceChanges(service, back).hasChanges).toBe(false);
    });

    test("só o campo devolvido sai da frase", () => {
      const result = describe1(
        {},
        { durationValue: "45", name: "Corte e escova", priceCents: 9500 },
      );
      expect(result.sentenceText).toBe(
        "Você mudou o nome (Corte feminino → Corte e escova) e o preço (R$ 90 → R$ 95) de Corte feminino.",
      );
    });

    test("normaliza como o PATCH: espaços do nome e da descrição, vazio é zero nos intervalos", () => {
      expect(
        describe1(
          { description: "Inclui lavagem" },
          {
            bufferAfter: "",
            bufferBefore: " ",
            description: "  Inclui lavagem  ",
            name: "  Corte feminino  ",
          },
        ).hasChanges,
      ).toBe(false);
      expect(
        describe1({ description: null }, { description: "   " }).hasChanges,
      ).toBe(false);
    });

    test("tipo sem valor ignora o valor que sobrou no campo", () => {
      expect(
        describe1(
          { price: null, priceType: "ON_REQUEST" },
          { priceCents: 9500 },
        ).hasChanges,
      ).toBe(false);
    });

    test("instruções devolvidas ao texto lido", () => {
      expect(
        describe1(
          {},
          {
            aiInstruction: "Atende só com hora marcada.",
            aiInstructionOriginal: "Atende só com hora marcada.",
          },
        ).hasChanges,
      ).toBe(false);
    });
  });

  describe("a junção da lista", () => {
    test("um item: 'X'", () => {
      expect(describe1({}, { active: false }).sentenceText).toBe(
        "Você mudou o status (ativo → inativo) de Corte feminino.",
      );
    });

    test("dois itens: 'X e Y'", () => {
      expect(
        describe1({}, { colorToken: "ROSE", description: "Novo" }).sentenceText,
      ).toBe(
        "Você mudou a cor na agenda (Ameixa → Rosa-antigo) e a descrição de Corte feminino.",
      );
    });

    test("três itens: 'X, Y e Z'", () => {
      expect(
        describe1(
          {},
          { durationValue: "50", name: "Corte", priceCents: 9500 },
        ).sentenceText,
      ).toBe(
        "Você mudou o nome (Corte feminino → Corte), a duração (45 → 50 min) e o preço (R$ 90 → R$ 95) de Corte feminino.",
      );
    });

    test("quatro ou mais itens: vírgulas e 'e' só antes do último", () => {
      const result = describe1(
        {},
        {
          active: false,
          colorToken: "ROSE",
          description: "Novo",
          durationValue: "50",
        },
      );
      expect(result.sentenceText).toBe(
        "Você mudou a duração (45 → 50 min), a cor na agenda (Ameixa → Rosa-antigo), a descrição e o status (ativo → inativo) de Corte feminino.",
      );
    });

    test("todos os campos, na ordem da escolha 3", () => {
      const result = describe1(
        {},
        {
          active: false,
          aiInstruction: "Outra.",
          bufferAfter: "5",
          colorToken: "AMBER",
          description: "Novo",
          durationValue: "50",
          name: "Corte",
          priceCents: 9500,
          recurrenceValue: "28",
        },
      );
      expect(result.changes.map((change) => change.field)).toEqual([
        "name",
        "duration",
        "price",
        "color",
        "description",
        "recurrence",
        "buffers",
        "instruction",
        "active",
      ]);
      expect(result.sentenceText).toBe(
        "Você mudou o nome (Corte feminino → Corte), a duração (45 → 50 min), o preço (R$ 90 → R$ 95), a cor na agenda (Ameixa → Terracota), a descrição, a recorrência (sem recorrência → a cada 4 semanas), o intervalo antes e depois, as instruções para a IA e o status (ativo → inativo) de Corte feminino.",
      );
    });
  });

  describe("a segunda linha", () => {
    test.each([
      ["nome", { name: "Corte" }],
      ["duração", { durationValue: "50" }],
      ["preço", { priceCents: 9500 }],
      ["intervalo", { bufferBefore: "10" }],
    ] as const)("aparece quando muda o %s", (_label, change) => {
      expect(describe1({}, { ...change }).snapshotNote).toBe(
        SERVICE_SNAPSHOT_NOTE,
      );
    });

    test.each([
      ["cor", { colorToken: "ROSE" }],
      ["descrição", { description: "Novo" }],
      ["recorrência", { recurrenceValue: "28" }],
      ["instruções", { aiInstruction: "Outra." }],
      ["status", { active: false }],
    ] as const)("não aparece quando só muda a %s", (_label, change) => {
      const result = describe1({}, { ...change });
      expect(result.hasChanges).toBe(true);
      expect(result.snapshotNote).toBeNull();
    });

    test("aparece se qualquer mudança da lista é do instantâneo", () => {
      expect(
        describe1({}, { active: false, durationValue: "50" }).snapshotNote,
      ).toBe(SERVICE_SNAPSHOT_NOTE);
    });
  });
});
