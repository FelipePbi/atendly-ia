# GOAL — Reconstrução Pixel-Perfect do Frontend Atendly

## Objetivo principal

Reconstruir integralmente `apps/frontend` como a nova aplicação web da Atendly, usando **React 19 + Next.js 16 + TypeScript**, tomando o protótipo exportado em `apps/frontend-open-design` como **contrato visual e comportamental obrigatório**.

A implementação deve ser **pixel-perfect**, responsiva, acessível, modular, reutilizável e tecnicamente limpa.

Esta tarefa **não é uma reinterpretação visual**, modernização, simplificação ou adaptação livre do protótipo.

O objetivo é transformar o Open Design em uma implementação React production-ready com fidelidade máxima ao material exportado.

A tarefa só pode ser considerada concluída quando:

- todos os fluxos previstos estiverem implementados;
- todos os estados visuais previstos estiverem implementados;
- todas as telas relevantes estiverem mapeadas;
- a responsividade estiver equivalente ao protótipo;
- os componentes compartilhados estiverem consolidados;
- o resultado visual estiver auditado contra o Open Design;
- lint, typecheck, format e build estiverem passando;
- não existirem divergências visuais ou funcionais conhecidas relevantes.

**Não concluir a tarefa com pendências conhecidas de UI, responsividade, estados, comportamento ou consistência.**

---

# 1. Princípio fundamental

`apps/frontend-open-design` é a referência visual oficial.

`apps/frontend` é a implementação de produção.

Nunca usar `frontend-open-design` diretamente como runtime da aplicação.

Não importar diretamente seus arquivos HTML, CSS ou JavaScript para executar dentro do frontend final.

O trabalho esperado é:

```text
Open Design HTML/CSS/JS
        ↓
análise criteriosa
        ↓
extração de tokens e padrões
        ↓
modelagem de componentes React
        ↓
reimplementação dos comportamentos
        ↓
validação visual
        ↓
apps/frontend
```

---

# 2. Fontes de verdade

Antes de escrever código, ler e compreender as fontes abaixo.

## 2.1 Fonte funcional

Prioridade:

1. `docs/CONTEXTO_PRODUTO_ATENDLY.md`
2. `docs/ESPECIFICACAO_TELAS_UX_ATENDLY.md`

Esses documentos determinam:

- regras de negócio;
- fluxos;
- estados;
- comportamentos;
- limitações;
- nomenclaturas;
- menus;
- origem de agenda;
- funcionamento conceitual da Atendly.

Nunca inventar funcionalidade não especificada.

Nunca alterar regra funcional apenas para facilitar implementação.

---

## 2.2 Fonte visual

Prioridade:

1. `apps/frontend-open-design/DESIGN-HANDOFF.md`
2. `apps/frontend-open-design/DESIGN-MANIFEST.json`
3. HTML correspondente à tela em `apps/frontend-open-design`
4. CSS correspondente à tela em `apps/frontend-open-design`
5. JavaScript correspondente ao fluxo em `apps/frontend-open-design`
6. `apps/frontend-open-design/DESIGN.md`
7. `apps/frontend-open-design/AGENTS.md`

Quando houver dúvida visual, observar diretamente HTML/CSS/JS exportados.

Quando houver dúvida de interação, observar diretamente os scripts exportados.

Quando houver divergência entre a implementação e o protótipo, **o protótipo vence**.

---

# 3. Regra de fidelidade

A implementação deve reproduzir de forma criteriosa:

- hierarquia visual;
- dimensões;
- espaçamentos;
- grid;
- alinhamentos;
- largura máxima;
- gutters;
- densidade;
- tipografia;
- pesos tipográficos;
- tamanhos;
- line-height;
- tracking;
- cores;
- superfícies;
- borders;
- radius;
- sombras;
- ícones;
- estados;
- navegação;
- comportamento responsivo;
- sticky/fixed positioning;
- sheets;
- dialogs;
- dropdowns;
- tabs;
- chips;
- inputs;
- botões;
- loading;
- feedback;
- empty states;
- errors;
- success states;
- animations;
- motion timing;
- focus management;
- keyboard interaction.

