# Atendly Frontend

Frontend web do produto Atendly.

## Principais áreas

- Início
- Conversas
- Agenda
- Clientes
- Serviços
- Mais/Configurações

## Referências

- Produto e fluxos: [`../../docs/product-vault/00-HOME.md`](../../docs/product-vault/00-HOME.md)
- UX/UI: [`../../docs/product-vault/03-UX-UI/`](../../docs/product-vault/03-UX-UI/)
- Referência visual e comportamental aprovada: [`../../docs/design-reference/claude-design/`](../../docs/design-reference/claude-design/README.md)
- Guardrails locais: [`AGENTS.md`](AGENTS.md)

A interface existente ainda contém fluxos de agenda externa e dois tons antigos. Eles são dívida de implementação e não devem orientar telas novas.

## Tokens visuais e primitivas

`src/shared/styles/tokens.css` é a fonte única dos tokens semânticos (cor, tipografia,
espaçamento, raio, sombra, foco, z-index e movimento) da direção visual Recepção. O
`src/shared/styles/atendly.css` e os `atendly-*.css` por módulo herdam esses tokens
através dos nomes de variável já existentes (`--bg`, `--fg`, `--accent`, `--s*`,
`--r-*` etc.) — trocar o valor de um token em `tokens.css` já muda o app inteiro, sem
precisar caçar cada tela.

Tipografia é Literata (display) e Hanken Grotesk (corpo), servidas localmente de
`public/fonts/` com fallback declarado (`Georgia, serif` / `system-ui, sans-serif`) e
licença OFL no repositório — nenhuma fonte é carregada de terceiro em runtime. Tema
claro apenas.

Primitivas acessíveis vivem em `src/shared/ui/`: `Button`, `Field`, `Badge`, `Skeleton`
e `StatePanel` (vazio/erro, em `States.tsx`), `Spinner`, `Dialog` (modal, sheet e
drawer), `Toast`, `ListItem` e `PageHeader`. Todas têm foco visível pelo teclado, área
de toque de pelo menos 44px e nunca comunicam estado só pela cor (badge e toast sempre
combinam ícone/texto; skeleton fica fora da árvore acessível). `prefers-reduced-motion`
é respeitado globalmente por `tokens.css`.
