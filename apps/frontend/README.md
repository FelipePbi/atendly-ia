# Atendly Frontend

## Purpose

Aplicação web responsiva da Atendly. Implementa autenticação, onboarding, dashboard, conversas, agenda, clientes, serviços, configurações, migração e estados sistêmicos conforme Open Design.

Frontend novo é base visual aprovada. Data layer do BFF existe; autenticação,
configurações, serviços, clientes e agenda já usam dados reais no produto.

## Stack

- Next.js 16.3 com App Router;
- React 19.2;
- TypeScript 5 em modo strict;
- CSS próprio em `src/app/globals.css` e `src/shared/styles`;
- Zod;
- `clsx`;
- package local `@atendly-ia/legal-contract`.

Tailwind CSS e shadcn não fazem parte da implementação atual. O rewrite
same-origin `/api/bff/*` encaminha exclusivamente ao BFF configurado em
`BFF_BASE_URL`.

## Architecture

```text
produto:  UI → Bff*Service → BffHttpClient → BFF /v1
preview:  UI → Mock*Service
```

`fetch` fica restrito a `src/data/http/BffHttpClient.ts`. Componentes não fazem acesso HTTP ad hoc.

## Directory structure

```text
src/
├── app/       rotas, layouts, CSS global
├── features/  telas e tipos por domínio
├── shared/    layout, UI, ícones e estilos
├── mocks/     dados e service adapters temporários
├── components/legal/
├── config/    configuração legal
└── content/   documentos legais
```

## Design source of truth

Prioridade:

1. `../frontend-open-design/DESIGN-HANDOFF.md`;
2. `../frontend-open-design/DESIGN-MANIFEST.json`;
3. HTML/CSS/JS da tela correspondente em `../frontend-open-design`;
4. `../../docs/DESIGN.md`;
5. implementação atual.

`frontend-open-design` é contrato visual estático. Não importe seus HTML/JS no runtime. Preserve UI, navegação, copy, tokens e CSS atuais sem redesenho não solicitado.

## Current data state

- `src/data/http/BffHttpClient.ts` centraliza URL, cookies, JSON, request ID, cancelamento, CSRF opcional e erros;
- `src/data/services` contém os adapters da Public API V1 e o registry BFF;
- `src/data/mappers` valida respostas do BFF com Zod;
- `src/mocks` permanece como registry isolado para `/_preview` e para telas ainda não migradas;
- goals 13–14 ativaram os adapters de conta, configurações, serviços, clientes e agenda sem alterar o preview.

## Routes

Rotas implementadas:

- `/` → redireciona para `/login`;
- auth/legal: `/login`, `/cadastro`, `/recuperar-senha`, `/solicitacao-enviada`, `/nova-senha`, `/link-expirado`, `/termos-de-uso`, `/politica-de-privacidade`;
- onboarding: `/onboarding` e `/onboarding/[step]`;
- produto: `/inicio`, `/conversas`, `/conversas/[id]`, `/agenda`, `/clientes`, `/servicos`, `/configuracoes`;
- agenda: `/agenda/novo`, `/agenda/agendamento`, `/agenda/reagendar`, `/agenda/cancelar`, `/agenda/bloquear`;
- clientes: `/clientes/novo`, `/clientes/detalhes`, `/clientes/detalhes/externo`;
- serviços: `/servicos/novo`, `/servicos/editar`;
- configurações: `/configuracoes/negocio`, `/configuracoes/ia`, `/configuracoes/agenda`, `/configuracoes/disponibilidade`, `/configuracoes/whatsapp`, `/configuracoes/conta`;
- fluxos: `/migracao/[step]` e `/sistema/[state]`;
- catálogo visual: `/_preview` e `/_preview/[slug]`.

Não existem rotas antigas `/chat`, `/ia`, `/settings/account` ou proxies Next `/api/*`.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run format:check
npm run build
npm run build:release
npm run start
```

`npm run dev` usa porta `3001`.

## Environment

Copie `.env.example` para `.env` quando precisar configurar documentos legais.

- `ATENDLY_LEGAL_*`: identidade jurídica, contatos, fornecedores, retenção, foro e flags de revisão/indexação.
- `NEXT_PUBLIC_BFF_URL`: base usada pelo registry no navegador; pode apontar para o rewrite same-origin `/api/bff`.
- `BFF_BASE_URL`: destino server-side do rewrite; não é exposto ao navegador.

Nunca exponha secret em variável `NEXT_PUBLIC_*`.

## Preview system

`/_preview` cataloga cenários visuais e estados reconstruídos do Open Design. Preview deve continuar mockado mesmo após produto real usar adapters do BFF.

Não remova sistema de preview durante integração.

## Backend boundary

Frontend falará exclusivamente com BFF. Nunca chame AI Orchestrator, Scheduling Service, Evolution Go ou Minha Agenda diretamente.

## Migration status

- Open Design → React/Next: concluído como base visual.
- Data layer BFF: implementada no GOAL 12.
- Auth/onboarding/settings/WhatsApp: concluído no GOAL 13, incluindo smoke integrado real.
- Services/customers/calendar: concluído no GOAL 14, com Agenda Atendly gravável e Minha Agenda orientada por capabilities reais.
- Conversations/handoff: integrado ao BFF no GOAL 15; preview continua mockado.
- Dashboard e migração de agenda: integrados ao BFF no GOAL 16; estados operacionais são derivados de dados reais e o preview continua mockado.