Não aproximar valores quando o valor pode ser obtido do CSS original.

Não substituir padrões específicos do protótipo por componentes genéricos apenas para economizar código.

Não transformar a UI em um dashboard genérico.

Não alterar o design por preferência pessoal.

---

# 4. Stack obrigatória

Manter:

```text
React 19
Next.js 16
App Router
TypeScript strict
ESLint
Zod
clsx
```

Usar:

```text
CSS Variables
CSS Modules
Inter
IBM Plex Mono quando previsto
```

Evitar introduzir novas dependências sem necessidade real.

---

# 5. Tailwind

O projeto atualmente contém Tailwind, porém a nova implementação **não deve depender de Tailwind para reconstruir o design principal**.

Usar preferencialmente:

```text
CSS Variables
+
CSS Modules
+
clsx
```

Motivo:

o Open Design possui regras visuais precisas com:

- `oklch()`;
- `color-mix()`;
- `clamp()`;
- CSS variables;
- media queries;
- container behavior;
- spacing específico;
- motion específico.

A conversão para utility classes não deve introduzir divergências.

---

# 6. Arquitetura alvo

Estruturar o frontend aproximadamente desta forma:

```text
apps/frontend/

├── public/
│   ├── brand/
│   └── icons/
│
├── src/
│
│   ├── app/
│   │   ├── (auth)/
│   │   ├── onboarding/
│   │   ├── (platform)/
│   │   │   ├── inicio/
│   │   │   ├── conversas/
│   │   │   ├── agenda/
│   │   │   ├── clientes/
│   │   │   ├── servicos/
│   │   │   └── configuracoes/
│   │   │
│   │   ├── _preview/
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── onboarding/
│   │   ├── dashboard/
│   │   ├── conversations/
│   │   ├── calendar/
│   │   ├── appointments/
│   │   ├── customers/
│   │   ├── services/
│   │   ├── settings/
│   │   ├── migration/
│   │   └── system/
│   │
│   ├── shared/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── icons/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── types/
│   │   └── styles/
│   │
│   └── mocks/
│       ├── data/
│       ├── scenarios/
│       ├── services/
│       └── index.ts
```

A estrutura pode ser refinada se necessário, desde que preserve estes princípios:

```text
app/
= routing e composição

features/
= domínio

shared/
= infraestrutura visual e reutilizável

mocks/
= dados e comportamento temporário
```

Evitar:

- `components/` global sem domínio;
- componentes gigantes;
- regras de negócio em `page.tsx`;
- mock inline em páginas;
- dependência circular;
- duplicação de componentes.

---

# 7. Rotas

`page.tsx` deve ser simples.

Exemplo:

```tsx
export default function ConversationsPage() {
  return <ConversationsScreen />;
}
```

A lógica visual e de domínio deve residir dentro de `features`.

---

# 8. Design System

Antes de implementar páginas completas, extrair o design system do Open Design.

Criar tokens para:

- background;
- surface;
- foreground;
- muted;
- borders;
- accent;
- accent vivid;
- navy;
- violet;
- coral;
- danger;
- warning;
- info;
- disabled;
- overlay;
- focus;
- shadows;
- typography;
- spacing;
- radius;
- motion;
- easing.

Não duplicar valores arbitrariamente pelos CSS Modules.

Centralizar tokens.

---

# 9. Componentes compartilhados mínimos

Implementar componentes reutilizáveis para os padrões recorrentes.

Inventário inicial:

```text
Button
IconButton
Input
PasswordInput
Select
Checkbox
Radio
ChoiceCard
Chip
Tabs
Badge
StatusIndicator
Card
Alert
Banner
Skeleton
Spinner
Tooltip
Dropdown
Modal
Dialog
BottomSheet
EmptyState
ErrorState
Progress
Avatar
SearchInput
```

