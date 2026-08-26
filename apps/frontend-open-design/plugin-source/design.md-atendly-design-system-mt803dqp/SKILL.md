# DESIGN.md — Atendly Design System

## 1. Design direction

Atendly should look like a **modern premium SaaS for small businesses**: elegant, practical, calm and trustworthy.

The product helps people run daily operations. The UI should reduce anxiety rather than create visual noise.

The intended feeling is:

- organized;
- capable;
- approachable;
- professional;
- efficient;
- human without being playful.

Use a clean editorial rhythm, generous but controlled whitespace, crisp typography and subtle hierarchy.

Avoid excessive decoration.

---

## 2. Visual personality

### Do

- clean light surfaces;
- strong navy typography;
- restrained green brand accents;
- subtle violet accents for AI/automation;
- compact semantic badges;
- soft borders;
- minimal elevation;
- polished spacing;
- clear active/navigation states;
- concise microcopy;
- high information clarity.

### Avoid

- neon SaaS aesthetics;
- large glowing gradients;
- glassmorphism;
- heavy drop shadows;
- dark dashboard as default;
- excessive pill-shaped containers;
- oversized cards for simple information;
- childish illustrations;
- cartoon assistant avatars;
- robot imagery;
- too many accent colors on the same screen;
- generic Bootstrap/admin-template appearance.

---

## 3. Brand concept — Conversation Flow

The Atendly identity is based on the idea of **Conversation Flow**:

`Mensagem → entendimento → disponibilidade → agendamento → resultado`

Represent this concept subtly through:

- connected dots;
- short flowing lines;
- rounded path motifs;
- message-to-calendar transitions;
- small directional accents;
- step indicators.

Do not turn the interface into a decorative flowchart.

Use the concept primarily in:

- authentication branding;
- onboarding;
- empty states;
- AI badges;
- subtle background details.

---

## 4. Color system

### Brand

```text
brand.green.vivid      #00C98B
brand.green.accessible #007A57
brand.navy             #0B1727
brand.violet           #7C5CFC
brand.coral            #FF7A59
```

### Core neutrals

```text
neutral.0    #FFFFFF
neutral.25   #FCFDFC
neutral.50   #F7F9F8
neutral.100  #F0F3F2
neutral.200  #E2E8E5
neutral.300  #CBD5D1
neutral.400  #98A6A1
neutral.500  #6B7873
neutral.600  #4A5752
neutral.700  #35423D
neutral.800  #202D29
neutral.900  #111B18
```

### Semantic

```text
success.50   #ECFDF6
success.600  #087A55

warning.50   #FFF8E7
warning.600  #9A6700

danger.50    #FFF1F0
danger.600   #C9362B

info.50      #F2F0FF
info.600     #6747E8
```

### Usage rules

#### Green accessible `#007A57`

Use for:

- primary buttons;
- selected controls where text contrast is required;
- success emphasis;
- primary active navigation indicator;
- interactive links when green remains accessible.

#### Green vivid `#00C98B`

Use for:

- brand mark;
- non-text highlights;
- small decorative elements;
- selected progress accents;
- visual data accents.

Do not use green vivid as small white-text button background without contrast verification.

#### Navy `#0B1727`

Use for:

- primary headings;
- sidebar brand surfaces;
- key navigation/brand areas;
- high-emphasis text.

#### Violet `#7C5CFC`

Use for:

- AI state;
- automation indicators;
- AI-generated appointment badges;
- special intelligent actions.

Do not use violet as the main primary CTA color.

#### Coral `#FF7A59`

Use for:

- attention that is not a destructive error;
- human-action-needed markers;
- migration warnings.

Use semantic red for actual destructive/error states.

---

## 5. Surface hierarchy

### App background

```text
background.app = #F7F9F8
```

### Primary surface

```text
surface.primary = #FFFFFF
```

### Secondary surface

```text
surface.secondary = #FCFDFC
```

### Subtle interactive surface

```text
surface.interactive = #F0F3F2
```

### Border

```text
border.default = #E2E8E5
border.strong  = #CBD5D1
```

Use borders more often than shadows.

---

## 6. Typography

Use **Inter** as the default typeface.

Fallback:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

### Scale

```text
Display       36 / 44 / 700
H1            30 / 38 / 700
H2            24 / 32 / 700
H3            20 / 28 / 650
Title         18 / 26 / 650
Body          16 / 24 / 400
Body strong   16 / 24 / 600
Small         14 / 20 / 400
Small strong  14 / 20 / 600
Caption       12 / 16 / 500
Metric        28 / 34 / 700
```

### Mobile

Prefer:

