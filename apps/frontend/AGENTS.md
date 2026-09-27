<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Atendly frontend

## Produto primeiro

Antes de alterar UI, fluxo, copy, estados ou navegação, leia:

1. `../../docs/product-vault/00-HOME.md`;
2. documentos de regra/fluxo relevantes;
3. `../../docs/product-vault/03-UX-UI/`;
4. `../../docs/design-reference/claude-design/` quando a tarefa envolver visual.

O product vault prevalece sobre protótipos históricos/legados e mocks existentes. O Claude Design atual é a referência visual e comportamental aprovada, sem definir arquitetura ou regras de produto.

## Regras obrigatórias

- Agenda Atendly é a única agenda oficial.
- Minha Agenda aparece somente como importação única.
- Não renderizar estados de agenda externa ativa, sync, last sync, conflito de sync ou troca de fonte.
- IA possui `Profissional`, `Equilibrada` e `Descontraída`.
- `Atendly` é a plataforma; usar `IA` nos estados da automação.
- Conversas usam `Comercial / Não classificadas / Pessoal`.
- Mobile bottom nav: `Início / Conversas / Agenda / Clientes / Mais`.
- Um negócio usa um número de WhatsApp.

## Mobile-first

Sempre validar primeiro a experiência mobile.

### Mobile

- uma coluna;
- ação principal clara;
- formulário complexo em página própria;
- na Agenda, `Dia` é a visualização principal e padrão;
- `Semana` e `Mês` também permanecem disponíveis na Agenda;
- cada visualização da Agenda deve ter adaptação própria para o viewport, sem comprimir uma grade desktop para caber no celular;
- Chat full-screen;
- contexto de cliente via cabeçalho/tela secundária.

### Tablet/desktop

Adicionar contexto progressivamente, sem alterar o modelo mental principal.

- na Agenda, `Semana` pode ser a visualização padrão;
- `Dia`, `Semana` e `Mês` permanecem disponíveis.

## Design contract

`../../docs/design-reference/claude-design/` é referência visual subordinada ao product vault, não fonte soberana de produto.

Preserve tokens e identidade visual quando úteis, mas **não preserve telas antigas que contradizem o product vault**.

Não introduza novo design system, Tailwind/shadcn ou biblioteca visual apenas por preferência.

## UX states

Para toda superfície relevante, considerar quando aplicável:

- normal;
- loading;
- vazio;
- erro recuperável;
- erro crítico;
- bloqueio/desabilitado;
- sucesso.

Não usar toast como única comunicação de falha bloqueante.

## Copy

Português do Brasil, claro e não técnico.

Evitar termos internos como:

- tenant;
- LLM;
- provider;
- handoff;
- sync.

Preferir:

- `IA ativa`;
- `Aguardando você`;
- `Reconectar WhatsApp`;
- `Concluir importação`.

## Não inventar feature

Não adicionar UI para features fora do MVP sem decisão explícita, incluindo:

- pagamento/sinal;
- fidelidade;
- indicação;
- multi-profissional;
- múltiplos números;
- Google Calendar;
- lista de espera;
- campanhas;
- app nativo;
- IA interpretando imagem/documento.

## Como provar o que está acima

`npm test` renderiza componente de verdade. `tests/**/*.test.tsx` com o docblock
`// @vitest-environment jsdom` no topo tem DOM, Testing Library e `userEvent`;
os testes de dados continuam em `node`, sem DOM, e não mudaram.

Prove pelo que o usuário encontra, não pela classe CSS:

- **UX states** — renderize o estado e afirme o papel e o texto (`getByRole`,
  `toBeVisible`). Placeholder de loading fica fora da árvore acessível
  (`aria-hidden`), erro recuperável tem ação alcançável pelo teclado.
- **Acessibilidade** — `expectNoA11yViolations(container)` de
  `tests/support/a11y` roda axe-core em WCAG 2.1 A/AA e falha nomeando regra,
  impacto e o HTML culpado. Contraste é a única regra desligada: jsdom não faz
  layout nem cascata, então cor se confere onde o token é definido, não aqui.
- **Teclado e foco** — `userEvent.tab()` e `userEvent.keyboard()`. Foco que
  entra num diálogo, fica preso nele e volta para quem o abriu é invisível em
  screenshot e visível aqui.
- **Estado nunca só por cor** — afirme o atributo (`aria-busy`, `disabled`,
  `aria-current`), nunca a cor.

O que essa camada **não** alcança: layout real e largura de viewport. jsdom não
tem layout nem cascata — por isso contraste está desligado nela.

## O gate renderizado (`npm run validate:ui`)

Playwright em `e2e/`, rodando Chromium contra `next start`, nas cinco larguras
do vault: 360, 390, 768, 1024 e 1440. É **unidade DETERMINISTIC** — o
orquestrador roda, custo zero de modelo — e o revisor lê o resultado em vez de
operar o navegador.