Adicionar outros componentes somente quando forem padrões realmente recorrentes.

Cada componente deve suportar os estados previstos no protótipo.

Quando aplicável:

```text
default
hover
pressed
focus
disabled
loading
success
error
```

---

# 10. Acessibilidade obrigatória

Preservar e reimplementar o comportamento acessível do protótipo.

Obrigatório:

- headings semanticamente corretos;
- labels;
- `aria-*` apropriados;
- navegação por teclado;
- focus visível;
- focus trap em overlays;
- retorno de foco ao fechar dialogs;
- Escape para fechamento quando aplicável;
- tabs navegáveis por teclado;
- radiogroups navegáveis por teclado;
- skip link;
- targets mínimos adequados;
- contraste WCAG AA;
- sem dependência exclusiva de cor.

Não remover comportamento acessível existente no protótipo.

---

# 11. Responsividade

A aplicação é uma única experiência web responsiva.

Não criar versões independentes desktop/mobile.

Validar obrigatoriamente:

```text
360x800
390x844
430x932
600x960
820x1180
1024x768
1366x768
1440x900
1920x1080
```

O comportamento deve seguir os layouts reais presentes no protótipo.

Verificar:

- sidebar;
- bottom navigation;
- header;
- gutters;
- grids;
- cards;
- modais;
- bottom sheets;
- formulários;
- onboarding;
- tabelas/listas;
- conversas;
- agenda;
- painéis laterais;
- safe area;
- overflow horizontal.

Zero overflow horizontal não intencional.

---

# 12. Mobile

Mobile não é desktop comprimido.

Preservar:

- bottom navigation;
- header compacto;
- menu Mais;
- sheets;
- mudança de disposição dos painéis;
- CTA visível;
- dimensões de toque;
- fluxo de onboarding;
- comportamento com teclado;
- scroll apenas quando previsto.

---

# 13. Mock architecture

Todos os dados devem ser mockados nesta etapa.

Não usar:

```text
BFF
API
Evolution Go
Minha Agenda real
Banco
Auth real
Cookies reais
```

Porém não criar mocks desorganizados dentro das telas.

Estruturar:

```text
mocks/data
mocks/scenarios
mocks/services
```

A UI deve consumir serviços abstratos.

Exemplo conceitual:

```text
Dashboard
   ↓
DashboardService
   ↓
MockDashboardService
```

Futuramente:

```text
Dashboard
   ↓
DashboardService
   ↓
BffDashboardService
```

A troca futura não deve exigir reescrever componentes.

---

# 14. Contratos internos

Criar interfaces internas para serviços relevantes.

Exemplos:

```text
AuthService
DashboardService
ConversationService
CalendarService
CustomerService
ServiceCatalogService
SettingsService
MigrationService
```

Nesta fase:

```text
Mock*
```

posteriormente:

```text
Bff*
```

Não implementar BFF agora.

---

# 15. Estado

Nesta etapa usar apenas o necessário:

- state local;
- `useReducer`;
- Context quando realmente global;
- URL/router;
- componentes server/client conforme necessidade.

Não introduzir por padrão:

```text
Redux
Zustand
TanStack Query
SWR
```

Não existe server state real nesta fase.

---

# 16. Mapeamento das telas do Open Design

O export possui muitas telas que representam **estados**, e não necessariamente rotas separadas.

Exemplo:

```text
dashboard-atendly
dashboard-empty
dashboard-loading
dashboard-integration-error
dashboard-whatsapp-disconnected
```

Devem compartilhar a mesma feature/rota de dashboard.

Usar scenarios.

Exemplo:

```tsx
<DashboardScreen scenario="atendly" />
<DashboardScreen scenario="empty" />
<DashboardScreen scenario="loading" />
<DashboardScreen scenario="integration-error" />
```

O mesmo princípio vale para:

- conversas;
- clientes;
- serviços;
- agenda;
- settings;
- onboarding;
- migration;
- system states.

Não criar 117 arquiteturas isoladas.

---

# 17. Área interna `_preview`

Criar uma área interna de desenvolvimento:

```text
/_preview
```

Ela deve permitir abrir cada cenário importante individualmente.

Exemplos:

```text
/_preview/dashboard-atendly
/_preview/dashboard-empty
/_preview/dashboard-loading

/_preview/conversation-ai-active
/_preview/conversation-human

/_preview/agenda-atendly
/_preview/agenda-external
```

Objetivo:

facilitar comparação visual direta entre:

```text
frontend-open-design/*.html
```

e:

```text
frontend/_preview/*
```

A área `_preview` não faz parte da navegação normal do produto.

---

# 18. Fluxos obrigatórios

Implementar integralmente os módulos abaixo.

## Etapa 1 — Fundação

- limpeza do frontend legado;
- arquitetura;
- TypeScript;
- ESLint;
- Prettier;
- design tokens;
- global CSS;
- fontes;
- ícones;
- componentes base;
- desktop shell;
- mobile shell;
- `_preview`.

---

## Etapa 2 — Auth

Implementar:

- login;
- cadastro;
- cadastro com erros;
- recuperação;
- solicitação enviada;
- nova senha;
- link expirado;
- termos;
- privacidade.

Preservar responsividade e validações.

---

## Etapa 3 — Onboarding Agenda Atendly

Implementar:

- dados do negócio;
- escolha da agenda;
- começar do zero/importar;
- nome do serviço;
- duração;
- preço;
- dias;
- horários;
- confirmação;
- conclusão;
- importação;
- análise;
- preview;
- confirmação;
- progresso;
- sucesso;
- parcial;
- erro.

---

## Etapa 4 — Onboarding Minha Agenda

Implementar:

- introdução;
- conectar;
- autenticando;
- conectada;
- validação;
- serviços;
- clientes;
- agendamentos;
- disponibilidade;
- integração válida;
- incompleta;
- falha;
- indisponível.

Não inventar mecanismo real de autenticação da integração.

---

## Etapa 5 — Dashboard

Implementar:

- Agenda Atendly;
- Minha Agenda;
- vazio;
- loading;
- erro de integração;
- WhatsApp desconectado.

A tela deve responder claramente:

> O que a Atendly fez pelo meu negócio hoje?

---

## Etapa 6 — Conversas

Implementar:

- listagem;
- busca;
- filtros;
- thread;
- contexto;
- IA ativa;
- atendimento humano;
- pausada;
- aguardando humano;
- resolvida;
- erro;
- empty;
- loading.

Preservar diferenças desktop/mobile.

---

## Etapa 7 — Agenda

Implementar:

- agenda principal;
- Agenda Atendly;
- Minha Agenda;
- criar agendamento;
- detalhe;
- reagendar;
- cancelar;
- bloquear horário;
- empty;
- loading;
- erro de integração;
- conflito de sincronização.

---

## Etapa 8 — Clientes + Serviços

Clientes:

- listagem;
- detalhes;
- novo;
- integração externa;
- empty;
- loading;
- erro.

Serviços:

- listagem;
- novo;
- editar;
- integração externa;
- external empty;
- empty;
- loading;
- erro.

---

## Etapa 9 — Configurações + Migração

Configurações:

- negócio;
- IA;
- WhatsApp;
- WhatsApp desconectado;
- erro;
- expirado;
- reconectando;
- agenda;
- Minha Agenda;
- disponibilidade;
- conta;
- loading;
- erro.

Migração:

- para Agenda Atendly;
- para Minha Agenda;
- diagnóstico;
- conflitos;
- review;
- progresso;
- sucesso;
- sucesso parcial;
- erro.

---

## Etapa 10 — Estados sistêmicos e acabamento

Implementar:

- offline;
- sessão expirada;
- integração externa indisponível;
- erro inesperado.

