# UI/UX Prototype Guidelines — Atendly

## 1. Mission

You are the product design agent responsible for creating the first commercial UX/UI prototype of **Atendly**.

Atendly is a SaaS platform for WhatsApp-based customer service and appointment scheduling, assisted by AI. The primary user is a self-employed professional or micro-business owner who usually performs the service, manages the calendar, and answers customers personally.

Your job is to transform the product specification into a **coherent, navigable, responsive, elegant and professional product interface**.

The interface must feel simple enough for a non-technical small-business owner to understand immediately, while still looking like a trustworthy modern SaaS product.

This is not a concept exploration. Treat the product rules and screen requirements as constraints. Focus on UX/UI and interactive prototyping; do not invent backend architecture, API contracts or technical capabilities.

---

## 2. Source of truth

Use these project documents as the source of truth when available:

1. `CONTEXTO_PRODUTO_ATENDLY.md` or the provided `CONTEXTO_PRODUTO_ATENDLY(1).md`
2. `ESPECIFICACAO_TELAS_UX_ATENDLY.md` or the provided `ESPECIFICACAO_TELAS_UX_ATENDLY(1).md`
3. `DESIGN.md`
4. This historical prototype guideline

Priority in case of conflict:

1. explicit product/business rule in the product context;
2. explicit screen/UX requirement;
3. this prototype guideline;
4. `DESIGN.md`;
5. visual/design judgment.

Do not silently override product rules for aesthetic reasons.

---

## 3. Primary product goal

The central user outcome is:

> Turn WhatsApp conversations into real, valid appointments while reducing manual work.

The interface should continuously reinforce the operational value of Atendly rather than presenting the product merely as "an AI chatbot".

The dashboard should answer:

> **O que a Atendly fez pelo meu negócio hoje?**

Prioritize information such as:

- today's appointments;
- next appointment;
- appointments created by AI;
- conversations requiring human attention;
- hours of manual work saved;
- WhatsApp connection status;
- calendar/integration status;
- estimated revenue associated with appointments when available.

---

## 4. Primary user

Design for a user who:

- runs a small service business;
- usually works alone;
- performs the actual service;
- manages the schedule;
- uses WhatsApp as the main customer channel;
- has little time for setup;
- may have low tolerance for technical settings;
- frequently accesses the product on a phone.

Typical businesses include:

- beauty salons;
- barbers;
- manicures;
- aesthetics;
- massage;
- personal training;
- individual consultations;
- similar appointment-based services.

Do not design the first version around enterprise administrators, large teams, complex permissions or multiple branches.

---

## 5. Product principles

Every screen must optimize for these priorities, in this order:

1. **Clarity**
2. **Task completion**
3. **Operational trust**
4. **Low cognitive load**
5. **Mobile usability**
6. **Visual elegance**
7. **Density only when useful**

When aesthetics conflict with comprehension, choose comprehension.

When reducing clicks would make a destructive or operationally important action ambiguous, prefer an extra confirmation step.

---

## 6. Product scope

### Required core areas

The authenticated product contains:

- Início
- Conversas
- Agenda
- Clientes
- Serviços
- Configurações

### Required entry flow

The first-use journey is:

1. account creation;
2. business information;
3. calendar source choice;
4. calendar configuration or connection;
5. AI conversation tone;
6. WhatsApp connection;
7. validation/test;
8. authenticated application.

### Calendar modes

Exactly one official scheduling source must be active:

#### Agenda Atendly

Atendly is the official source and controls:

- services;
- price;
- duration;
- availability;
- customers;
- appointments;
- rescheduling;
- cancellations;
- time blocks.

#### Minha Agenda

Minha Agenda remains the official source.

Atendly reads/sends supported operations through the integration.

The UI must always make the current source clear.

Never model source switching as an instant toggle. It starts an assisted migration flow.

---

## 7. Non-negotiable business rules

Do not create designs that imply behavior violating these rules.

