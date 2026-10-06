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
  // Goal083: o formulário de novo agendamento, em página própria. Shell destino
  // é Agenda, mesmo sessionMarker de /agenda; o h1 é o título do fluxo.
  {
    path: "/agenda/novo",
    name: "agenda-novo",
    sessionMarker: "agenda",
    contentMarker: "Novo agendamento",
  },
  { path: "/clientes", name: "clientes", sessionMarker: "clientes", contentMarker: "Clientes" },
  { path: "/conversas", name: "conversas", sessionMarker: "conversas", contentMarker: "Conversas" },
  {
    path: "/configuracoes",
    name: "configuracoes",
    sessionMarker: "configuracoes",
    contentMarker: "Configurações",
  },
  {
    path: "/configuracoes/negocio/perguntas-frequentes",
    name: "configuracoes-negocio-perguntas-frequentes",
    sessionMarker: "configuracoes",
    contentMarker: "Perguntas frequentes",
  },
  // Goal063 §5: the rehearsal tenant has never run the real test, so the
  // screen measured here is the "no valid test" state with its own action.
  // Its shell destination is Configurações, hence the shared sessionMarker.
  {
    path: "/configuracoes/ia",
    name: "configuracoes-ia",
    sessionMarker: "configuracoes",
    contentMarker: "IA",
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
  {
    path: "/configuracoes/conversas",
    name: "configuracoes-conversas",
    sessionMarker: "configuracoes",
    contentMarker: "Conversas",
  },
  // Goal067 §5: agenda, disponibilidade e conta, cada uma em SettingsPage com
  // seu próprio h1. Shell destino é Configurações, mesmo sessionMarker acima.
  {
    path: "/configuracoes/agenda",
    name: "configuracoes-agenda",
    sessionMarker: "configuracoes",
    contentMarker: "Agenda",
  },
  {
    path: "/configuracoes/agenda/regras",
    name: "configuracoes-agenda-regras",
    sessionMarker: "configuracoes",
    contentMarker: "Antecedência e intervalos",
  },
  {
    path: "/configuracoes/agenda/lembretes",
    name: "configuracoes-agenda-lembretes",
    sessionMarker: "configuracoes",
    contentMarker: "Lembretes",
  },
  {
    path: "/configuracoes/disponibilidade",
    name: "configuracoes-disponibilidade",
    sessionMarker: "configuracoes",
    contentMarker: "Disponibilidade",
  },
  {
    path: "/configuracoes/conta",
    name: "configuracoes-conta",
    sessionMarker: "configuracoes",
    contentMarker: "Conta",
  },
  // Goal124 (C2): excluir a conta em rota própria. A conta semeada não tem
  // exclusão pedida, então a tela mostra o formulário; o h1 é o do quadro.
  {
    path: "/configuracoes/conta/excluir",
    name: "configuracoes-conta-excluir",
    sessionMarker: "configuracoes",
    contentMarker: "Excluir sua conta na Avenly?",
  },
  { path: "/servicos", name: "servicos", sessionMarker: "servicos", contentMarker: "Serviços" },
  {
    path: "/notificacoes",
    name: "notificacoes",
    sessionMarker: "notificacoes",
    contentMarker: "Notificações",
  },
] as const;

/**
 * As etapas do onboarding que o vault descreve, medidas com uma sessão de
 * uma segunda conta que para no meio do onboarding (Goal065, WU-05).
 *
 * `contentMarker` é sempre o h1 da etapa (`OnboardingShell` renderiza
 * `title` de `onboardingScenarios` em `<h1>`) — nenhuma etapa aqui usa
 * classe, ao contrário de `AUTHENTICATED_ROUTES`.
 *
 * Nenhuma rota depende da posição real que a conta semeada alcançou: o
 * `OnboardingScreen` não guarda a etapa contra o estado gravado, então
 * navegar direto para a URL de uma etapa adiante do que a conta gravou
 * ainda a renderiza (`apps/frontend/src/shared/runtime/ProductRuntime.tsx`
 * só redireciona `/onboarding/*` para `/login` ou `/inicio`, nunca para
 * outra etapa). O endereço exige "Local próprio", por isso a semeadura
 * grava o bloco de negócio com essa modalidade antes de a conta parar.
 *
 * Goal066: `sistema-atual`, `quando-importar` e `importacao`. A conta parada
 * no meio não tem sessão de importação, então `importacao` é medida no
 * origem, cujo h1 é o da tela de origem do módulo de importação (a etapa
 * usa as telas do módulo, com o `<h1>` delas). Análise,
 * revisão, conflitos, execução e resultado dentro do onboarding exigem uma
 * origem real e ficam provados no jsdom
 * (`tests/goal066-onboarding-importacao.test.tsx`).
 */