Depois realizar revisão geral completa.

Não criar nova direção visual nesta etapa.

O objetivo é corrigir inconsistências.

---

# 19. Fluxo funcional obrigatório

Todos os fluxos principais devem ser navegáveis usando mocks.

Exemplo conceitual:

```text
Cadastro
↓
Onboarding
↓
Escolha da agenda
↓
Configuração
↓
Tom da IA
↓
WhatsApp
↓
Validação
↓
Início
```

Implementar links, botões, voltar, avançar, modais, sheets e ações suficientes para permitir percorrer o produto.

Não deixar botões funcionais importantes sem comportamento apenas porque o backend ainda não existe.

Usar comportamento mockado.

---

# 20. Regras funcionais que não podem ser violadas

Preservar as regras dos documentos.

Especial atenção:

- exatamente uma fonte oficial de agenda;
- Agenda Atendly ou Minha Agenda;
- mudança de origem via migração assistida;
- nunca via toggle instantâneo;
- appointment só confirmado após persistência bem-sucedida na fonte oficial;
- não inventar disponibilidade;
- não inventar preços;
- não inventar serviços;
- não apresentar operação falha como sucesso;
- IA possui apenas os tons definidos no produto;
- não criar persona personalizada na V1;
- WhatsApp desconectado impede atendimento automático;
- diferenças entre integração e importação precisam ficar claras.

---

# 21. Código legado

O frontend atual deve ser tratado principalmente como infraestrutura existente.

Preservar quando útil:

- Next.js;
- React;
- TypeScript;
- configuração de build;
- integração de monorepo;
- assets realmente compatíveis;
- legal-contract quando necessário.

Substituir quando incompatível:

- páginas;
- componentes;
- CSS;
- layout;
- onboarding;
- chat antigo;
- persona antiga;
- estrutura visual anterior.

Não tentar encaixar o novo produto dentro da UI antiga.

---

# 22. Testes automatizados

Nesta fase não criar ou manter suite automatizada como requisito.

Fora do escopo:

```text
Vitest
Jest
Testing Library
Playwright
E2E
snapshot tests
visual regression automatizado
```

Remover scripts/configurações legadas de teste se não forem mais necessários para esta etapa.

A validação desta fase será feita por:

```text
lint
typecheck
format check
build
auditoria manual
auditoria visual
```

---

# 23. Scripts obrigatórios

O frontend deve disponibilizar e passar:

```bash
npm run lint
npm run typecheck
npm run format:check
npm run build
```

Adicionar scripts quando necessário.

---

# 24. TypeScript

Obrigatório:

```json
"strict": true
```

Preferir:

```json
"allowJs": false
```

No frontend novo.

Evitar:

```ts
any
```

Não usar `as` indiscriminadamente apenas para silenciar erros.

Modelar corretamente tipos de domínio e props.

---

# 25. ESLint e Prettier

Configurar código consistente.

Adicionar Prettier se necessário.

Não adicionar Husky/lint-staged nesta etapa sem necessidade.

Corrigir warnings relevantes.

Não encerrar a tarefa com erros de lint ou typecheck.

---

# 26. Ícones

Preservar a linguagem visual do protótipo.

Pode-se converter o sprite SVG exportado para componentes React quando isso melhorar a manutenção.

Não substituir indiscriminadamente os ícones por variantes com desenho diferente.

Se usar biblioteca externa existente, confirmar que aparência, stroke, tamanho e proporção correspondem ao protótipo.

---

# 27. Critério de componentização

Antes de criar um componente novo:

1. verificar se já existe equivalente;
2. verificar se é realmente reutilizável;
3. verificar se o componente novo não duplica outro;
4. verificar se a abstração não elimina diferenças visuais importantes.

Evitar tanto:

```text
duplicação
```

quanto:

```text
componentes genéricos demais
```

que destruam o design.

---

# 28. Auditoria visual obrigatória

Após implementar cada módulo, realizar auditoria visual.

