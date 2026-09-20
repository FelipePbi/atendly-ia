# Goal 030 — Auditoria final do MVP

**Status: READY.** Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Preparado em 2026-09-20 pelo Tech Lead Agent após [Goal029 ACCEPTED](../reviews/029-review.md) e integração do seu commit de fechamento. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_HIGH

A linha 030 existe desde a v46 do [MASTER_PLAN](../MASTER_PLAN.md#histórico-de-planejamento) (era 027 até a v47, 028 até a v48 e 029 até a v49). A **v51 não a renumerou, não a dividiu e não mudou seu objetivo**: apenas nomeou, no campo de resultado, o instrumento que já estava implícito nele — um percurso único de produto exercitado ponta a ponta contra serviços e bancos reais. Nenhum ID foi removido e nenhum aceite foi reaberto.

## Baseline aceita

Baseline aceita: `b64936a2e692605d523b5edf449e2b9d1a91e2d1`

Goal anterior: 029 — Timezone único do negócio

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal029 já integrado em `main` (origem `cc08fbb693838488d4dd84f441d77ed43146465b`), incluindo a implementação das três rodadas, o [review029](../reviews/029-review.md) e a documentação de fechamento. O commit `777dde78`, posterior a ele, corrige apenas o cabeçalho de status do documento do próprio Goal029 e não toca código. Partir desta baseline; não reabrir diff aceito.

## Objetivo e posição

Dizer, com evidência executável, **o que do MVP está pronto, o que não está e o que ninguém provou** — e dizer isso de forma que um humano possa conferir cada afirmação sem reler a migração inteira.

Vinte e nove Goals fecharam fatias de produto, cada uma com prova própria. O que nunca foi exercitado é a **composição delas**: nenhum artefato hoje percorre um negócio único do cadastro até a exclusão da conta passando por onboarding, catálogo, cliente, agendamento, conversa, lembrete, notificação, configurações e retenção, contra os três bancos reais. As suítes de integração existentes cobrem domínio por domínio; os vinte e dois ensaios em `scripts/` cobrem migration por migration. Composição não é a soma disso.

Duas evidências recentes definem o rigor exigido aqui, e as duas vêm de gates que estavam verdes:

- **Diff028:** o `schema.prisma` da IA e do Scheduling divergia do que o próprio histórico de migrations cria (6 e 25 itens), e a divergência sobreviveu a dezoito ensaios porque nenhum deles conferia a declaração contra o banco.
- **Diff029:** remover a reconciliação de qualquer uma das duas rotas de leitura deixava typecheck, lint, `validate:core` e `validate:integration` **todos verdes**; e o defeito que ligava a agenda de quem nunca a escolheu era invisível porque **todas as fixtures semeavam a linha que o defeito criava**.

A conclusão que este Goal precisa levar a sério: **verde de gate não é evidência de conformidade quando ninguém montou o caso que falharia.** Uma auditoria que só relê documento repete exatamente o erro que ela deveria encontrar.

Este é o último Goal do MVP no roadmap vigente. Ele **audita e não corrige**.

## Dependências e contexto mínimo

- Goals 001 a 029 ACCEPTED e integrados. Partir da baseline acima; conferir o diff inicial e preservar alterações externas/preexistentes, inclusive os artefatos Graphify.
- [VALIDATION_GATE](../VALIDATION_GATE.md): comandos canônicos, provisionamento do PostgreSQL descartável, exigência de pgvector, guards de destino descartável, leitura dos resultados e a seção de limites conhecidos — que é o inventário do que os gates **não** provam.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): G-01 a G-35, com o estado declarado de cada um e as incertezas isoladas (**U-01**…).
- [DATA_MIGRATION](../DATA_MIGRATION.md): a tabela de gates **M0–M6** e a tabela de migrations por Goal.
- [CURRENT_STATE](../CURRENT_STATE.md) e [DECISIONS](../DECISIONS.md): o que o código faz hoje e por quê — **D-042**, **D-043**, **D-044** e **D-045** são as quatro decisões mais recentes e valem integralmente.
- `apps/bff/PUBLIC_API_V1.md`: o contrato público vigente, já reduzido três vezes.
- [AGENTS.md](../../../AGENTS.md): os guardrails inegociáveis de produto. Divergência entre o produto implementado e um guardrail é achado, não interpretação livre.
- **Product Vault:** consultar de forma dirigida (1–3 notas por dúvida) quando precisar confirmar **qual é a regra de produto** antes de chamar algo de conformidade ou de desvio. Não abrir o vault inteiro; não usar o Claude Design como fonte de regra de backend.