```text
H1  26 / 34
H2  22 / 30
H3  18 / 26
Body 16 / 24
```

Do not reduce operational body text below 14px.

### Typography behavior

- use sentence case;
- avoid all caps except tiny system labels;
- use weight for hierarchy, not many colors;
- numbers/metrics should align cleanly;
- avoid excessive bold inside paragraphs.

---

## 7. Spacing

Use an 8px base grid.

Primary tokens:

```text
space.0  = 0
space.1  = 4
space.2  = 8
space.3  = 12
space.4  = 16
space.5  = 20
space.6  = 24
space.8  = 32
space.10 = 40
space.12 = 48
space.16 = 64
space.20 = 80
```

Use 4px only for tight internal micro-spacing.

Prefer:

- 8px between closely related labels/statuses;
- 12–16px inside compact controls;
- 16–24px between component groups;
- 24–32px card padding on desktop;
- 16–20px card padding on mobile;
- 32–48px between major page sections.

---

## 8. Radius

```text
radius.sm    8px
radius.input 12px
radius.card  16px
radius.card-lg 20px
radius.panel 24px
radius.full  999px
```

Rules:

- buttons: 12px;
- inputs: 12px;
- cards: 16px default;
- large onboarding/auth panel: 20–24px;
- badges/chips: full radius.

Avoid making every container pill-shaped.

---

## 9. Elevation

Default surfaces should rely on borders.

```text
shadow.none
shadow.sm  = 0 1px 2px rgba(11, 23, 39, .05)
shadow.md  = 0 8px 24px rgba(11, 23, 39, .08)
shadow.lg  = 0 18px 50px rgba(11, 23, 39, .10)
```

Use:

- `sm` for hover or compact floating elements;
- `md` for menus/popovers;
- `lg` only for modal/dialog.

Cards in normal page flow should usually have no shadow.

---

## 10. Icons

Use a single simple outline icon family, preferably:

- Lucide;
- equivalent 1.75–2px stroke icon system.

Typical size:

- 16px inside compact controls;
- 18–20px navigation;
- 20–24px primary actions;
- 24px empty-state icon container.

Do not mix filled and outline icon styles arbitrarily.

Do not use emoji as product icons.

---

## 11. Layout breakpoints

Prototype targets:

```text
mobile   390px
tablet   768px
desktop  1440px
```

Suggested behavior:

```text
< 768       mobile layout
768–1099    tablet / compact desktop
>= 1100     desktop sidebar layout
```

Max content width for normal settings/forms:

```text
760–880px
```

Max content width for operational dashboards:

```text
1280px
```

Do not stretch forms to the full desktop viewport.

---

## 12. Desktop shell

### Sidebar

Target width:

```text
240–256px
```

Style:

- white or very subtle tinted surface;
- right border;
- compact brand header;
- business switch/context area, even if only one business exists;
- navigation;
- lower settings/account region.

Navigation item:

```text
height 44–48px
radius 10–12px
icon 18–20px
```

Selected state:

- soft green-tinted background;
- accessible green icon/text or navy text plus green indicator;
- no giant colored block.

WhatsApp status:

- compact status line;
- small semantic dot/icon;
- do not consume an entire sidebar card unless disconnected.

### Main content

Desktop:

```text
page horizontal padding: 32–40px
page vertical padding: 28–32px
```

Page header usually contains:

- title;
- short supporting text if useful;
- contextual primary action on the right.

Avoid large hero-like headers in logged-in operational pages.

---

## 13. Mobile shell

### Header

Height approximately:

```text
56–64px + safe area
```

Contains:

- page title/business context;
- context action when needed;
- avatar/menu only when necessary.

### Bottom navigation

Items:

- Início
- Conversas
- Agenda
- Mais

Height:

```text
64–72px + safe area
```

Use icon + short label.

Selected state should be immediately visible without relying only on color.

### Content

```text
horizontal padding: 16px
section gap: 24px
```

Operational cards may become edge-efficient but should not touch the screen edge.

---

## 14. Buttons

### Primary

Use accessible green.

```text
height desktop: 48px
height mobile: 52–56px
radius: 12px
font: 14–16px / 600
```

Primary button should normally be one per local decision area.

### Secondary

White/subtle neutral background with border.

### Tertiary

Text/icon action.

### Destructive

Use semantic danger only for actual destructive actions.

Do not place destructive button next to primary action with equal visual weight.

### Loading

- preserve width;
- spinner + action wording where useful;
- prevent repeat submission.

---

## 15. Inputs

Default height:

```text
48px desktop
52px mobile
```

Structure:

- label above;
- input;
- helper/error below when needed.

Use visible focus ring.

Do not rely on placeholder as the only label.

Error state:

- semantic danger border;
- error icon optional;
- short message close to input.

Success state only when meaningful; do not decorate every valid field.

---

## 16. Selection cards

Use for important binary/low-count choices such as:

- Agenda Atendly vs Minha Agenda;
- start from scratch vs import;
- AI tone.

Desktop:

- cards can sit side by side.

Mobile:

- stack vertically.

Selected state:

- 2px accessible green border;
- subtle green background;
- check indicator;
- preserve text readability.

Default:
- 1px neutral border.

Hover:
- subtle border/elevation.

Do not preselect consequential choices.

---

## 17. Status badges

Keep badges compact.

Examples:

### Operational

- `Conectado`
- `Desconectado`
- `Reconectando`
- `Sincronizado`
- `Atenção`
- `Pausado`

### AI

Use violet family for:

- `IA atendendo`
- `Criado pela IA`

### Human

Use coral/warning family for:

- `Aguardando você`
- `Atendimento humano`

### Calendar source

Use neutral/brand styles:

- `Gerenciado pela Atendly`
- `Sincronizado com Minha Agenda`

Do not use bright solid badge colors for every state.

---

## 18. Cards

Cards should group related information, not decorate every object.

Default:

```text
background white
border 1px neutral.200
radius 16px
padding 20–24px desktop
padding 16–20px mobile
shadow none
```

Use card headings only when necessary.

Avoid nested cards inside cards unless there is a strong information reason.

---

## 19. Banners

Persistent banners are used for blocking/important operational states.

Examples:

- WhatsApp disconnected;
- Minha Agenda error;
- setup incomplete;
- migration in progress.

Banner anatomy:

- icon;
- short title;
- one-line explanation;
- contextual CTA;
- optional dismiss only when safe.

Do not stack multiple critical banners.

Prioritize the state that most directly prevents customer service.

---

## 20. Tables and lists

Desktop tables are appropriate for:

- customers;
- services;
- import diagnostics;
- migration conflict summaries.

Rules:

- 48–56px row height;
- clear row hover;
- sticky header only for long lists;
- actions grouped at row end;
- avoid showing every field;
- support responsive reduction.

Mobile:
- convert data tables to cards/list rows;
- do not horizontally scroll large desktop tables unless unavoidable.

---

## 21. Search and filters

Use search prominently in:

- Conversations;
- Customers.

Use compact filter chips for small sets.

For many filters:
- desktop popover/filter panel;
- mobile bottom sheet.

Active filters should be visible and easy to clear.

---

## 22. Dashboard composition

Do not build a generic six-card KPI grid.

Recommended desktop structure:

```text
[ Page header / date / operational status ]

[ Today agenda: wide ] [ Next appointment: medium ]

[ AI appointments ] [ Hours saved ] [ Estimated revenue ]

[ Conversations needing attention: wide ]

[ Quick actions ]
```

Alternative grid is allowed if hierarchy remains clear.

### Metrics

Metrics should include context.

Good:

```text
8
Agendamentos feitos pela IA
+3 desde ontem
```

Bad:

```text
8
AI
```

### Status

Operational health should be visible near the top:

- WhatsApp;
- calendar;
- integration;
- unresolved action.

Use a compact status bar/card, not a huge system health dashboard.

---

## 23. Conversations

### Desktop layout

Preferred at 1440px:

```text
conversation list 320–360px
chat flexible 520–700px
context 280–340px
```

Collapse context at smaller widths.

### Conversation list

Each item:

- avatar/initial;
- customer name;
- last message;
- time;
- unread count;
- AI/human state;
- appointment/failure marker.

Selected item:
- subtle neutral/green tint;
- no heavy border.

### Chat

Do not clone WhatsApp visually.

Use neutral message bubbles:

- customer: soft neutral;
- business/human: white or subtle green tint;
- AI-generated: visually related to business messages with a small violet AI indicator.

System events:
- centered/timeline card;
- different from chat bubbles.

### Composer

Include:

- multiline text;
- send;
- attachment placeholder only if needed;
- state indication when IA is paused/human takeover.

When human has taken over, make that state obvious near composer/header.

---

## 24. Agenda

### Desktop

Support:

- Day
- Week
- List

The calendar should be clean, not overly colored.

Appointment block hierarchy:

1. time;
2. customer;
3. service;
4. compact state/origin.

Use color mainly for status/origin accents, not full rainbow categories.

### Mobile

Prioritize:

- selected date strip/calendar;
- Day view;
- List view;
- sticky/floating `Novo agendamento` action if it does not obstruct content.