Para cada tela/cenário:

1. abrir o HTML original correspondente;
2. abrir a rota `_preview` equivalente;
3. comparar visualmente;
4. corrigir divergências;
5. repetir até que não existam diferenças relevantes perceptíveis.

Auditar no mínimo:

- largura;
- altura;
- proporção;
- position;
- margins;
- padding;
- gaps;
- alinhamentos;
- typography;
- colors;
- borders;
- radius;
- shadows;
- icons;
- responsive behavior;
- estados de controles;
- interaction affordances.

Não considerar "parecido" suficiente.

---

# 29. Auditoria de consistência

Após finalizar todas as features, procurar globalmente por:

- componentes duplicados;
- cores hardcoded que deveriam ser tokens;
- spacing arbitrário;
- radius inconsistentes;
- sombras inventadas;
- tamanho de fonte fora da escala;
- botão visualmente diferente sem motivo;
- variantes duplicadas;
- layouts inconsistentes;
- CSS repetido;
- páginas com overflow;
- media queries conflitantes;
- z-index aleatórios;
- código morto;
- imports mortos;
- mocks duplicados;
- tipos duplicados.

Corrigir antes de concluir.

---

# 30. Auditoria de responsividade

Para cada módulo, verificar manualmente a matriz:

```text
360x800
390x844
430x932
600x960
820x1180
1024x768
1366x768
1440x900
1920x1080
```

Checar:

- clipping;
- overflow;
- scroll;
- quebra de texto;
- CTA fora da viewport;
- navbar;
- bottom nav;
- safe area;
- sheet;
- dialog;
- formulário;
- painel lateral;
- lista;
- conversa;
- calendário.

Corrigir todos os problemas encontrados.

---

# 31. Auditoria de interações

Verificar manualmente:

- hover;
- pressed;
- focus;
- disabled;
- loading;
- success;
- error;
- keyboard;
- Escape;
- Tab;
- Shift+Tab;
- Arrow keys quando previsto;
- abrir/fechar overlays;
- retorno de foco;
- forms;
- navegação;
- scroll;
- escolha de cards;
- tabs;
- chips;
- dialogs;
- bottom sheets.

Reproduzir comportamento equivalente ao JavaScript do Open Design.

---

# 32. Auditoria de conteúdo

Comparar textos da implementação com:

- protótipo;
- especificação funcional;
- contexto do produto.

Não usar lorem ipsum.

Não substituir copy específica por texto genérico.

Não inventar regras ou promessas de produto.

Corrigir:

- ortografia;
- acentuação;
- plural;
- capitalização;
- labels;
- CTAs;
- mensagens de erro;
- mensagens de loading;
- mensagens de sucesso.

---

# 33. Não concluir prematuramente

É proibido considerar a tarefa pronta apenas porque:

- build passa;
- página abre;
- fluxo principal funciona;
- desktop está parecido;
- mobile ainda tem diferenças;
- alguns estados ainda não foram implementados;
- estilos estão "próximos";
- há placeholders temporários;
- componentes estão duplicados;
- alguns links ainda são `#`;
- determinadas interações ainda não funcionam;
- existem TODOs importantes.

Antes de concluir, executar uma auditoria final.

---

# 34. Checklist final obrigatório

Somente concluir quando TODAS as respostas forem `SIM`.

## Arquitetura

- [ ] `apps/frontend` utiliza React + Next.js + TypeScript.
- [ ] Estrutura feature-first está coerente.
- [ ] `page.tsx` contém pouca lógica.
- [ ] Mocks estão separados da UI.
- [ ] Services possuem contratos claros.
- [ ] Não existe integração real com BFF nesta etapa.

## Design system

- [ ] Tokens foram extraídos.
- [ ] Tipografia corresponde ao protótipo.
- [ ] Cores correspondem ao protótipo.
- [ ] Spacing corresponde ao protótipo.
- [ ] Radius corresponde ao protótipo.
- [ ] Shadows correspondem ao protótipo.
- [ ] Motion corresponde ao protótipo.