### Fatos já confirmados na baseline, sem precisar redescobrir

O planejamento verificou o que segue na árvore de `b64936a2`. Não gastar rodada redescobrindo:

- **`validate:integration` tem 32 passos** declarados em `scripts/validate-integration.mjs`, do `generate:bff-prisma-client` ao `test:evolution-go-webhook-outbox`, passando por 22 ensaios `rehearse:*` — o mais recente `rehearse:goal029-timezone-reconciliation`. O padrão de passo nomeado, guard de destino e `exit 2` está estabelecido e deve ser reusado sem reinvenção.
- **`validate:core` não abre conexão de banco em nenhum passo**, e `npm run smoke:final-audit` (`scripts/final-production-audit.mjs`) são **28 checagens estáticas**, 27 `pass` mais o `skip` declarado `production_health`. Auditoria estática lê texto: ela não sobe serviço e não chama endereço.
- **`validate:ui` é `cd apps/frontend && npm run test:ui`**, nas larguras 360, 390, 768, 1024 e 1440.
- **As suítes de integração do BFF são 41 arquivos em `apps/bff/tests/`**, organizadas por Goal e por domínio; o Scheduling e a IA têm as suas. Elas cobrem domínio por domínio, com dublê nas fronteiras externas.
- **Os ensaios com serviço real já existem como padrão**: `rehearse:goal028-release-migrations`, `rehearse:goal028-restore` e `rehearse:goal029-timezone-reconciliation` sobem serviço, emitem sessão pelo caminho de produção e conferem lendo o banco com `pg` puro. Copiar essa forma; não inventar outra.
- **Ciclo de vida da conta existe e é recuperável em 7 dias** (Goal025), e a purga por negócio da IA tem passo próprio no gate. A auditoria pode e deve chegar até o fim desse ciclo.
- **`packages/contracts` foi removido no Goal026** (**D-042**) e **não volta**. **G-32** (parsers duplicados entre frontend, BFF e Scheduling) continua aberto e **sem Goal atribuído** — ele é achado a classificar, não trabalho a fazer aqui.
- **`CalendarSettings.source` está travado em `ATENDLY`** por `CHECK` desde o Goal027 (**D-043**), e o fuso do negócio tem dono único desde o Goal029 (**D-045**).
- **Resíduos declarados pelo review029**, que este Goal fecha em §4: os guards de `scripts/goal029-timezone-reconciliation-rehearsal.mjs` não têm teste permanente em `scripts/tests/`, e nenhuma das três fixtures daquele ensaio exercita **réplica ausente** contra banco real.

## Pontos de implementação

- `scripts/goal030-mvp-journey-rehearsal.mjs` (novo): o percurso único de produto.
- `scripts/validate-integration.mjs`: o passo nomeado novo, no fim da ordem existente.
- `scripts/tests/`: teste permanente dos guards do ensaio novo **e** dos guards do ensaio do Goal029.
- `docs/migration/FINAL_AUDIT.md` (novo): o relatório de conformidade, o inventário de evidência e a lista de achados classificados.
- `docs/migration/`: [GAP_ANALYSIS](../GAP_ANALYSIS.md), [VALIDATION_GATE](../VALIDATION_GATE.md), [CURRENT_STATE](../CURRENT_STATE.md), [DATA_MIGRATION](../DATA_MIGRATION.md) e [DECISIONS](../DECISIONS.md), conforme §8.
- `apps/bff/tests/`, `apps/scheduling-service/tests/`: **apenas** quando um achado precisar de reprodução executável permanente.

**Nenhuma migration nova é esperada em nenhum serviço, e nenhuma migration existente pode ser editada, renomeada ou removida.** Nenhum arquivo de `apps/*/src/` deve mudar por este Goal; se alguma mudança de código de produção parecer necessária, ela é **achado**, não correção — ver §5.

## Escopo obrigatório

### 1. Percurso único do produto, ponta a ponta contra serviços e bancos reais

Um ensaio novo, `scripts/goal030-mvp-journey-rehearsal.mjs`, com passo nomeado `rehearse:goal030-mvp-journey` em `scripts/validate-integration.mjs` (32 → 33 passos), que sobe os serviços próprios reais contra bancos descartáveis e conduz **um negócio único** por todo o caminho do MVP, na ordem em que um cliente real o percorre:

1. cadastro e sessão emitida pelo caminho de produção (cookie e CSRF reais, não atalho de teste);
2. onboarding nos quatro blocos até `POST /v1/onboarding/complete`, incluindo a recusa por mínimo faltando **antes** de completar;
3. catálogo com pelo menos um serviço operacional;
4. cliente cadastrado como pessoa, com responsável e proveniência;
5. agendamento confirmado, com a ocupação refletida na leitura da agenda;
6. mensagem do contato entrando pelo transporte durável e aparecendo na conversa, com categoria/privacidade e controle humano;
7. lembrete programado conforme a regra vigente do negócio;
8. notificação persistida na central, com nível e leitura;
9. alteração de configuração do negócio que atravessa serviço — o fuso, reusando o mecanismo do Goal029 sem duplicar o ensaio dele;
10. retenção declarada e purga de conteúdo aplicada;
11. exclusão de conta e o ciclo recuperável até o fim.

Regras do percurso, todas obrigatórias:

- **Prova por leitura direta das bases**, com `pg` puro, além da resposta HTTP. Resposta `200` não é evidência de persistência — foi exatamente assim que o defeito da rodada 2 do Goal029 passou.
- **Um tenant só atravessa o percurso inteiro.** Etapa que semeia estado direto no banco para pular a etapa anterior invalida a composição, que é o objeto desta auditoria. Semear é permitido apenas para o que é entrada externa (mensagem chegando, relógio), nunca para o que o percurso anterior deveria ter produzido.
- **Fronteira externa é dublê declarado; serviço próprio é real.** Nenhuma chamada a WhatsApp real, provedor de LLM, e-mail ou qualquer endereço fora de loopback. Etapa que dependa de fronteira externa e não possa ser exercitada honestamente com dublê é **limite declarado**, escrito como tal — nunca simulada a ponto de parecer prova.
- **Controle negativo executável:** quebrar um elo do percurso derruba o ensaio com `exit 1` e mensagem própria. O Developer precisa demonstrar isso e dizer qual elo quebrou.
- **Guards de destino:** loopback e nome de banco descartável, `exit 2` com mensagem própria em qualquer outro destino, e nenhuma credencial impressa.
- **Idempotência de execução:** rodar o ensaio duas vezes seguidas produz o mesmo resultado, sem depender de resíduo da execução anterior.

### 2. Conferência de conformidade por critério, com evidência apontável

Em `docs/migration/FINAL_AUDIT.md`, um inventário em que **cada linha é um critério de MVP** — todos os **G-01 a G-35**, todos os gates **M0 a M6**, todas as incertezas **U-**, e os guardrails de produto do [AGENTS.md](../../../AGENTS.md) que sejam verificáveis em código — com quatro colunas:

- **Estado**: fechado / fechado em parte / aberto / não aplicável ao MVP;
- **Evidência apontável**: `arquivo:linha`, nome exato de teste ou nome exato de passo de gate. Link para documento **não** é evidência;
- **Força da evidência**, em vocabulário fechado: `EXECUTADO` (algum gate falharia se o fato deixasse de valer), `INSPECIONADO` (conferido na árvore nesta auditoria, sem gate que proteja) ou `DECLARADO` (só existe afirmação em documento);
- **Achado**, quando houver, referenciando o identificador de §6.

Duas exigências que dão sentido ao inventário:

- **Toda linha `EXECUTADO` precisa nomear o gate que falharia.** Se o Developer não souber dizer qual passo ficaria vermelho, a força correta é `INSPECIONADO`, não `EXECUTADO`.
- **Toda linha `DECLARADO` é automaticamente um achado**, no mínimo como pendência. Essa é a classe que produziu os defeitos do 028 e do 029.

### 3. Conferência da interface: o que o gate renderizado decide e o que não decide

`validate:ui` roda nas cinco larguras e o resultado real entra no relatório, por largura. O relatório precisa separar, sem ambiguidade:

- **o que o gate decide**: overflow horizontal, alvo de toque (mínimo AA de 24px), contraste real computado, foco visível e `prefers-reduced-motion`;
- **o que o gate não decide**: **fidelidade visual à referência aprovada** em `docs/design-reference/claude-design/`, que continua sendo conferência humana.

Nenhuma frase do relatório pode afirmar fidelidade visual provada por teste. Divergência de fidelidade observada por inspeção entra como achado com força `INSPECIONADO`.

### 4. Dívida de ferramental que o 029 deixou declarada

São as duas únicas construções de ferramental autorizadas além do ensaio de §1, e elas existem porque o próprio review029 as declarou como redundância faltante:

1. Teste permanente em `scripts/tests/` para os guards de `scripts/goal029-timezone-reconciliation-rehearsal.mjs` e do ensaio novo de §1 — destino não-loopback recusado, nome não descartável recusado, `exit 2`, nenhuma credencial impressa —, no formato dos testes de gate que já existem para os ensaios do Goal028.
2. Um caso de **réplica ausente** no ensaio do Goal029: tenant sem `CalendarSettings` que passa pelas duas rotas de leitura e continua sem `CalendarSettings` depois. Isso **acrescenta** cobertura ao passo existente; não pode alterar o que ele já prova nem o seu nome.

### 5. O que a auditoria não pode fazer

Inegociável, e a violação de qualquer item é blocker de review:

- **Não corrigir defeito de produto.** Achado vira achado, com reprodução; correção é Goal próprio, decidido no fechamento deste.
- **Não mudar contrato público nem interno**: nenhuma rota, nenhum campo, nenhum código de erro, nenhum escopo.
- **Não acrescentar feature, tela, campo de banco ou migration.**
- **Não remover, renomear nem enfraquecer passo existente** de `validate:core`, `validate:integration` ou `validate:ui` — inclusive para "fazer o percurso passar". Passo que ficar vermelho é achado.
- **Não reabrir, reverter nem reexecutar aceite anterior.**
- **Não ressuscitar `packages/contracts`** nem criar pacote compartilhado de contrato (**D-042**), e não mover parser entre apps a pretexto de **G-32**.
- **Não declarar conformidade que a execução não sustenta.** "Provavelmente funciona" é `DECLARADO`.

### 6. Achados: classificação e reprodução

Cada achado recebe identificador estável `A-NN` e três campos: **classificação** (`BLOQUEADOR-MVP`, `PENDENCIA-POS-MVP` ou `LIMITE-DECLARADO`), **reprodução** e **impacto de produto em uma frase**.

- Achado `BLOQUEADOR-MVP` **precisa** de reprodução executável: teste novo ou etapa de ensaio que falhe hoje, ou o comando exato e a saída real que o demonstram. Se o Developer não conseguir reproduzir, ele é `PENDENCIA-POS-MVP` com o motivo escrito.
- Teste novo escrito para reproduzir um achado **pode** ficar vermelho, desde que esteja declarado como reprodução de achado e não entre no caminho verde do gate. Ele não pode ser marcado como pulado em silêncio.
- **G-32**, **U-03**, **M4** e o deploy real entram obrigatoriamente na lista, com a classificação que a evidência sustentar.

O veredito final é uma frase única e explícita: o MVP está conforme, ou não está, com a contagem de `BLOQUEADOR-MVP`. Zero pendência de MVP só pode ser afirmado se a contagem for zero.

### 7. Prova

- `rehearse:goal030-mvp-journey` roda verde contra PostgreSQL real, dentro de `validate:integration`, e reporta contagens por etapa do percurso.
- O controle negativo derruba o ensaio.
- `validate:core`, `validate:integration` e `validate:ui` rodam **sobre a árvore final**, e o relatório traz o resultado real e o tempo medido de cada um.
- Os testes de guard de §4 rodam em `npm run test:gate`.

### 8. Documentação

Escrita **depois** da última mudança de árvore:

- `docs/migration/FINAL_AUDIT.md` novo, com o inventário de §2, a seção de interface de §3, os achados de §6 e o veredito.
- [VALIDATION_GATE](../VALIDATION_GATE.md): o passo novo, a contagem 33, o que o percurso prova e **o que ele não prova**.
- [GAP_ANALYSIS](../GAP_ANALYSIS.md): estado de cada gap conferido nesta auditoria, sem reescrever histórico.
- [DATA_MIGRATION](../DATA_MIGRATION.md): estado final de **M0–M6**.
- [CURRENT_STATE](../CURRENT_STATE.md): o que a composição revelou sobre o produto vigente.
- [DECISIONS](../DECISIONS.md): **D-046**, no formato das anteriores, cobrindo o veredito de conformidade, o limite do que a auditoria prova e a classificação das pendências.

## Testes e critérios de aceite

Cada critério é verificável no diff ou na execução. "Passou o lint" não é critério de produto.

