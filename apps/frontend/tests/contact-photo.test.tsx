// @vitest-environment jsdom
/**
 * Foto de perfil do WhatsApp da cliente no avatar (decisão de 2026-10-15).
 *
 * A foto vem do proxy do BFF e fica por cima das iniciais: a conversa com
 * pessoa vinculada usa a rota do cliente (mesma URL, mesmo cache do
 * navegador), a conversa sem pessoa usa a rota da conversa, e a foto que não
 * carrega — `204` do BFF ou erro — some e deixa as iniciais.
 */

import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Conversation } from "@/data";
import { ConversationRow } from "@/features/conversations/ConversationRow";
import {
  ContactPhoto,
  conversationPhotoUrl,
  customerPhotoUrl,
} from "@/shared/ui/ContactPhoto";

function conversationFixture(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    category: "COMMERCIAL",
    categorySource: "AUTOMATIC",
    customerName: "Marina Duarte",
    externalContactId: "5511999990000@s.whatsapp.net",
    handling: "AI",
    handoffReason: null,
    humanHandoff: false,
    id: "conv-1",
    ignored: false,
    lastMessage: null,
    status: "ACTIVE",
    unreadCount: 0,
    updatedAt: "2026-10-15T12:00:00.000Z",
    ...overrides,
  } as Conversation;
}

describe("foto de perfil da cliente", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_BFF_URL", "http://localhost:3001/api/bff/");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("conversa com cliente vinculada usa a rota do cliente", () => {
    const { container } = render(
      <ConversationRow
        conversation={conversationFixture({ customerId: "cus 1" })}
      />,
    );

    const photo = container.querySelector("img.contact-photo");
    expect(photo?.getAttribute("src")).toBe(
      "http://localhost:3001/api/bff/v1/customers/cus%201/avatar",
    );
    expect(photo?.getAttribute("loading")).toBe("lazy");
    expect(
      container.querySelector(".conversation-row-avatar"),
    ).toHaveTextContent("MD");
  });

  test("conversa sem cliente vinculada usa a rota da conversa", () => {
    expect(conversationPhotoUrl({ id: "conv-1", customerId: null })).toBe(
      "http://localhost:3001/api/bff/v1/conversations/conv-1/avatar",
    );
  });

  test("foto que não carrega some e as iniciais ficam", () => {
    const { container } = render(
      <span>
        AC
        <ContactPhoto src={customerPhotoUrl("cus-1")} />
      </span>,
    );

    const photo = container.querySelector("img.contact-photo");
    expect(photo).not.toBeNull();
    fireEvent.error(photo!);

    expect(container.querySelector("img.contact-photo")).toBeNull();
    expect(container).toHaveTextContent("AC");
  });

  test("sem id, ou sem o endereço do BFF, não há foto", () => {
    expect(customerPhotoUrl(null)).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_BFF_URL", "");
    expect(customerPhotoUrl("cus-1")).toBeNull();

    const { container } = render(<ContactPhoto src={null} />);
    expect(container.querySelector("img")).toBeNull();
  });
});