## UI

- [ ] Componentes recorrentes estão compartilhados.
- [ ] Não existem duplicações óbvias.
- [ ] Todos os estados necessários existem.
- [ ] Hover está correto.
- [ ] Focus está correto.
- [ ] Disabled está correto.
- [ ] Loading está correto.
- [ ] Error está correto.

## Fluxos

- [ ] Auth completo.
- [ ] Onboarding Agenda Atendly completo.
- [ ] Onboarding Minha Agenda completo.
- [ ] Dashboard completo.
- [ ] Conversas completo.
- [ ] Agenda completa.
- [ ] Clientes completo.
- [ ] Serviços completo.
- [ ] Configurações completo.
- [ ] Migração completa.
- [ ] Estados sistêmicos completos.

## Responsividade

- [ ] 360x800.
- [ ] 390x844.
- [ ] 430x932.
- [ ] 600x960.
- [ ] 820x1180.
- [ ] 1024x768.
- [ ] 1366x768.
- [ ] 1440x900.
- [ ] 1920x1080.
- [ ] Sem overflow horizontal inesperado.
- [ ] Mobile segue estrutura prevista.

## Acessibilidade

- [ ] Headings corretos.
- [ ] Labels corretas.
- [ ] Focus visível.
- [ ] Keyboard navigation.
- [ ] Focus trap.
- [ ] Escape.
- [ ] ARIA adequada.
- [ ] Contraste adequado.

## Qualidade

- [ ] Nenhum TODO relevante.
- [ ] Nenhum placeholder temporário relevante.
- [ ] Nenhum botão importante sem comportamento.
- [ ] Nenhum link funcional deixado como `#`.
- [ ] Nenhuma divergência visual relevante conhecida.
- [ ] Nenhum código morto relevante.
- [ ] Nenhuma duplicação visual evidente.
- [ ] Nenhuma regra funcional violada.

## Tooling

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run format:check`
- [ ] `npm run build`

Todos devem passar.

---

# 35. Definition of Done

A tarefa só está concluída quando:

> O frontend React implementado em `apps/frontend` puder ser comparado lado a lado com todas as telas e estados relevantes de `apps/frontend-open-design` e não apresentar divergências visuais, responsivas ou comportamentais relevantes, além de respeitar integralmente as regras de produto dos documentos em `docs`.

O critério não é:

> "parece semelhante".

O critério é:

> "corresponde ao protótipo".

---

# 36. Regra final para o agente

Trabalhe de forma iterativa e criteriosa.

Para cada módulo:

```text
ANALISAR
↓
MAPEAR
↓
IMPLEMENTAR
↓
COMPARAR
↓
AUDITAR
↓
CORRIGIR
↓
REVALIDAR
```

Somente depois avançar.

Ao final de todos os módulos:

```text
AUDITORIA GLOBAL
↓
AUDITORIA RESPONSIVA
↓
AUDITORIA DE INTERAÇÕES
↓
AUDITORIA DE CONTEÚDO
↓
LINT
↓
TYPECHECK
↓
FORMAT CHECK
↓
BUILD
↓
CORREÇÕES
↓
REEXECUTAR VALIDAÇÕES
```

Se qualquer item falhar, corrigir antes de concluir.

Não encerrar a execução relatando apenas pendências.

Não marcar como concluído enquanto existirem divergências conhecidas que possam ser corrigidas dentro do escopo.

Ao finalizar, entregar um relatório contendo:

1. arquitetura criada;
2. módulos implementados;
3. componentes compartilhados;
4. scenarios mockados;
5. rotas criadas;
6. divergências encontradas durante a auditoria e como foram corrigidas;
7. validações executadas;
8. resultado de lint;
9. resultado de typecheck;
10. resultado de format check;
11. resultado de build;
12. confirmação explícita de que a comparação final com o Open Design foi executada.

