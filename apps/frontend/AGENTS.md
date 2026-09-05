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
4. `../frontend-open-design/DESIGN.md` quando a tarefa envolver visual.

O product vault prevalece sobre protótipos antigos e mocks existentes.

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
- Agenda focada em Dia/lista;
- Chat full-screen;
- contexto de cliente via cabeçalho/tela secundária.

### Tablet/desktop

Adicionar contexto progressivamente, sem alterar o modelo mental principal.

## Design contract

`docs/prototype/claude-design/` é referência visual subordinada ao product vault, não fonte soberana de produto.

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

## Limite técnico

Mantenha as regras técnicas locais existentes do app quando não contradisserem o produto. Não use uma refatoração visual/produtiva como justificativa para alterar arquitetura técnica sem escopo explícito.