O que só ele consegue responder:

- **Overflow horizontal** em cada largura, nomeando o elemento culpado.
- **Touch targets**, com dois níveis: abaixo de 24px (WCAG 2.5.8 AA) **falha**;
  entre 24 e 44px é anexado como relatório, porque "confortável" é AAA e um gate
  vermelho de nascença é um gate que alguém desliga. Link dentro de frase é
  isento, como a própria norma prevê.
- **Contraste real**, computado da paleta renderizada. É o único lugar onde
  contraste é decidido.
- **Foco visível** e **`prefers-reduced-motion`** de verdade.

`KNOWN_SMALL_TARGETS` em `viewport-matrix.spec.ts` lista a dívida anterior ao
gate, com motivo e dono. A lista é estrita nos dois sentidos: uma entrada que
**deixou de reproduzir falha**, para que a correção leve a exceção junto em vez
de deixar cemitério.

Screenshot de página inteira é anexado por rota e por largura. É **evidência
para pessoa**, nunca pass/fail: fidelidade à direção aprovada não é decidida por
verificação automática, e não deve ser declarada como provada por teste.

A saída vai para `e2e-results/`, que está no `.gitignore` de propósito — o
revisor do IA Loop é fingerprintado por `git status --porcelain` na worktree, e
artefato rastreado ali viraria `REVIEWER_MUTATED_WORKTREE`.

Rotas cobertas por `validate:ui`: só as públicas (`PUBLIC_ROUTES` em
`e2e/routes.ts`). `validate:ui` não tem sessão nem banco, e sessão falsa
provaria layout sobre dado que ninguém vê.

## O gate autenticado (dentro de `validate:integration`)

As sete telas logadas (`/inicio`, `/agenda`, `/clientes`, `/conversas`,
`/configuracoes`, `/servicos`, `/notificacoes`, `AUTHENTICATED_ROUTES` em
`e2e/routes.ts`) são medidas por `e2e/authenticated-matrix.spec.ts`, com a
mesma régua (`e2e/measure.ts`) e as mesmas cinco larguras. Ele roda como o
passo `rehearse:goal033-authenticated-ui` de `npm run validate:integration`,
não em `validate:ui`: `scripts/goal033-authenticated-ui-rehearsal.mjs` sobe
BFF, Scheduling e IA reais sobre bancos descartáveis, semeia o negócio pelas
rotas do produto, constrói e serve o frontend, e o Playwright digita e-mail e
senha em `/login` — nenhuma sessão fabricada.

Além de overflow, touch target, contraste, foco e movimento, ele mede
(Goal058):

- **Composição**, por rota e largura: o `contentMarker` da rota começa na
  primeira tela; `elementFromPoint` no centro dele devolve o próprio marcador,
  nunca sidebar, cabeçalho móvel, barra inferior ou FAB; a sidebar, quando
  visível, não sobrepõe o `main`; e o cabeçalho móvel e a barra inferior,
  quando visíveis, ficam inteiros dentro da viewport.
- **Alcance por clique real** (`locator.click()` sem `force`): a linha semeada
  de Conversas, Clientes e Serviços abre o detalhe, e "Novo serviço" abre o
  formulário e "Criar serviço" recebe o clique, nas cinco larguras.
- **Serviço de 45 minutos** salvo pelo formulário, com resposta 2xx e
  "45 min" na lista.

A casca que essas medidas protegem é a classe base `app-frame`, que
`AppShell` aplica em toda casca ao lado de `${module}-shell`
(`src/shared/styles/atendly.css`). Cabeçalho móvel e barra inferior da base
ficam dentro de `:where()`, com especificidade zero, para que a regra de um
módulo (por exemplo `.settings-bottom-nav`) sempre vença.

Para rodar só este gate, com um PostgreSQL descartável em loopback (receita
em `docs/migration/VALIDATION_GATE.md`):

```bash
BFF_TEST_DATABASE_URL="postgresql://pgtest@127.0.0.1:55432/atendly_bff_test" \
  node scripts/goal033-authenticated-ui-rehearsal.mjs
```

a partir da raiz do repositório. A saída vai para
`e2e-results/authenticated/`, fora do Git pelo mesmo motivo acima.

`tests/support/a11y.test.tsx` existe para provar que o portão morde: ele aponta
o axe para markup quebrado de propósito e exige que falhe. Um axe mal
configurado não falha alto, ele aprova tudo em silêncio.

## Limite técnico

Mantenha as regras técnicas locais existentes do app quando não contradisserem o produto. Não use uma refatoração visual/produtiva como justificativa para alterar arquitetura técnica sem escopo explícito.
