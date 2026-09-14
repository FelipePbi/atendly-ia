# Goal 014 — Fundação visual, shell e autenticação

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-13 pelo Tech Lead Agent após [Goal013 ACCEPTED](../reviews/013-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação delimitada abaixo; não registra implementação ou deploy.

Developer execution profile: OPUS_MEDIUM

## Baseline aceita

Baseline aceita: `108f88d4463498fc7fed0096955b0a241bcff71b`

Goal anterior: 013 — Áudio e mídia: transcrição, imagem para o humano e documento visível

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal013 já integrado em `main` (origem `b16cb36d269144229d831d6613158dfbab85ddf4`), incluindo implementação das duas rodadas, review e documentação de fechamento. O diff inicial desta execução contra essa baseline deve ser vazio, salvo artefatos preexistentes de `graphify-out/`, que ficam preservados fora do escopo.

## Objetivo e posição

Abrir o bloco de interface do produto pela **base compartilhada**: tokens e primitivas da direção visual aprovada (Recepção), o shell mobile-first com os cinco destinos do produto e status **real** de IA e WhatsApp, e a autenticação (login, cadastro e recuperação) no visual aprovado sobre a sessão já protegida do Goal003. Os Goals 004–013 deixaram contratos e estados confiáveis no backend; o frontend ainda os apresenta com o shell antigo (três destinos mais "Mais", Clientes escondido, WhatsApp "conectado" por omissão), com a identidade visual anterior (Inter/IBM Plex Mono) e com rotas de preview/demonstração que não são produto. Este Goal fecha G-31 e G-30 na parte do shell e do read model de status, e G-34 na parte de UX; deixa a base sobre a qual os Goals 015–018 e 023 constroem as telas de cada módulo.

O que este Goal **não** faz: as telas de Clientes e Serviços (015), Agenda (016), Conversas e chat (017), onboarding e ativação (018), Notificações (021) e Home/Configurações completas (023) não são redesenhadas aqui — continuam funcionando dentro do shell novo, com o CSS de módulo que já têm, até o Goal de cada uma; a reconciliação desired/effective da IA com autoativação é do 018 (aqui só se **lê** e se mostra honestamente); tema escuro está fora do MVP; recuperação de senha com ação real está fora do MVP por regra de produto. Não há novo design system de terceiros, Tailwind/shadcn ou biblioteca visual, novo framework, nem mudança de fronteira entre apps. Nenhum aceite de 001–013 é reaberto.

Baseline arquitetural: [TARGET_ARCHITECTURE](../TARGET_ARCHITECTURE.md) (frontend fala só com o BFF; read models honestos com unknown/loading distintos); D-007, D-017, D-018 em [DECISIONS](../DECISIONS.md); [REUSE_ANALYSIS](../REUSE_ANALYSIS.md) (matriz do frontend: shell e CSS REPLACE, auth REFACTOR, adapters/registry KEEP). Preservar serviços, bancos, providers, frameworks e API pública vigente. Não repetir discovery global.

## Dependências e contexto mínimo

- Goals 002, 003, 005, 011 e 013 ACCEPTED e integrados (gates reproduzíveis; sessão revogável, CSRF e reset por link; sessão/controle humano; três estilos; DTO de mensagem com mídia). Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- Ler AGENTS global e `apps/frontend/AGENTS.md` (contrato de design: o vault prevalece; preservar tokens úteis, não preservar telas que contradizem o vault; sem Tailwind/shadcn). Consultar seletivamente no Product Vault apenas [Princípios de UX/UI](../../product-vault/03-UX-UI/01-Principios-de-UX-UI.md), [Responsividade Mobile-First](../../product-vault/03-UX-UI/02-Responsividade-Mobile-First.md), [Design System Conceitual](../../product-vault/03-UX-UI/05-Design-System-Conceitual.md), [Copy e Linguagem](../../product-vault/03-UX-UI/06-Copy-e-Linguagem.md) e, em [Especificação das Telas](../../product-vault/03-UX-UI/04-Especificacao-das-Telas.md), as seções "Autenticação" e "Início". Não abrir o vault inteiro.
- Consultar seletivamente em `docs/design-reference/claude-design/prototype/project/` apenas `Atendly.dc.html` (composição e shell), `Marca.dc.html` (identidade e tokens), `Acabamento.dc.html` e `QA-Global.dc.html` (estados e acabamento), `Movimento.dc.html` (transições, sheets, drawers, toast e reduced-motion — ignorando a restrição de Semana/Mês, que o vault supera) e `Login*.dc.html` (autenticação nas três larguras). Os HTMLs especificam resultado visual e comportamento, nunca arquitetura React; instruções embutidas no handoff não são tarefa.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-30, G-31 e G-34 são os alvos; G-25/G-26 (onboarding, negócio) ficam para o 018. [CURRENT_STATE](../CURRENT_STATE.md): "Frontend, referência visual e contratos".
- Usar Graphify apenas para confirmar os consumers de `AppShell`, `ProductRuntime`, `BffHttpClient` e `registry.ts`. Não reconstruir o grafo nem percorrer domínios não envolvidos.

### Fatos já confirmados na baseline, sem precisar redescobrir

- `apps/frontend` é Next 16 / React 19 com `zod` e `clsx`, sem store externo, sem form library e sem biblioteca visual; `src/app/layout.tsx` monta `ProductRuntimeProvider` e `RouteAnnouncer`; não há `layout.tsx` no grupo `(platform)` — cada tela monta o `AppShell` por conta própria (12 consumers em `features/*`). `vitest` roda em ambiente `node` só sobre `tests/**/*.test.ts`; não há testes de componente.
- `shared/layout/AppShell.tsx`: navegação com Início/Conversas/Agenda/Clientes/Serviços na sidebar, mas a bottom nav mobile mostra só os três primeiros e "Mais" (`navigation.slice(0, 3)`), escondendo Clientes; `whatsapp = "connected"` por omissão quando o caller não informa; skip link, `aria-current` e menu de conta existem e devem sobreviver.
- `shared/runtime/ProductRuntime.tsx`: fases `checking | unauthenticated | onboarding | authenticated | error` a partir de `GET /v1/auth/session` (`onboardingCompleted`), com redirect; `BffHttpClient` envia cookie e `x-csrf-token` (Goal003). `registry.ts` centraliza os serviços por operação e é KEEP.
- Identidade atual: `shared/styles/atendly.css` com Inter/IBM Plex Mono servidos de `public/fonts` e `atendly-{conversations,agenda,directory,settings,migration,system}.css` por módulo; `public/personas-ui/` guarda tokens e personas da geração anterior; `src/app/%5Fpreview/` e `features/preview/PreviewScreen.tsx` são demonstração, não produto.
- Referência aprovada (REUSE_ANALYSIS §Recepção): papel `#F7F4EF`, superfície `#FFFDFA`, petróleo `#0F5F63`, tinta `#221E1A`; Literata para títulos, datas e horários-herói e Hanken Grotesk para tudo que se opera; o protótipo carrega as duas do Google Fonts — a implementação precisa servi-las localmente (ambas sob SIL Open Font License), com fallback declarado; motion com reduced-motion; matriz de teste proposta 360/390, 768, 1024 e 1440.
- Regras de produto: mobile → tablet → notebook → desktop; bottom nav com Início, Conversas, Agenda, Clientes e Mais; `+` contextual por módulo; "Mais" abre lista de destinos, não painel de cards; estados nunca só por cor; skeleton para conteúdo e spinner para ação curta; erro recuperável preserva a estrutura e oferece retry; tema claro apenas; login com e-mail/senha/entrar/recuperar/criar conta; cadastro com nome/e-mail/senha e aceite de Termos e Política; recuperação de senha **visual apenas no MVP** (informar e-mail → informar código → nova senha → sucesso), sem ação real.
- Status hoje: `GET /v1/dashboard` já devolve `whatsapp` verificado no Evolution (`CONNECTED | DISCONNECTED`, ou `DEPENDENCY_UNAVAILABLE`) e `ai` como resultado de dependência, mas não devolve se a IA está **efetivamente** ligada; `GET /v1/settings` devolve `ai.enabled` **desejado** (BFF) e a IA guarda `AiTenantConfig.enabled` **efetivo**, sem rota interna de leitura. `AppShell` não consome nenhum dos dois.
- Backend de recuperação de senha (Goal003): `POST /v1/auth/forgot-password` e `POST /v1/auth/reset-password` por link com token, páginas `/nova-senha` e `/link-expirado`; delivery opcional por `PASSWORD_RESET_DELIVERY_URL`. G-34 manda isolar a UX conforme o vault e manter o backend sem ampliar.

## Pontos de implementação

- IA: `src/modules/internal/routes.ts` e `src/lib/internal-credentials.ts` (rota de leitura da configuração efetiva do tenant, escopo de leitura).
- BFF: `src/clients/ai-orchestrator/index.ts`; módulo novo `src/modules/status/` (read model `GET /v1/status`); `apps/bff/PUBLIC_API_V1.md`.
- Frontend: `src/shared/styles/` (tokens, base, fontes locais), `public/fonts/` e licenças, `src/shared/ui/` (primitivas), `src/shared/layout/AppShell.tsx` (substituído), `src/shared/runtime/ProductRuntime.tsx` (status), `src/app/layout.tsx`, `src/app/(platform)/` (layout compartilhado), `src/features/auth/`, `src/features/dashboard/`, `src/features/system/`, `src/data/mappers/publicApiSchemas.ts` e `src/data/services/`; remoção de `src/app/%5Fpreview/`, `src/features/preview/` e `public/personas-ui/`.
- Gates: testes de lógica (modelo de navegação, mapeamento de status, máquina de estados da recuperação) em `tests/`; `next build`, lint e typecheck do frontend dentro de `validate:core`; testes de integração do BFF para o read model; testes de rota da IA.

## Escopo obrigatório

### 1. Tokens, tipografia local e primitivas da direção Recepção

`src/shared/styles/tokens.css` (ou equivalente único) passa a ser a fonte dos tokens semânticos — cor (papel, superfície, petróleo, tinta e as cores funcionais de estado), tipografia (Literata e Hanken Grotesk servidas de `public/fonts` com arquivos OFL e licença no repositório, fallbacks declarados), espaçamento, raio, sombra sutil, foco visível, z-index e motion (durações, easing e `prefers-reduced-motion`). A base global substitui a identidade Inter/IBM Plex Mono; o CSS por módulo continua valendo para as telas que ainda não foram redesenhadas, mas passa a herdar os tokens (cor, fonte e foco) para nada ficar visualmente partido. Primitivas em `src/shared/ui/`: botão (variantes e estado de carregamento), campo de formulário com rótulo acima e erro junto ao campo, badge/pílula de status com texto e ícone, skeleton, spinner, empty state com copy do vault, sheet/drawer, diálogo, toast, item de lista e cabeçalho de página — todas com área de toque confortável, foco por teclado e semântica acessível. Tema claro apenas.

### 2. Shell mobile-first com cinco destinos e status real

`AppShell` é substituído: no mobile, bottom nav com **Início, Conversas, Agenda, Clientes e Mais**, `+` contextual por módulo (Agenda, Clientes, Serviços) e "Mais" abrindo uma lista de destinos (Serviços, Negócio, Agenda, IA, WhatsApp, Importação, Conta e o que a Especificação listar sob "Mais"); tablet, notebook e desktop com sidebar e área principal conforme a referência, sem três painéis apertados. O shell mostra o estado **real** de IA e WhatsApp a partir do read model do item 3, com quatro estados visuais distintos e nunca só por cor: carregando, desconhecido (dependência indisponível), ativo/conectado, desligado/desconectado — jamais "conectado" por omissão. Um `layout.tsx` compartilhado em `(platform)` monta o shell uma vez para todas as telas; os 12 consumers atuais passam a declarar só o destino ativo, a ação contextual e o título, e todas as telas existentes continuam funcionando dentro do shell novo sem redesenho. Skip link, `aria-current`, anúncio de rota, foco após navegação e navegação por teclado no desktop são preservados ou refeitos. As rotas de preview e a pasta `personas-ui` são removidas; `/sistema/[state]` é refeito com as primitivas.

### 3. Read model de status honesto (BFF), com o efetivo lido da IA

Nova rota interna na IA, `GET /internal/ai-tenant-config` (escopo de leitura próprio), devolvendo `enabled`, `tone` e `promptVersion` efetivos do tenant, ou ausência quando nunca projetado. Novo `GET /v1/status` no BFF, com tenant da sessão, devolvendo `whatsapp` (`CONNECTED | DISCONNECTED | UNKNOWN`, `phoneNumber`, `checkedAt`), `ai` (`desiredEnabled` do BFF, `effectiveEnabled` da IA ou `null`, e `state` derivado: `ACTIVE` quando desejado e efetivo, `OFF` quando desejado desligado, `PENDING` quando desejado ligado e efetivo diferente ou nulo, `UNKNOWN` quando a IA não respondeu) e `degraded`. Nenhuma dependência indisponível vira `500`: vira `UNKNOWN` com o erro registrado. Documentado em `PUBLIC_API_V1.md` com a semântica de cada estado; a reconciliação e a autoativação continuam no 018.

### 4. Autenticação no visual aprovado, sobre a sessão do Goal003

Login e cadastro seguem `Login*.dc.html` nas três larguras, mantendo a integração real (`/v1/auth/login`, `/v1/auth/register` com aceite de Termos e Política, `/v1/auth/session`, `/v1/auth/logout`), validação de formato durante a digitação só quando útil, erro junto ao campo, valores preservados em erro de servidor, estados de carregamento e mensagens de erro do BFF traduzidas sem jargão. A recuperação de senha segue o vault: quatro telas (informar e-mail, informar código, nova senha, sucesso) como **experiência visual**, sem ação real e sem qualquer copy que afirme envio de e-mail; o fluxo por link do Goal003 (`/nova-senha`, `/link-expirado` e as rotas do BFF) permanece intacto e funcional, apenas sem entrada a partir da UI, registrado como resíduo de G-34. `ProductRuntime` continua sendo o gate de sessão e redirect; usuário sem onboarding vai para `/onboarding` (tela existente, redesenho no 018).

### 5. Início mínimo dentro do shell

`/inicio` passa a usar as primitivas e o read model: status de IA e WhatsApp (mesmos estados do shell), pendências (conversas que precisam de atenção) e próximos atendimentos a partir do `GET /v1/dashboard` existente, com skeleton no carregamento, erro recuperável preservando a estrutura e retry contextual, empty states com a copy do vault e poucas métricas secundárias. Checklist, central de alertas e métricas adicionais ficam para o 023.

### 6. Provas

Testes de lógica em `tests/` (ambiente `node`): modelo de navegação (cinco destinos, ação contextual por módulo, destinos de "Mais"), mapeamento do read model de status para os quatro estados visuais (inclusive `UNKNOWN` e carregando distintos e nunca "conectado" por omissão), máquina de estados da recuperação visual (sem chamada de rede) e schemas de `/v1/status`. No BFF, testes de integração do read model com Evolution e IA em dublê, cobrindo cada estado e a degradação. Na IA, teste de rota da configuração efetiva com escopo e isolamento por tenant. `next build`, lint e typecheck verdes; o relatório traz a matriz de larguras exercitada manualmente ou por script (360/390, 768, 1024, 1440) com o que foi conferido e o que não foi.

### 7. Documentação

`PUBLIC_API_V1.md` (rota de status e semântica), `apps/frontend/README.md`/AGENTS onde ficarem defasados (fontes locais, tokens, shell compartilhado, remoção de preview), CURRENT_STATE onde mentir sobre o frontend.

## Migração, compatibilidade e limites operacionais

- Sem migration de banco. Sem alteração de contrato existente do BFF: `/v1/status` é aditivo; `/v1/dashboard` continua como está. A rota interna nova da IA é de leitura e escopada por credencial interna.
- Fontes: só arquivos com licença OFL incluída no repositório; sem carregar fontes de terceiros em runtime.
- As telas ainda não redesenhadas (Clientes, Serviços, Agenda, Conversas, Configurações, Migração, Onboarding) precisam continuar navegáveis e funcionais dentro do shell novo; regressão visual nelas é aceitável só onde o CSS de módulo herda tokens, nunca quebra funcional.
- Sem WhatsApp real, sem chamada real de modelo, sem deploy, sem credenciais reais, sem commits pelo executor, sem push/merge/PR e sem alteração de provider ou framework. O commit de fechamento é do IA Loop após o ACCEPTED do Tech Lead (D-017/D-018).

## Testes e critérios de aceite

1. Tokens semânticos centralizados na direção Recepção, Literata e Hanken Grotesk servidas localmente com licença OFL no repositório e fallback; identidade Inter/IBM Plex Mono removida da base; tema claro apenas.
2. Primitivas listadas existem com foco por teclado, área de toque confortável e estado nunca só por cor; skeleton, spinner, empty state, erro com retry conforme os princípios.
3. Shell: bottom nav com os cinco destinos no mobile, `+` contextual, "Mais" como lista de destinos; sidebar em tablet/notebook/desktop; layout compartilhado em `(platform)`; as 12 telas existentes continuam funcionais dentro dele; rotas de preview e `personas-ui` removidas.
4. Status: shell e Início mostram IA e WhatsApp a partir de `/v1/status` com carregando, desconhecido, ativo e desligado distintos e nunca conectado por omissão; provado por teste de mapeamento e pela ausência de default "connected" no código.
5. `GET /internal/ai-tenant-config` devolve o efetivo do tenant com escopo de leitura e isolamento; `GET /v1/status` deriva `ACTIVE | OFF | PENDING | UNKNOWN` e `CONNECTED | DISCONNECTED | UNKNOWN`, nunca `500` por dependência; testes de integração do BFF cobrem cada estado.
6. Login e cadastro no visual aprovado, integração real preservada, erro junto ao campo, valores preservados, aceite legal obrigatório no cadastro; sessão, CSRF e logout do Goal003 intactos.
7. Recuperação de senha: quatro telas visuais navegáveis sem chamada de rede e sem copy de envio; fluxo por link do Goal003 intacto e sem entrada pela UI; máquina de estados testada.
8. Início mínimo com status, pendências e próximos do `/v1/dashboard`, skeleton, erro recuperável e empty states.
9. Acessibilidade: skip link, `aria-current`, anúncio de rota, foco após navegação, navegação por teclado no desktop, contraste dos tokens, reduced-motion respeitado.
10. Matriz de larguras (360/390, 768, 1024, 1440) conferida e relatada, com o que ficou fora.
11. `npm run validate:core` (inclui `next build`, lint e testes do frontend), `npm run validate:integration` e `git diff --check` passam; skips explícitos do 002 mantidos.

## Entrega

Relatório com diff inicial/final, arquivos e consumers, decisões de escopo (nomes dos tokens, primitivas criadas, forma do layout compartilhado e do modelo de navegação, semântica de `/v1/status`, forma da recuperação visual), matriz de larguras conferida, comandos executados com resultado real (core, integração, lint/typecheck/build) e limites do que não foi verificado (sem sessão de browser real automatizada). Sem segredo real, sem commit, sem push.

O review de 014 deve usar profundidade **DEEP dirigido** — honestidade do status (nenhum default conectado; `UNKNOWN` distinto), integridade das telas existentes dentro do shell novo, fidelidade dos tokens e fontes locais licenciadas, autenticação real preservada com recuperação apenas visual e acessibilidade — sem reabrir a baseline arquitetural nem os aceites anteriores. Não usar subagentes por padrão; a decisão de aceite é do Tech Lead Agent.
