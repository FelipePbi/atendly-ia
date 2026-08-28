# Atendly Frontend

## Purpose

Aplicação web responsiva da Atendly. Implementa autenticação, onboarding, dashboard, conversas, agenda, clientes, serviços, configurações, migração e estados sistêmicos conforme Open Design.

Frontend novo é base visual aprovada. Estado atual usa mocks e não está conectado ao BFF.

## Stack

- Next.js 16.3 com App Router;
- React 19.2;
- TypeScript 5 em modo strict;
- CSS próprio em `src/app/globals.css` e `src/shared/styles`;
- Zod;
- `clsx`;
- package local `@atendly-ia/legal-contract`.

Tailwind CSS, shadcn e rotas proxy `/api` não fazem parte da implementação atual.

## Architecture

```text
route/page
    ↓
feature screen
    ↓
Mock*Service (CURRENT)
```

Contrato planejado após GOAL 12:

```text
UI → service adapter → BFF
```

Componentes não devem fazer fetch ad hoc.

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

Todos os fluxos de produto usam `src/mocks/services/Mock*Service.ts` e dados em `src/mocks/data`. Não existe `Bff*Service` nem data layer real nesta etapa.

Não conecte BFF prematuramente. GOAL 12 cria data layer; goals seguintes integram domínios.

## Routes

Rotas implementadas:

- `/` → redireciona para `/login`;
- auth/legal: `/login`, `/cadastro`, `/recuperar-senha`, `/solicitacao-enviada`, `/nova-senha`, `/link-expirado`, `/termos-de-uso`, `/politica-de-privacidade`;
- onboarding: `/onboarding` e `/onboarding/[step]`;
- produto: `/inicio`, `/conversas`, `/conversas/[state]`, `/agenda`, `/clientes`, `/servicos`, `/configuracoes`;
- agenda: `/agenda/novo`, `/agenda/agendamento`, `/agenda/reagendar`, `/agenda/bloquear`;
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
- `NEXT_PUBLIC_BFF_URL` e `BFF_BASE_URL`: reservadas no template para integração futura; código frontend atual não as consome.

Nunca exponha secret em variável `NEXT_PUBLIC_*`.

## Preview system

`/_preview` cataloga cenários visuais e estados reconstruídos do Open Design. Preview deve continuar mockado mesmo após produto real usar adapters do BFF.

Não remova sistema de preview durante integração.

## Backend boundary

Frontend falará exclusivamente com BFF. Nunca chame AI Orchestrator, Scheduling Service, Evolution Go ou Minha Agenda diretamente.

## Migration status

- Open Design → React/Next: concluído como base visual.
- Data layer BFF: `NOT_STARTED`, GOAL 12.
- Auth/onboarding/settings/WhatsApp: `NOT_STARTED`, GOAL 13.
- Services/customers/calendar: `NOT_STARTED`, GOAL 14.
- Conversations/handoff: `NOT_STARTED`, GOAL 15.
- Dashboard/calendar migration: `NOT_STARTED`, GOAL 16.