Do not display a desktop week grid scaled down.

### Appointment detail

Use summary section plus actions.

Order:

1. status;
2. date/time;
3. customer;
4. service;
5. price;
6. origin;
7. notes/history.

Destructive cancellation belongs lower in hierarchy.

---

## 25. Customers

### List

Desktop:
- searchable table/list.

Mobile:
- compact rows/cards.

Show:

- name;
- phone;
- last contact;
- next appointment;
- appointment count.

Do not expose irrelevant CRM fields.

### Detail

Use sections/tabs only if needed:

- Resumo
- Conversas
- Agendamentos
- Observações

Avoid creating complex CRM navigation in V1.

---

## 26. Services

Service list item/card should clearly show:

- name;
- duration;
- price / `Sob consulta`;
- active/inactive;
- origin if external.

Use status toggle only where editing is actually supported.

For Minha Agenda unsupported editing:
- render read-only data;
- use `Editar no Minha Agenda`.

---

## 27. Settings

Desktop settings pattern:

```text
settings navigation 220–260px
content 640–780px
```

or a settings hub followed by dedicated pages.

Mobile:
- list of setting sections;
- dedicated page per section.

Do not use one giant settings form.

Use section descriptions only when a setting has operational consequences.

---

## 28. Authentication

### Desktop

Use a two-region composition:

```text
brand/story panel 42–48%
form region 52–58%
```

The brand side may use navy with subtle Conversation Flow graphics.

Do not use excessive illustration.

Form area:

- centered;
- max width 420–460px;
- calm white background.

### Mobile

Use:

- compact navy brand/header region;
- white form panel;
- safe areas;
- no unnecessary hero content.

Keep primary action visible without excessive scroll.

---

## 29. Onboarding

The onboarding should feel lighter than settings.

Use a centered focused container.

Desktop:

```text
max width 600–720px
```

Mobile:
- full width;
- 16px page padding;
- CTA aligned to safe bottom region when practical.

Persistent header:

- Back;
- `ETAPA X DE Y`;
- compact progress;
- optional save/exit.

Do not show all step names horizontally on mobile.

### Progress

Use a thin progress line.

Avoid large steppers with circles and labels.

---

## 30. WhatsApp connection

### Desktop

QR panel should:

- have strong white contrast;
- use appropriate quiet zone;
- sit next to three concise numbered steps;
- show live connection state.

States:

- generating;
- waiting;
- expired;
- linking;
- connected;
- failure.

### Mobile

Primary visual object is the linking code.

Use:

- large monospaced/clear code;
- `Copiar código`;
- 3–4 concise steps;
- live connection state.

When code is copied:
- provide inline feedback;
- do not rely only on a toast.

---

## 31. AI tone selection

Two selection cards:

### Profissional e objetiva

Preview example should feel concise and more formal.

### Leve e próxima

Preview example should feel friendly without slang overload.

Visually:

- use subtle violet AI icon/accent;
- do not use avatars;
- recommended label may be present on `Leve e próxima`;
- selection still requires explicit user action.

---

## 32. Import and migration

Migration is a high-trust workflow.

Use a restrained wizard.

### Diagnostic summary

Show top-level counts first:

- services;
- customers;
- future appointments;
- missing fields;
- conflicts.

Then allow category-level drill-down.

Do not force the user to review clean records.

### Conflict resolution

Use:

- issue category;
- source value;
- destination value;
- safe recommendation;
- explicit user choice only when necessary.

Never apply irreversible decisions silently.

### Progress

Communicate:

- current step;
- source still active or not;
- safe to leave or not;
- temporary limitations.

### Result

Differentiate clearly:

- success;
- partial success;
- failure.

Failure must explicitly state when the old source remains official.

---

## 33. Empty states

Pattern:

```text
[ simple icon ]
Title
1–2 line explanation
Primary action
Optional secondary link
```

Keep maximum width around 360–440px.

Examples:

### Agenda

`Ainda não há agendamentos`

Explain that bookings created manually or by Atendly will appear here.

### Conversations

`Suas conversas aparecerão aqui`

Explain that WhatsApp messages populate the area.

### Services

`Cadastre seu primeiro serviço`

Show a clear CTA only when Agenda Atendly is editable.

---

## 34. Loading

Use skeletons that match final layout.

Use spinners primarily for:

- buttons;
- small bounded actions;
- explicit connection states.

Avoid full-page indefinite spinners.

For import/migration:
- use progress + current step rather than generic spinner.

---

## 35. Error states

Error copy structure:

1. what happened;
2. operational consequence;
3. next action.

