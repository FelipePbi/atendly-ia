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

/**
 * The routes the gate reaches with a real, logged-in session (Goal033).
 *
 * `sessionMarker` names the `active` destination `AppShell` renders with
 * `aria-current="page"` once a real session is established — proof the
 * authenticated shell (not the "Verificando seu acesso" check screen) is on
 * screen. `contentMarker` names the route's own first-level heading, the
 * signal that the screen's data — not its loading skeleton — has rendered;
 * `/inicio` uses its wrapper class instead, because its heading text depends
 * on the tenant's name.
 *
 * Left out, each for a reason a fixed URL cannot satisfy:
 *
 * - `/importacao`: one URL, many screens. `ImportsScreen` renders whichever
 *   stage the tenant's import session is in (draft, analyzing, running,
 *   done); there is no single "the" layout for this path to measure.
 * - `/sistema`: only a dynamic `/sistema/[state]` exists — no static page at
 *   `/sistema` itself, so there is no fixed URL to declare.
 * - `/onboarding`: its page is `OnboardingResume`, which never renders on
 *   screen — it always `router.replace`s to `/onboarding/{step}` for the
 *   tenant's current step, another dynamic path with no single layout.
 */
export const AUTHENTICATED_ROUTES = [
  { path: "/inicio", name: "inicio", sessionMarker: "inicio", contentMarker: ".dashboard-page" },
  { path: "/agenda", name: "agenda", sessionMarker: "agenda", contentMarker: "Agenda" },
  { path: "/clientes", name: "clientes", sessionMarker: "clientes", contentMarker: "Clientes" },
  { path: "/conversas", name: "conversas", sessionMarker: "conversas", contentMarker: "Conversas" },
  {
    path: "/configuracoes",
    name: "configuracoes",
    sessionMarker: "configuracoes",
    contentMarker: "Configurações",
  },
  // Goal063 §5: the rehearsal tenant has never run the real test, so the
  // screen measured here is the "no valid test" state with its own action.
  // Its shell destination is Configurações, hence the shared sessionMarker.
  {
    path: "/configuracoes/ia",
    name: "configuracoes-ia",
    sessionMarker: "configuracoes",
    contentMarker: "Atendente virtual",
  },
  // Goal071: o painel de conexão do WhatsApp (consentimento, QR/código,
  // desconectar) é o mesmo de whatsapp-conectar no onboarding, servido aqui em
  // Configurações. Shell destino é Configurações, mesmo sessionMarker de
  // /configuracoes/ia acima.
  {
    path: "/configuracoes/whatsapp",
    name: "configuracoes-whatsapp",
    sessionMarker: "configuracoes",
    contentMarker: "WhatsApp",
  },
  { path: "/servicos", name: "servicos", sessionMarker: "servicos", contentMarker: "Serviços" },
  {
    path: "/notificacoes",
    name: "notificacoes",
    sessionMarker: "notificacoes",
    contentMarker: "Central de notificações",
  },
] as const;