### Calendar and appointments

- A tenant must select a calendar source.
- An appointment is only confirmed after successful persistence in the official source.
- Never show a failed operation as successful.
- Never invent availability.
- Never invent service price.
- Never invent a service.
- Never invent appointment confirmation.
- Rescheduling only releases the previous slot after the new booking succeeds.
- Cancellation preserves history and releases availability only after success.
- Inactive services cannot generate new appointments.
- Changing a service price must not silently rewrite historical appointment prices.

### AI

The available tones are only:

- `Profissional e objetiva`
- `Leve e próxima`

Do not create a `Personalizada` option in V1.

The AI:

- speaks in the name of the business;
- does not require a separate fictional assistant identity;
- pauses when a human assumes the conversation;
- transfers or flags low-confidence and operational-failure situations.

### WhatsApp

Automatic service is only operational when WhatsApp is actually connected.

Desktop connection:
- QR Code.

Mobile connection:
- copyable linking code;
- clear WhatsApp steps;
- do not ask the user to scan their own phone screen.

### Tenant

Do not expose cross-tenant concepts in the UI.

Each business owns its own:

- customers;
- conversations;
- services;
- appointments;
- settings.

---

## 8. Do not invent unresolved functionality

The following items are not product decisions yet.

Do not present them as confirmed features:

- exact Minha Agenda authentication method;
- exact Minha Agenda writable operations;
- ability to automatically transfer Atendly data into Minha Agenda;
- synchronization frequency or direction;
- definitive cancellation rules;
- reminders;
- deposits/payments;
- post-service workflow/statuses;
- pricing plans and usage limits;
- multi-user management;
- multiple branches;
- retention/deletion policy details.

When a prototype needs to reference an unresolved capability:

- keep the UI neutral;
- label it as dependent on integration capability;
- use placeholder states without implying implementation;
- prefer explanatory copy over fake controls.

---

## 9. Design workflow

Create the prototype in this order.

### Phase 1 — Foundations

Before creating full screens:

1. define color tokens;
2. define typography;
3. define spacing;
4. define radii;
5. define elevation;
6. define icon style;
7. create buttons;
8. create inputs;
9. create badges/statuses;
10. create cards;
11. create banners;
12. create dialogs/bottom sheets;
13. create list/table patterns;
14. create skeleton/empty/error states.

Follow `DESIGN.md`.

### Phase 2 — Application shell

Create:

- desktop sidebar shell;
- desktop header/context area;
- mobile compact header;
- mobile bottom navigation;
- global banner slot;
- responsive content container.

Validate navigation before building feature screens.

### Phase 3 — Main daily workflow

Prioritize:

1. Dashboard
2. Conversations list
3. Conversation detail
4. Agenda
5. Appointment creation/detail/reschedule/cancel
6. Customers
7. Services
8. Settings

### Phase 4 — Onboarding

Create the complete onboarding after the reusable patterns are stable.

### Phase 5 — Migration and edge states

Create:

- calendar migration;
- integration errors;
- WhatsApp disconnected;
- offline;
- session expired;
- empty states;
- loading/skeleton;
- unexpected error.

---

## 10. Required prototype screens

### Authentication

- Login — desktop
- Login — mobile
- Signup — desktop
- Signup — mobile
- Signup validation errors
- Terms of Use
- Privacy Policy
- Forgot password
- New password

### Onboarding common

- Business information
- Calendar source selection
- AI tone selection
- WhatsApp connection — desktop QR
- WhatsApp connection — mobile code
- Final validation — success
- Final validation — failure

### Agenda Atendly onboarding

- Start from scratch vs import
- First service
- Service price
- Working days
- Regular hours
- Connect Minha Agenda for import
- Import preview
- Import progress
- Import result

### Minha Agenda onboarding

- Connect Minha Agenda
- Validate found data
- Validation error/incomplete data

### Authenticated area