1. Existe o passo `rehearse:goal030-mvp-journey` em `scripts/validate-integration.mjs`, e `validate:integration` passa de 32 para 33 passos, verde contra PostgreSQL real.
2. O percurso é de **um tenant único** e cobre as onze etapas de §1 na ordem declarada; etapa não exercitada está nomeada como limite, não omitida.
3. Cada etapa do percurso é provada por **leitura direta do banco** do serviço dono do dado, além da resposta HTTP.
4. Nenhuma etapa semeia no banco o estado que a etapa anterior do percurso deveria ter produzido; o que é semeado é entrada externa, e está declarado.
5. A sessão do percurso é emitida pelo caminho de produção, com cookie e CSRF reais.
6. O ensaio faz controle negativo: quebrar um elo declarado derruba a execução com `exit 1`, demonstrado pelo Developer com a saída real.
7. O ensaio recusa destino que não seja loopback com nome descartável, com `exit 2` e mensagem própria, e não imprime credencial.
8. Rodar o ensaio duas vezes seguidas produz o mesmo resultado.
9. Nenhuma chamada a WhatsApp real, provedor de LLM, e-mail ou endereço fora de loopback é feita por este Goal.
10. `docs/migration/FINAL_AUDIT.md` existe e traz todas as linhas de **G-01 a G-35**, **M0 a M6** e as incertezas **U-**, cada uma com estado, evidência apontável e força em vocabulário fechado.
11. Toda linha `EXECUTADO` nomeia o passo de gate ou o teste que falharia se o fato deixasse de valer.
12. Toda linha `DECLARADO` tem achado correspondente em §6.
13. Nenhuma evidência do inventário é um link para documento de migração: é `arquivo:linha`, nome de teste ou nome de passo de gate.
14. `validate:ui` foi executado nas cinco larguras e o resultado real por largura está no relatório.
15. O relatório separa o que o gate renderizado decide do que continua sendo conferência humana, e **não** afirma fidelidade visual provada por teste.
16. Existe teste em `scripts/tests/` cobrindo os guards do ensaio novo e os do ensaio do Goal029, executado por `npm run test:gate`.
17. O passo `rehearse:goal029-timezone-reconciliation` ganhou o caso de réplica ausente, continua com o mesmo nome e continua provando tudo o que provava.
18. Cada achado tem identificador `A-NN`, classificação do vocabulário fechado, reprodução e impacto de produto em uma frase; todo `BLOQUEADOR-MVP` tem reprodução executável ou foi rebaixado com motivo escrito.
19. **G-32**, **U-03**, **M4** e o deploy real estão na lista de achados, classificados.
20. O veredito final é explícito, com a contagem de `BLOQUEADOR-MVP`; "pendências zero de MVP" só aparece se a contagem for zero.
21. Nenhum arquivo de `apps/*/src/` foi modificado; nenhuma rota, campo, escopo ou código de erro mudou; `apps/bff/PUBLIC_API_V1.md` não foi alterado.
22. Nenhuma migration foi criada, editada, renomeada ou removida em nenhum serviço, e nenhum `schema.prisma` mudou.
23. Nenhum passo existente de `validate:core`/`validate:integration`/`validate:ui` foi removido, renomeado ou enfraquecido, e nenhuma checagem de `scripts/final-production-audit.mjs` foi afrouxada; teste novo criado como reprodução de achado está declarado como tal e não é pulado em silêncio.
24. `packages/contracts` não voltou, nenhum pacote compartilhado de contrato foi criado e nenhum parser foi movido entre apps.
25. Nenhum `eslint-disable` novo entrou sem justificativa escrita na linha.
26. Os gates declarados foram executados **sobre a árvore final** e o relatório traz o resultado real e o tempo medido de cada um.
27. `git status --porcelain` não lista artefato não rastreado não declarado, e nenhum comando `pnpm`/`corepack` foi invocado.
28. [DECISIONS](../DECISIONS.md) tem **D-046** registrada no formato das anteriores, sem quebrar o bloco de nenhuma decisão anterior, e a documentação de §8 foi escrita **depois** da última mudança de árvore.

## Entrega

Relatório do Developer com: o passo novo do gate com nome exato e tempo medido; as contagens reportadas pelo percurso, etapa por etapa; o elo quebrado no controle negativo e a saída real que ele produziu; a lista de achados com classificação e contagem por classe; o veredito de conformidade em uma frase; as etapas do percurso que só puderam ser exercitadas com dublê de fronteira externa, e por quê; a lista de arquivos tocados fora dos pontos de implementação com justificativa; e o que ficou declaradamente fora — com **G-32**, **U-03**, **M4** e o deploy real nomeados. Nenhuma proposta vira decisão por estar no relatório: o Tech Lead inspeciona o diff, os testes reais e a força declarada de cada evidência.