export const ONBOARDING_ROUTES = [
  {
    path: "/onboarding/boas-vindas",
    name: "onboarding-boas-vindas",
    contentMarker: "Configure sua Avenly em poucos passos.",
  },
  {
    path: "/onboarding/segmento-e-nome",
    name: "onboarding-segmento-e-nome",
    contentMarker: "Vamos começar pelo seu negócio",
  },
  {
    path: "/onboarding/modalidade",
    name: "onboarding-modalidade",
    contentMarker: "Onde você atende?",
  },
  {
    path: "/onboarding/endereco",
    name: "onboarding-endereco",
    contentMarker: "Qual é o endereço do seu espaço?",
  },
  {
    path: "/onboarding/sistema-atual",
    name: "onboarding-sistema-atual",
    contentMarker:
      "Você já usa algum sistema para organizar seus clientes e agendamentos?",
  },
  {
    path: "/onboarding/quando-importar",
    name: "onboarding-quando-importar",
    contentMarker: "Quer importar agora?",
  },
  {
    path: "/onboarding/importacao",
    name: "onboarding-importacao",
    contentMarker: "De onde vamos trazer seus dados?",
  },
  {
    path: "/onboarding/servico-nome",
    name: "onboarding-servico-nome",
    contentMarker: "Qual é o seu primeiro serviço?",
  },
  {
    path: "/onboarding/servicos-adicionais",
    name: "onboarding-servicos-adicionais",
    contentMarker: "Seus serviços",
  },
  {
    path: "/onboarding/dias-de-atendimento",
    name: "onboarding-dias-de-atendimento",
    contentMarker: "Em quais dias você atende?",
  },
  {
    path: "/onboarding/horarios",
    name: "onboarding-horarios",
    contentMarker: "Qual é seu horário de atendimento?",
  },
  {
    path: "/onboarding/agenda-avenly-pronta",
    name: "onboarding-agenda-avenly-pronta",
    contentMarker: "Sua Agenda Avenly está pronta",
  },
  // Goal079: as duas etapas do capítulo "Sua IA". A segunda conta grava
  // serviço e disponibilidade (terceiro PATCH da semeadura), que a
  // demonstração usa para montar a conversa.
  {
    path: "/onboarding/demonstracao-da-ia",
    name: "onboarding-demonstracao-da-ia",
    contentMarker: "Veja sua IA atendendo",
  },
  {
    path: "/onboarding/tom-da-ia",
    name: "onboarding-tom-da-ia",
    contentMarker: "Gostou da forma como a IA conversou?",
  },
  {
    path: "/onboarding/whatsapp",
    name: "onboarding-whatsapp",
    contentMarker: "Agora vamos colocar sua IA para atender de verdade.",
  },
  // Goal128: as duas etapas do teste real que vêm antes do resultado, pelo mesmo
  // caminho. Na conta parada, sem execução, a 4.7 mostra o `ErrorNote` "Nenhum
  // teste em andamento" e não sai da tela, e a 4.8 mostra o cartão genérico,
  // sem linha do tempo: é esse estado que o gate mede.
  {
    path: "/onboarding/teste-real-progresso",
    name: "onboarding-teste-real-progresso",
    contentMarker: "Teste em andamento",
  },
  {
    path: "/onboarding/teste-real-falha",
    name: "onboarding-teste-real-falha",
    contentMarker: "O teste não foi concluído",
  },
  // Goal127: as duas conclusões. `OnboardingScreen` não guarda a etapa contra o
  // estado gravado, então a conta parada no meio as renderiza por URL direta.
  // Na conta real a 4.9 mede o estado honesto da IA desligada: sem anéis e sem
  // pílula, porque o status não tem IA `ACTIVE` nem WhatsApp `CONNECTED`.
  {
    path: "/onboarding/teste-real-sucesso",
    name: "onboarding-teste-real-sucesso",
    contentMarker: "Tudo pronto!",
  },
  {
    path: "/onboarding/whatsapp-concluido",
    name: "onboarding-whatsapp-concluido",
    contentMarker: "Sua Avenly está configurada.",
  },
] as const;