- Global shell — desktop
- Global shell — mobile
- Dashboard — Agenda Atendly
- Dashboard — Minha Agenda
- Dashboard — integration error
- Conversations empty
- Conversations populated
- Conversation — AI active
- Conversation — human takeover
- Agenda — desktop
- Agenda — mobile
- New appointment
- Appointment detail
- Reschedule
- Cancel
- Block time
- Customers
- Customer detail
- Services
- Create/edit service
- Settings hub
- Business settings
- AI settings
- WhatsApp settings
- Calendar/source settings
- Availability settings
- Account/security

### Migration

- Minha Agenda → Agenda Atendly introduction
- Agenda Atendly → Minha Agenda introduction
- Diagnosis
- Conflict resolution
- Review
- In progress
- Success
- Partial success
- Failure

### System states

- Loading/skeleton
- Empty
- Offline
- Session expired
- WhatsApp disconnected
- External calendar unavailable
- Unexpected error

---

## 11. Navigation rules

### Desktop

Use a persistent sidebar.

Primary items:

- Início
- Conversas
- Agenda
- Clientes
- Serviços

Settings can be visually separated near the lower area.

The sidebar should include:

- Atendly brand;
- current business;
- compact WhatsApp state;
- navigation;
- settings;
- account menu.

Do not overload the sidebar with future modules.

### Mobile

Use bottom navigation:

1. Início
2. Conversas
3. Agenda
4. Mais

Inside `Mais`:

- Clientes
- Serviços
- Configurações
- Ajuda
- Sair

Do not compress desktop sidebar behavior into mobile.

---

## 12. Onboarding rules

Onboarding is mobile-first.

Each screen should contain one main question or task.

Rules:

- maximum 2 primary inputs visible per screen;
- maximum 2 major decisions per screen;
- avoid scroll whenever practical;
- keep descriptions short;
- keep the primary CTA visible near the bottom;
- use `ETAPA X DE Y`;
- use a compact progress bar;
- always provide Back except on the first step;
- use substeps for complex setup;
- do not request unnecessary information;
- never request birth date or gender;
- do not require team/professional setup in V1.

When the keyboard is open, allow just enough scrolling to keep:

- active field;
- validation;
- CTA

visible and usable.

---

## 13. Dashboard rules

Dashboard hierarchy:

1. greeting + date;
2. operational status;
3. today's agenda + next appointment;
4. Atendly outcomes;
5. conversations requiring attention;
6. quick actions.

Avoid a generic analytics dashboard full of charts.

This product is operational.

The first viewport should answer:

- Is everything working?
- What do I need to do now?
- What is my next appointment?
- What did Atendly automate for me?

Use only a small number of high-value metrics.

---

## 14. Conversations rules

### List

Must make human intervention obvious.

Support filters:

- Todas
- Não lidas
- IA atendendo
- Aguardando humano
- Pausadas
- Resolvidas

Each list item should communicate:

- customer;
- last message;
- time;
- unread count;
- AI state;
- related appointment if any;
- failure/attention marker if applicable.

### Detail

Desktop:
- preferably 3 regions: list / conversation / context;
- 2-column layout is acceptable when width is constrained.

Mobile:
- conversation full screen;
- customer context in bottom sheet/page;
- composer respects keyboard and safe area.

System events such as appointment creation must look different from chat bubbles.

---

## 15. Agenda rules

Desktop:
- Day / Week / List.
- Week can be information-dense but must remain legible.

Mobile:
- prioritize Day / List.
- never squeeze a desktop weekly grid onto a phone.

Agenda Atendly:
- full editing;
- manual booking;
- time blocking;
- availability visibility.

Minha Agenda:
- indicate source and last sync;
- show only supported actions;
- when unsupported, use a clear `Editar no Minha Agenda` path;
- do not show local availability controls as editable.

---

## 16. Settings rules

Use progressive disclosure.

The settings hub should not feel like an admin panel.

Sections:

- Negócio
- Atendente virtual
- Agenda e disponibilidade
- WhatsApp
- Conta e segurança
- Termos e privacidade
- Plano e cobrança only when actually available

Settings must adapt to calendar source.

Agenda Atendly:
- show local availability tools.

Minha Agenda:
- show integration/synchronization/migration status;
- do not show misleading local controls.

---

## 17. Error and status behavior

All asynchronous actions need:

- start/loading feedback;
- understandable result;
- understandable failure reason;
- recovery action;
- explanation if leaving the page is safe/unsafe when relevant.

Do not rely on toast notifications for blocking errors.

Show critical errors near the relevant component or in a persistent banner.

Global banner priorities:

1. condition preventing service;
2. data/integration risk;
3. configuration warning;
4. informational updates.

Never stack several blocking banners simultaneously.

---

## 18. Empty states

Every empty state must answer:

1. What normally appears here?
2. Why is it empty?
3. What should the user do next?

Keep empty states compact and actionable.

Do not use decorative illustrations that consume most of the viewport.

---

## 19. Copy rules

Language: **Português do Brasil**.

Tone:

- direct;
- calm;
- professional;
- friendly;
- non-technical;
- concise.

Avoid:

- developer terminology;
- API jargon;
- anthropomorphizing the AI excessively;
- marketing copy inside operational screens;
- long explanatory paragraphs;
- vague CTAs such as `OK`, `Confirmar` or `Continuar` when a more specific action is safer.

Prefer:

- `Criar agendamento`
- `Reconectar WhatsApp`
- `Usar esta agenda`
- `Migrar para Agenda Atendly`
- `Cancelar agendamento`

For destructive actions, explicitly state what will happen.

---

## 20. Accessibility

Minimum requirements:

- WCAG AA contrast;
- visible focus;
- semantic error indication beyond color;
- touch target >= 44x44;
- input/button height >= 48px;
- do not encode state only by color;
- readable text at mobile sizes;
- keyboard-safe forms;
- destructive actions visually separated.

---

## 21. Responsive design targets

Create and verify at least:

- Mobile: 390 × 844
- Tablet: 768 × 1024
- Desktop: 1440 × 1024

Do not create separate unrelated visual systems for each breakpoint.

The same components should adapt responsively.

---

## 22. Quality bar

The result should feel:

- trustworthy;
- modern;
- calm;
- polished;
- lightweight;
- fast;
- intentionally designed;
- professional enough to charge for.

It must not feel:

- like a generic admin template;
- childish;
- overly playful;
- crypto/fintech-like;
- neon;
- excessively gradient-heavy;
- glassmorphism-heavy;
- full of oversized cards;
- overloaded with charts;
- like a WhatsApp clone;
- like an enterprise ERP.

---

## 23. Prototype behavior

Build a clickable prototype for the main journey:

`Cadastro → Onboarding → Agenda configurada → WhatsApp conectado → Teste → Início → Conversas → Agendamento`

Also include the alternate branch for Minha Agenda.

Prototype at minimum:

- main CTA navigation;
- source selection;
- AI tone selection;
- WhatsApp connection success state;
- dashboard quick actions;
- conversation open/takeover/return-to-AI;
- create appointment;
- reschedule;
- cancel;
- settings source change entry;
- migration sequence.

---

## 24. Completion criteria

Do not consider the work complete until:

- desktop and mobile variants exist where applicable;
- both calendar modes are represented;
- navigation changes correctly by calendar source;
- migration exists in both directions;
- unsupported integration actions are clearly communicated;
- loading, empty, success and error states exist;
- onboarding avoids unnecessarily long forms;
- desktop/mobile WhatsApp connection flows differ correctly;
- failed backend operations never appear successful;
- current official calendar source is always understandable;
- the end-to-end appointment journey is prototyped;
- components follow `DESIGN.md`;
- repeated UI patterns are components, not manually duplicated one-offs.
