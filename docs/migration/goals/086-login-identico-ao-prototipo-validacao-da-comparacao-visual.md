# Goal 086 — Login idêntico ao protótipo (validação da comparação visual)

**Status: ACCEPTED.** Preparado em 2026-10-01 por instrução do usuário (Felipe Borges), depois de [Goal082 ACCEPTED](../reviews/082-review.md). Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: SONNET_HIGH

Quadros do protótipo: L1

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v110. **Passa à frente do 085**, que volta a PLANNED com o mesmo ID, título e escopo.

## Baseline aceita

Baseline aceita: `10f2348bf120dcc43e49f762c7438abf49fdd4e9`

Goal anterior: 082 — A Minha Agenda conecta só com e-mail e senha e diz de quem é a falha

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal082 já integrado em `main`. Depois dele, `main` recebeu a integração do ia-loop V33 (comparação visual), que não muda código de produto. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Felipe observou que as telas não ficam iguais ao protótipo aprovado. A causa era de processo: ninguém no loop via uma tela. O Developer reconstruía a interface a partir de descrição em prosa, e a fidelidade visual ficava para uma "conferência humana" que nunca era feita. O Goal083, por exemplo, foi aceito com `/agenda/novo` ainda diferente do quadro A6.

O ia-loop V33 resolve isso com `npm run visual:compare`. O comando renderiza o quadro do protótipo e a rota do app no mesmo tamanho, em quatro devices, e grava as capturas lado a lado. A linha `Quadros do protótipo:` acima obriga o Developer e o revisor a rodar o comando e olhar as imagens. Detalhes: `tools/ia-loop/README.md` §V33 e `docs/migration/VALIDATION_GATE.md`.

**Este Goal é a validação desse mecanismo numa tela só.** A tela de entrada `/login` precisa ficar **igual ao quadro L1** nos quatro devices: mobile 402×812, tablet portrait 768×1024, tablet landscape 1024×768 e desktop 1366×768. Foi escolhida porque é autocontida: não depende da casca da área logada, que diverge em todas as outras telas, conforme o pente-fino visual de 2026-10-01.

## O que a comparação mostra na baseline

Rodado na baseline com `npm run visual:compare -- --target L1`. O Developer confirma com a própria execução antes da primeira edição:

1. **Mobile:**
   - No protótipo, o hero teal ocupa a parte de cima da tela, e o cartão claro, com cantos superiores arredondados, fica **ancorado no rodapé**, sem sobra embaixo.
   - No app, o hero é curto (~170 px), o cartão começa logo abaixo dele e sobra uma faixa vazia de ~160 px no fim.
2. **Tablet portrait, tablet landscape e desktop:**
   - Falta o selo "ATENDIMENTO COM IA NO WHATSAPP" entre o logo e o título do hero.
   - No protótipo, o painel do formulário é bege `#F7F4EF`, com cartão `#FFFDFA` e sombra difusa. No app, o painel é `#FFFDFA`, a mesma cor do cartão.
3. **Tipografia:**
   - O título do hero no protótipo é serif em peso regular e maior, em 3 linhas. No app é mais pesado e menor, em 2 linhas.
   - O título do cartão também é mais pesado e mais espaçado no app.
   - O subtítulo cabe em 1 linha no protótipo e quebra em 2 no app.
4. **Campos:** no protótipo, há ícone dentro do campo (envelope em E-mail, cadeado em Senha). No app, não há ícone.
5. **Outros elementos:**
   - O app tem uma divisória entre "Entrar" e "Ainda não tem conta? Criar conta"; o protótipo não tem.
   - No tablet portrait, o protótipo não tem o parágrafo de apoio do hero e começa ancorado no topo. O app tem o parágrafo e centraliza o conjunto na vertical.
   - O protótipo tem círculos decorativos que o app não tem ou desenha em outro tamanho.
6. **Desktop:** as bolhas da IA no mockup de conversa saem quase invisíveis no app (teal claro sobre fundo claro) e mais estreitas que no protótipo.

## Escopo obrigatório

### 1. A tela igual ao L1

**Porte** o HTML/CSS do quadro L1. A referência fica em `docs/design-reference/claude-design/prototype/project/`:

- mobile: `Login.dc.html`;
- tablet: `Login-Tablet.dc.html`, seções `#portrait` e `#landscape`;
- desktop: `Login-Desktop.dc.html`.

Em cada arquivo, use o elemento com `data-screen-label` do quadro "Login". Traduza para o CSS do app a mesma hierarquia e os mesmos valores inline: px, cores hex, Literata e Hanken Grotesk, pesos, raios, sombras e posições. Não reinterprete o layout a partir da descrição acima: ela só aponta onde está a diferença.

Repita `npm run visual:compare -- --target L1` até não haver divergência visível em nenhum dos quatro devices. Para cada device, o relatório final traz:

- o diff final;
- a lista do que ainda difere, se algo diferir, e o motivo.

**Divergência declarada, que não conta como defeito:** a saudação neutra "Boas-vindas de volta. Sua agenda continua de onde parou." no lugar de "Bem-vinda de volta.", decidida no Goal068 (DECISIONS). O texto segue o app; tamanho, peso e quebra de linha seguem o quadro.

### 2. As telas irmãs não pioram

`/cadastro`, `/recuperar-senha` e `/solicitacao-enviada` usam a mesma casca de autenticação (`AuthScreen.tsx`). Elas podem melhorar, mas:

- não podem quebrar funcionalmente;
- não podem ficar visualmente piores do que na baseline.

Rode `npm run visual:compare -- --target L3,L4,L5` no início e no fim, e cole o diff de cada device das duas execuções. Ajustá-las por inteiro aos quadros L3, L4 e L5 fica **fora** deste Goal.

### 3. Comportamento preservado

O login continua igual: os mesmos campos, a validação, as mensagens de erro, o "Esqueci minha senha", o link para criar conta e o redirecionamento depois de entrar.

`goal014-auth.test.tsx`, `goal064-auth-screens.test.tsx` e `goal068-telas-de-entrada.test.tsx` continuam passando. Só muda uma asserção que dependa de marcação puramente visual removida, como a divisória. O relatório lista cada asserção mudada e o motivo.

O gate renderizado (`validate:ui`) continua passando nas cinco larguras, inclusive contraste, toque, foco e `prefers-reduced-motion`. As bolhas do mockup precisam passar a ter contraste legível.

## Pontos de implementação

- `apps/frontend/src/features/auth/AuthScreen.tsx`
- `apps/frontend/src/shared/styles/atendly.css` e `atendly-system.css`, no bloco de autenticação
- Ícones que faltarem, em `shared/ui/` ou junto do componente, no padrão já usado pelo app

## Fora do escopo

- A casca da área logada e qualquer tela além de `/login`, exceto pelo que muda por compartilhar `AuthScreen`.
- Alterações em `docs/design-reference/`, no Product Vault e em `apps/frontend/e2e/visual/targets.json`. Mude este último só se o alvo L1 estiver mapeado errado; nesse caso, explique no relatório.

## Validação e ordem

1. Rode `npm run visual:compare -- --target L1,L3,L4,L5` na baseline, antes da primeira edição, e cole o diff de cada par.
2. Implemente, iterando com `npm run visual:compare -- --target L1`.
3. Faça a execução final, nesta ordem: `validate:core`, `test:gate`, `validate:ui` e `npm run visual:compare -- --target L1,L3,L4,L5`.
4. No relatório, para cada device do L1, descreva o que se vê em `side-by-side.png`. Não basta a porcentagem.

## Documentação

- [CURRENT_STATE](../CURRENT_STATE.md) registra que `/login` segue o quadro L1 e que a fidelidade visual é verificada pelo loop desde a V33.
- Decisão nova só se aparecer escolha que o quadro não resolve. Nesse caso, escreva-a em [DECISIONS](../DECISIONS.md) como `PROPOSED`, com o próximo número livre.
- `apps/bff/PUBLIC_API_V1.md`, o vault e `docs/design-reference/` não mudam.

## Critério de aceite

- O revisor rodou `npm run visual:compare -- --target L1` e abriu os quatro `side-by-side.png`. Não há divergência visível de estrutura, componente, cor, tipografia ou espaçamento, além da saudação declarada.
- As telas irmãs (L3, L4 e L5) não ficaram piores, e o comportamento do login está preservado com os testes passando.
- `validate:core`, `test:gate` e `validate:ui` passam na execução final.
