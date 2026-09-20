# Goal 031 — Alvo de toque real nas telas públicas

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal030 ACCEPTED](../reviews/030-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

A linha 031 nasce na [v52 do MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento), por inserção depois do 030, sem renumerar para trás e sem remover ID. Ela existe porque a auditoria que o próprio roadmap encomendou terminou com **veredito desfavorável** e o Goal030 estava explicitamente proibido de corrigir.

## Baseline aceita

Baseline aceita: `d37e1fe5646131a1acbc3e95c585d402dfb80f33`

Goal anterior: 030 — Auditoria final do MVP

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal030 já integrado em `main` (origem `a90a4107937eb2bb28486cca9fabc036518019f1`), incluindo o ensaio de percurso, os testes de guard, a reprodução declarada de achado, o [review030](../reviews/030-review.md) e a documentação de fechamento. O commit `16d296d2d66a39c73f4fb3d231c72ee64bb65251`, posterior a ele, corrige apenas o cabeçalho de status do documento do próprio Goal030 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Fechar **A-01** — o único `BLOQUEADOR-MVP` do [FINAL_AUDIT](../FINAL_AUDIT.md) — de forma que o alvo que a pessoa precisa acertar com o dedo cumpra o mínimo AA de 24px **e** que o gate renderizado passe a medir esse alvo, e não um elemento invisível.

O achado tem duas pontas, e elas precisam ser fechadas juntas:

- **Defeito de produto real.** Em `/link-expirado`, o link `Voltar para entrar` está sozinho dentro do parágrafo, sem texto ao redor — o que o tira da isenção de "link embutido em frase" da WCAG 2.5.8 — e mede **115×18**. Dezoito pixels de altura é falha AA medida, não estimada.
- **Régua errada.** A medição de toque coleta `input:not([type="hidden"])` e mede a caixa do próprio `<input>`. Nos dois checkboxes acusados, esse input está `position: absolute; opacity: 0` **dentro** de um `<label class="check">` de `min-height: 44px`, com a caixa visível de 22×22 em `.check-box`. O `13×13` relatado é o tamanho de um elemento que ninguém vê e ninguém toca: o alvo que recebe o toque é o label inteiro.

Isso **não** desfaz A-01 e **não** reabre o aceite do Goal030: a auditoria mediu com a régua que existia e registrou a medida real, que era exatamente o seu trabalho. O que isso determina é o modo de corrigir. Acolchoar o input escondido para ele passar de 24px seria falsificar a correção — mudaria o número sem mudar nada que a pessoa toca. E apagar as exceções antes de consertar a régua seria trocar um número errado por nenhum número.

Por isso as duas pontas são um Goal só: mudar a régua sem corrigir o link deixa o defeito de pé; corrigir o link sem mudar a régua mantém duas exceções vivas por causa de uma medida que não descreve o produto.

O risco próprio deste Goal é de uma classe só, e ele é o oposto do risco do 030: **afrouxar a medição para fazer o blocker do MVP desaparecer.** Toda regra nova de medição aqui precisa ser demonstrada por controle negativo — encolher um alvo de verdade tem que deixar o gate vermelho.

## Dependências e contexto mínimo

- Goals 001 a 030 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [FINAL_AUDIT](../FINAL_AUDIT.md): §5.2 (o que o gate decide), §5.3 (o que ele não decide), §5.4 (as medidas reais devolvidas), §6 em A-01 (classificação, reprodução e impacto) e §7 (o veredito e a contagem).
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos e a seção de limites conhecidos.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): a linha **G-31**, que já carrega A-01 e A-02.
- [AGENTS.md](../../../AGENTS.md): o guardrail de acessibilidade, contraste e touch targets é inegociável.
- `docs/design-reference/claude-design/`: consultar **apenas** a tela ou o componente em questão, se precisar julgar se um ajuste de tamanho mexe na direção aprovada. Fidelidade visual **não** é decidida por teste; é conferência humana.
- **Product Vault:** consulta dirigida (1–3 notas) só se precisar confirmar a regra de produto de acessibilidade ou de responsividade. Não abrir o vault inteiro.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `d37e1fe5`. Não gastar rodada redescobrindo:

- **O gate renderizado é `cd apps/frontend && npm run test:ui`**, com cinco projetos — `mobile-360`, `mobile-390`, `tablet-768`, `notebook-1024`, `desktop-1440` — declarados em `apps/frontend/playwright.config.ts`, servindo o build de produção por `npm run start`.
- **Ele alcança sete rotas públicas**, listadas em `apps/frontend/e2e/routes.ts:9`. Nenhuma rota autenticada é medida, e o comentário do arquivo já diz por quê.
- **A medição de toque está em `apps/frontend/e2e/viewport-matrix.spec.ts`**: o teste roda só nos dois projetos `mobile-*`, o seletor está em `:105`, a isenção de link embutido em frase em `:118`–`:124`, a asserção de exceção obsoleta em `:143`–`:147` e a asserção final de `belowAA` no fim do bloco. `TOUCH_TARGET_AA = 24` e `TOUCH_TARGET_COMFORTABLE = 44` estão em `:23`–`:24`; o segundo é **relatado, nunca falha**.
- **`KNOWN_SMALL_TARGETS` (`:41`) tem exatamente três entradas**, cada uma com `html`, `route` e `why`, e o mecanismo é estrito nos dois sentidos: exceção que deixa de reproduzir **falha**.
- **O padrão de checkbox do produto já é o correto visualmente**: `atendly.css:479`–`:486` dá ao `.check`/`.radio` `display: flex` e `min-height: 44px`; `:487`–`:491` esconde o input nativo com `position: absolute; opacity: 0`; `:492`–`:504` desenha `.check-box` em 22×22; `:526`–`:530` dá foco visível ao `.check-box` pelo `:focus-visible` do input. O que falta não é estilo de checkbox.
- **O link de `/link-expirado` está em `apps/frontend/src/features/auth/AuthScreen.tsx:255`–`:259`**, dentro de `<p className="auth-footer">`, sem outro texto no parágrafo. A classe `.auth-link` está em `atendly.css:3384`–`:3392` e **não** tem altura mínima. Os outros usos de `.auth-link` (`AuthScreen.tsx:393`, `:421`, `:428`) ficam ao lado de outro texto ou dentro de frase.
- **`accessibility.spec.ts` roda axe com `wcag2a`, `wcag2aa`, `wcag21a` e `wcag21aa` nas mesmas sete rotas** e é o único lugar onde contraste é decidido de verdade.
- **O veredito vigente do MVP é 1 `BLOQUEADOR-MVP` (A-01), 11 `PENDENCIA-POS-MVP` e 7 `LIMITE-DECLARADO`** ([FINAL_AUDIT §7](../FINAL_AUDIT.md)). A contagem só muda por evidência executada nesta rodada.

## Pontos de implementação

- `apps/frontend/e2e/viewport-matrix.spec.ts`: a régua do alvo efetivo e a lista de exceções.
- `apps/frontend/e2e/` (arquivo auxiliar novo, se ajudar a manter a régua legível): permitido, desde que não crie rota, fixture de produto nem sessão fabricada.
- `apps/frontend/src/features/auth/AuthScreen.tsx` e `apps/frontend/src/shared/styles/atendly.css`: a correção do alvo real.
- `apps/frontend/tests/`: apenas se a correção de produto mudar markup que um teste jsdom existente já afirma.
- `docs/migration/`: [FINAL_AUDIT](../FINAL_AUDIT.md), [GAP_ANALYSIS](../GAP_ANALYSIS.md), [VALIDATION_GATE](../VALIDATION_GATE.md), [CURRENT_STATE](../CURRENT_STATE.md) e [DECISIONS](../DECISIONS.md), conforme §6.

**Nenhum arquivo fora de `apps/frontend/` e de `docs/migration/` deve mudar.** Nenhuma migration, nenhum schema, nenhuma rota, nenhum contrato público, nenhum arquivo de `apps/bff/`, `apps/ai-orchestrator/`, `apps/scheduling-service/`, `apps/evolution-go/` ou `scripts/`.

## Escopo obrigatório

### 1. A régua: medir o alvo que recebe o toque

A medição de toque passa a avaliar, para cada controle interativo, a **região que ativa esse controle** — o que a WCAG 2.5.8 chama de alvo —, e não a caixa de um elemento que está fora do caminho do ponteiro.

Regras, todas obrigatórias:

- **A regra é geométrica e derivada do DOM, não uma lista de casos.** Um controle nativo visualmente escondido cujo acionamento vem de um `<label>` associado (por aninhamento ou por `for`) é medido pela região clicável desse label. Nenhuma regra nova pode ser "este seletor é exceção".
- **Nada pode ser silenciosamente descartado.** Todo controle que o seletor coleta termina em uma de duas situações: medido, ou isento por um motivo nomeado no próprio código. A contagem de controles classificados por rota é reportada no resultado, e o teste falha se ela for zero — uma régua que parou de medir precisa ficar vermelha, não verde.
- **Os limiares não mudam.** `TOUCH_TARGET_AA` continua 24, `TOUCH_TARGET_COMFORTABLE` continua 44 e continua sendo relatado sem falhar, e a tolerância de overflow não é alterada.
- **A isenção de link embutido em frase continua como está.** Ela vem da própria 2.5.8 e não é parte deste Goal.
- **A asserção de exceção obsoleta continua existindo e continua estrita**, mesmo com a lista vazia.
- **Nenhuma rota, projeto de largura ou teste existente é removido, renomeado, pulado ou condicionado.**

### 2. A correção de produto

Todo controle que a régua corrigida ainda acusar abaixo de 24px nas sete rotas públicas, nas larguras `mobile-360` e `mobile-390`, é corrigido neste Goal — a começar pelo link isolado de `/link-expirado`.

- A correção é do **alvo**: altura e largura efetivas da região clicável. Aumentar a área de toque sem mudar copy, rota, hierarquia visual nem tokens.
- **Acolchoar o input escondido não é correção** e é blocker de review.
- Se algum controle não puder chegar a 24px sem mexer na direção visual aprovada, o Developer **para, relata e não inventa exceção**: a decisão é do Tech Lead. O Goal não fecha com a lista de exceções não vazia.
- Qualquer mudança visível é declarada no relatório como o que ela é — **conferência humana de fidelidade**, que nenhum teste decide.

### 3. A lista de exceções termina vazia, e a régua prova que ainda morde

- `KNOWN_SMALL_TARGETS` termina **vazia**, com o comentário do bloco atualizado para explicar por que ela existe e por que está vazia. O mecanismo permanece.
- **Controle negativo, demonstrado com saída real e revertido em seguida** — no mínimo três mutações temporárias, cada uma isolada:
  1. reduzir a área clicável do `<label class="check">` abaixo de 24px deixa o gate vermelho nomeando o controle;
  2. desfazer a correção do link de `/link-expirado` deixa o gate vermelho com a medida real;
  3. um controle sem label associado e abaixo de 24px deixa o gate vermelho.
- Nenhuma dessas mutações pode sobrar na árvore final.

### 4. O que este Goal não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não estender o gate a tela autenticada.** A-02 continua aberto e classificado como `PENDENCIA-POS-MVP`; dar sessão real ao gate é decisão de escopo própria.
- **Não corrigir nenhum outro achado** de A-02 a A-19, e não mexer em G-32, U-03, M4 nem no deploy.
- **Não enfraquecer gate nenhum**: nem limiar, nem rota, nem largura, nem checagem de `validate:core`, `validate:integration`, `validate:ui` ou `audit:static`.
- **Não tocar backend, contrato público, migration, schema ou `scripts/`.**
- **Não acrescentar rota, tela, feature, campo ou dependência nova.**
- **Não fabricar sessão**, mock de API ou fixture de produto para o gate renderizado.
- **Não afirmar fidelidade visual provada por teste** em lugar nenhum.
- **Não reabrir, reverter nem reexecutar aceite anterior**, incluindo o do Goal030 e o texto histórico de A-01.
- **Nenhum `eslint-disable` novo sem justificativa escrita na linha; nenhum teste pulado em silêncio.**

### 5. Prova

- `validate:ui` roda verde nas cinco larguras sobre a árvore final, com a lista de exceções vazia, e o resultado real por largura entra no relatório.
- As três mutações de controle negativo são executadas, com a saída real de cada uma no relatório, e revertidas.
- A medida real, antes e depois, de cada alvo corrigido, por largura mobile.
- A contagem de controles classificados por rota que a régua passou a reportar.
- `validate:core` roda verde sobre a árvore final.

### 6. Documentação

Escrita **depois** da última mudança de árvore:

- [FINAL_AUDIT](../FINAL_AUDIT.md): seção nova e datada de atualização pelo Goal031, **sem reescrever** o registro original de A-01 — que continua sendo a medida honesta feita com a régua da época. A seção nova traz: o estado de A-01, a régua que passou a valer e por quê, as medidas novas por largura, e o **veredito recontado**. A frase "pendências zero de MVP" só pode aparecer se a contagem de `BLOQUEADOR-MVP` for realmente zero.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): a linha **G-31** ganha o estado de A-01 depois deste Goal; A-02 continua aberto e escrito como tal.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o que a medição de toque passa a medir, e o que ela continua não medindo — tela autenticada e fidelidade visual.
- [CURRENT_STATE](../CURRENT_STATE.md): o que mudou no frontend público.
- [DECISIONS](../DECISIONS.md): **D-047**, no formato das anteriores, cobrindo o alvo efetivo como unidade de medida do gate, por que o controle nativo escondido não é o alvo, e o estado de A-01 no veredito do MVP.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. A medição de toque de `apps/frontend/e2e/viewport-matrix.spec.ts` avalia a região que ativa o controle; um controle nativo escondido associado a um `<label>` é medido pelo label.
2. A regra nova é geométrica e derivada do DOM: nenhum seletor, classe ou rota aparece como caso especial dentro dela.
3. Todo controle coletado pelo seletor termina medido ou isento com motivo nomeado no código; nenhum é descartado em silêncio.
4. O teste reporta a contagem de controles classificados por rota e fica **vermelho** se essa contagem for zero.
5. `TOUCH_TARGET_AA` continua 24, `TOUCH_TARGET_COMFORTABLE` continua 44 e continua apenas reportado, e a tolerância de overflow não mudou.
6. A isenção de link embutido em frase continua com o mesmo critério de antes.
7. A asserção de exceção obsoleta continua no arquivo e continua estrita.
8. `KNOWN_SMALL_TARGETS` está **vazia** na árvore final, e nenhuma entrada nova foi acrescentada em nenhum momento.
9. O link `Voltar para entrar` de `/link-expirado` tem alvo efetivo de no mínimo 24×24 em `mobile-360` e `mobile-390`, com a medida real no relatório.
10. Nenhum controle das sete rotas públicas fica abaixo de 24px nas duas larguras mobile pela régua corrigida.
11. Nenhuma correção foi feita acolchoando input escondido, e nenhum input nativo passou a ser visível por acidente.
12. Os três controles negativos foram executados com saída real no relatório e revertidos; a árvore final não contém nenhuma das mutações.
13. `validate:ui` exit 0 nas cinco larguras sobre a árvore final, com resultado por largura no relatório.
14. `validate:core` exit 0 sobre a árvore final.
15. Nenhuma rota, projeto de largura, teste ou asserção existente foi removido, renomeado, pulado ou condicionado; `accessibility.spec.ts` não teve regra afrouxada.
16. Nenhum arquivo fora de `apps/frontend/` e `docs/migration/` foi modificado; nenhuma migration, schema, rota ou contrato público mudou.
17. Nenhuma sessão fabricada, mock de API ou fixture de produto entrou no gate renderizado, e nenhuma rota autenticada foi acrescentada a `routes.ts`.
18. Nenhum outro achado de A-02 a A-19 foi corrigido ou reclassificado por este Goal.
19. [FINAL_AUDIT](../FINAL_AUDIT.md) tem seção nova e datada com o estado de A-01, a régua nova, as medidas novas e o veredito recontado; o registro original de A-01 está preservado.
20. A contagem de `BLOQUEADOR-MVP` no veredito corresponde ao que a execução desta rodada sustenta, e "pendências zero de MVP" só aparece se ela for zero.
21. Nenhuma frase de documento afirma fidelidade visual provada por teste; mudança visível está declarada como conferência humana.
22. [DECISIONS](../DECISIONS.md) tem **D-047** no formato das anteriores, sem quebrar o bloco de nenhuma decisão anterior, e a documentação de §6 foi escrita **depois** da última mudança de árvore.
23. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha, e nenhum teste foi pulado em silêncio.
24. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum comando `pnpm`/`corepack` foi invocado.

## Entrega

Relatório do Developer com: a regra de alvo efetivo em uma frase e o trecho que a implementa; as medidas antes e depois de cada alvo tocado, por largura mobile; a contagem de controles classificados por rota; a saída real das três mutações de controle negativo, com a confirmação de que foram revertidas; o resultado e o tempo medido de `validate:ui` e `validate:core` sobre a árvore final; a lista de mudanças visíveis que precisam de conferência humana de fidelidade; a contagem recontada de `BLOQUEADOR-MVP`; e o que ficou declaradamente fora — com **A-02** nomeado. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, a execução real do gate e a força de cada evidência.
