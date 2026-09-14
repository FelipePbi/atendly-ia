/**
 * The routes the gate can reach without a session.
 *
 * Authenticated screens need a logged-in tenant, which this gate deliberately
 * does not fabricate: a fake session would prove layout against data no user
 * ever sees. Extending the gate past this list means giving it a real session,
 * which is its own decision.
 */
export const PUBLIC_ROUTES = [
  { path: "/login", name: "entrar" },
  { path: "/cadastro", name: "criar-conta" },
  { path: "/recuperar-senha", name: "recuperar-senha" },
  { path: "/solicitacao-enviada", name: "solicitacao-enviada" },
  { path: "/link-expirado", name: "link-expirado" },
  { path: "/termos-de-uso", name: "termos-de-uso" },
  { path: "/politica-de-privacidade", name: "politica-de-privacidade" },
] as const;