Example:

```text
Não foi possível consultar sua agenda
Os horários podem estar desatualizados. Tente sincronizar novamente antes de confirmar um novo agendamento.
[ Tentar novamente ]
```

Avoid:

```text
Erro 500
Algo deu errado
```

Technical identifiers can be secondary support metadata.

---

## 36. Notifications

Highlight only operationally relevant events:

- AI-created appointment;
- cancellation;
- reschedule;
- waiting-for-human conversation;
- disconnected WhatsApp;
- integration failure;
- import finished;
- migration pending;
- incomplete scheduling data.

Do not create notification noise.

---

## 37. Forms

Use progressive disclosure.

Prefer:

- selection before dependent inputs;
- specific labels;
- helper text only when useful;
- one logical section per viewport on mobile.

For monetary values:
- BRL formatting.

For time:
- Brazilian locale presentation.

For dates:
- prioritize human-readable local format.

---

## 38. Motion

Motion should be subtle and functional.

Use approximately:

```text
120–160ms small hover/press
180–220ms panels/dropdowns
220–280ms bottom sheets/modals
```

Use standard ease-out.

Animate:

- selection;
- panel entry;
- status transition;
- loading → success.

Do not animate metrics or charts decoratively.

Respect reduced-motion settings.

---

## 39. Content density

### Mobile

Favor clear single-column flow.

### Desktop

Use space efficiently.

Avoid both extremes:

- giant sparse cards with little content;
- enterprise-grade dense grids.

A self-employed professional should be able to understand the first viewport in a few seconds.

---

## 40. Data visualization

Use charts sparingly.

V1 dashboard does not require complex charts.

When a chart is useful:
- use simple bars/line;
- no 3D;
- no decorative gauges;
- no pie chart with many categories.

Prefer direct operational metrics over visual analytics.

---

## 41. Semantic visual mapping

Keep these associations consistent:

```text
Green  → primary action / operational success
Violet → AI / automation
Coral  → human attention / non-destructive warning
Red    → error / destructive
Navy   → hierarchy / brand
Gray   → neutral / metadata / read-only
```

Do not redefine semantic meaning screen by screen.

---

## 42. Component inventory

Create reusable components for at least:

- AppShell/Desktop
- AppShell/Mobile
- Sidebar/NavItem
- BottomNav/NavItem
- PageHeader
- StatusBanner
- StatusBadge
- Button/Primary
- Button/Secondary
- Button/Tertiary
- Button/Destructive
- IconButton
- TextInput
- PasswordInput
- Select
- SearchInput
- Checkbox
- Radio/SelectionCard
- DaySelector
- TimeInput
- PriceInput
- FilterChip
- Tabs
- Card
- MetricCard
- AppointmentCard
- ConversationRow
- ChatBubble
- SystemEvent
- Composer
- CustomerRow
- ServiceRow
- EmptyState
- Skeleton
- InlineError
- Modal
- BottomSheet
- Toast for non-blocking feedback only
- ConfirmDialog
- ProgressBar
- StepBadge
- QRPanel
- LinkingCode
- MigrationSummary
- ConflictRow

Every interactive component must represent:

- default;
- hover;
- pressed;
- focus;
- disabled;
- loading where applicable;
- success/error where applicable.

---

## 43. Screen-level visual priorities

### Início

Priority:
1. operational state;
2. today;
3. next action;
4. automation value.

### Conversas

Priority:
1. conversations requiring human attention;
2. unread/recent;
3. conversation context;
4. takeover state.

### Agenda

Priority:
1. time/date;
2. customer;
3. service;
4. availability;
5. origin/state.

### Clientes

Priority:
1. identification;
2. upcoming appointment;
3. history.

### Serviços

Priority:
1. service;
2. duration;
3. price;
4. active state;
5. origin.

### Configurações

Priority:
1. operationally important settings;
2. current source/status;
3. safe changes;
4. account/legal.

---

## 44. Final visual review checklist

Before considering a screen complete, verify:

- Is the primary action obvious?
- Is the current operational state obvious?
- Is the official calendar source clear where relevant?
- Can a non-technical user understand the language?
- Is any unsupported functionality implied?
- Are error consequences understandable?
- Does mobile feel intentionally designed rather than compressed?
- Are colors used semantically?
- Is there unnecessary visual decoration?
- Is there unnecessary information?
- Does the screen reuse the established component system?
- Does the interface look like the same product as every other screen?
- Does the result feel professional enough for a paid SaaS product?

## Provenance

Formalized by OpenDesign from candidate cae4c56c-4fd6-45c6-81ae-1d6ff42f7d61.
