# Goal 111 — Os registros e a documentação passam a dizer Avenly

**Status: ACCEPTED.** Preparado em 2026-10-04 pelo Tech Lead Agent após [Goal102 ACCEPTED](../reviews/102-review.md) e a integração do seu commit de fechamento. Executor: Developer Agent. Reviewer: Tech Lead Agent, conforme [AGENT_ROLES](../AGENT_ROLES.md) e D-018. Este documento autoriza a implementação; nada fora dele está autorizado.

Developer execution profile: OPUS_MEDIUM

Sem linha de quadros do protótipo: nenhuma tela muda, e `docs/design-reference/` fica fora do escopo (o Goal102 já trocou o nome ali).

Registros de controle editáveis: docs/migration/goals/, docs/migration/reviews/, docs/migration/MIGRATION_STATUS.md

Linha acrescentada pelo supervisor em 2026-10-04, depois da parada da R1 por `GOAL_DOC_MUTATED`: o escopo (§3, §4) troca o nome no texto desses registros, e a política do harness só aceita a troca com esta declaração. O documento e os reviews deste Goal, os status, as baselines e a tabela de status continuam fora do alcance do Developer.

Linha do [MASTER_PLAN](../MASTER_PLAN.md) criada na v134 pela divisão do 102, **mantida com o mesmo ID, título e posição na v135**. É a parte documental do pedido do operador de 2026-10-02.

## Baseline aceita

Baseline aceita: `9fe209f573ffcf8b31e5e2015678282aad50d6e9`

Goal anterior: 102 — O produto passa a se chamar Avenly nas telas, no código e no protótipo

Status anterior: ACCEPTED

O SHA identifica o commit de fechamento do Goal102 já integrado em `main` (origem `66df231700d3649c625d6a5dcdce6e0e7812f019`). Foram **duas rodadas**, com 7 e 0 blockers. **D-122** foi aceita, com os cinco pontos de julgamento como propostos. A virada de status do documento do Goal102 para `ACCEPTED` entrou no commit de fechamento. Partir desta baseline; não reabrir diff aceito.

A worktree parte do commit de planejamento que traz este documento, posterior à baseline. Esse commit é a **base imediata** da implementação. O relatório registra o SHA dele, e toda prova de "linha a linha" deste Goal compara com ele.

Este Goal não muda código. Não há contagem de suíte a recontar. A recontagem obrigatória é a do inventário de entrada (ver "Validação e ordem").

## Objetivo

O operador pediu em 2026-10-02 que o produto passe a se chamar **Avenly**, porque o nome Atendly já é usado por outra empresa. Os Goals 109, 110 e 102 trocaram o nome em tudo que roda, no protótipo e nos documentos de instrução. Sobrou a documentação em `docs/`, fora de `docs/design-reference/`:

- o vault de produto (`docs/product-vault/`);
- `docs/architecture/`, `docs/landing-page/` e os `.md` soltos de `docs/`;
- os registros da migração em `docs/migration/`: Goals, reviews, DECISIONS, CURRENT_STATE, VALIDATION_GATE, FINAL_AUDIT, DATA_MIGRATION, MASTER_PLAN, MIGRATION_STATUS, QA_LOCAL_REVIEW e os demais.

Este Goal troca o nome nesses documentos **sem apagar o sentido dos registros**. Os registros citam de propósito valores e nomes antigos que continuam valendo como legado. Uma troca cega faria D-120 dizer "`avenly_session`, com leitura de `avenly_session`", e faria o review do Goal027 citar um valor que nunca foi gravado.

## O que a evidência desta passada mostra

Conferido na baseline `9fe209f`:

1. `git grep -l -i atendly -- docs ':!docs/design-reference'` devolve **192** arquivos, com **1541** linhas e **2206** ocorrências:
   - `docs/product-vault/`: 34 arquivos, 151 linhas;
   - `docs/architecture/README.md` (1 linha), `docs/landing-page/BRIEF_PROTOTIPO.md` (3 linhas), `docs/README.md` (1), `docs/PLANO_REFATORACAO.md` (2) e `docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md` (9);
   - `docs/migration/goals/`: 64 arquivos, 355 linhas;
   - `docs/migration/reviews/`: 75 arquivos, 211 linhas;
   - os 14 arquivos da raiz de `docs/migration/` com o nome: 808 linhas (VALIDATION_GATE 227, DECISIONS 180, CURRENT_STATE 137, FINAL_AUDIT 110, DATA_MIGRATION 38, MIGRATION_STATUS 38, MASTER_PLAN 35, QA_LOCAL_REVIEW 25 e os demais com 5 ou menos).
2. `git ls-files | grep -i atendly` devolve os dois diretórios de migration do Scheduling, os dois `.zip` do protótipo e `docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md`. D-122 deixou o nome desse `.md` para este Goal. Nenhum link relativo aponta para ele. Os registros só o citam como pendência ou como saída de `git ls-files`.
3. **Âncoras.** `DATA_MIGRATION.md` §14 tem o título "Migração da fonte da agenda para ATENDLY (Goal027)". Quatro links apontam para a âncora `#14-migração-da-fonte-da-agenda-para-atendly-goal027` (dois em DATA_MIGRATION e dois em VALIDATION_GATE). Os títulos do vault com o nome (`00-HOME.md`, `README.md`, `01-Glossario.md` "## Atendly" e "## Agenda Atendly", `05-WhatsApp.md`) e os de `docs/README.md`, `docs/PLANO_REFATORACAO.md` e `docs/migration/README.md` também mudam de âncora se o texto mudar.
4. **Vault.** As notas têm `tags: [atendly, …]` e `aliases: [… Atendly]` no frontmatter. Nenhum wikilink `[[…]]` cita o nome.
5. **Nenhum código lê esses documentos.** `scripts/`, `apps/`, `packages/` e `.github/` só os citam em comentário. `visual:compare` lê `docs/design-reference/`, que fica fora. Por isso este Goal não roda gate de app.
6. Os caminhos que o Goal102 renomeou (`atendly*.css`, `integrations/atendly/`, `atendly-availability.ts`, `atendly-icon.svg`, `Atendly.dc.html` e outros) aparecem nos registros com o nome antigo. Hoje esses caminhos não existem mais.
7. O nome da pasta do projeto (`atendly-ia`, em caminhos como `E:\Projetos\atendly-ia\.ai-worktrees\…`) fica, por decisão do operador. Os nomes de ambiente de D-122 (viii) ficam até o supervisor ou o operador trocarem o ambiente.

## Regra da troca

O texto em escopo troca `Atendly`, `atendly` e `ATENDLY` por `Avenly`, `avenly` e `AVENLY`, na mesma caixa, também dentro de caminhos e identificadores. A concordância não muda ("a Atendly" vira "a Avenly"). **Só a palavra muda:** nenhuma outra palavra, pontuação, número ou quebra de linha da frase muda.

O nome antigo **fica** só nas classes abaixo. A ordem é a de precedência: a primeira classe que cabe decide.

- **(F) Registro da própria troca.** Nos registros da família da troca, o nome antigo é o objeto do registro. A família é: os documentos dos Goals 102, 109 e 110; os reviews 102, 109 e 110; D-120, D-121, D-122 e D-123 em DECISIONS; as seções e linhas desses Goals em CURRENT_STATE, VALIDATION_GATE, DATA_MIGRATION (§23), MASTER_PLAN e MIGRATION_STATUS; a linha do 111 nesses dois últimos; e as entradas do histórico de planejamento do MASTER_PLAN que tratam da troca de nome (da v127 em diante). Ali, o padrão é **ficar**. Troca só a prosa que usa o nome como nome do produto sem falar da troca (por exemplo, "a agenda da Atendly"). Toda frase que diz "X passa a Y", que cita o pedido do operador, que dá um comando de inventário (`git grep -i atendly …`) ou que conta ocorrências do nome antigo fica igual.
- **(L) Valor ou nome legado citado como tal.** Fica todo token em formatação de código (crase ou bloco) que existe hoje, com o nome antigo, em código, migration ou configuração fora de `docs/`. A prova é `git grep -F '<token>' -- ':!docs' ':!graphify-out'` na base imediata. Isso cobre, entre outros:
  - o valor `ATENDLY` (enum `CalendarSource`/`HumanControlSource` e `calendarSourceSchema`, hoje aceito só como entrada legada) e `"ATENDLY"`;
  - `atendly_session`, `atendly_csrf`, `atendly:internal:v1`, `atendly:csrf:` e `CalendarSettings_source_atendly_check`;
  - as variáveis `ATENDLY_*` e as chaves `atendly:` do `localStorage`, inclusive `atendly:brand-signature-*`;
  - os diretórios `20260828233000_add_atendly_calendar_provider` e `20260919120000_goal027_calendar_source_atendly`;
  - `agenda-atendly-confirmar`, `agenda-atendly-metodo` e `agenda-atendly-pronta` como aliases, `requireAtendlyCalendar*`, `findRequireAtendlyCalendarReferences` e `no_require_atendly_calendar_reference`.

  Um token só com a palavra (`` `Atendly` ``, `` `atendly` ``) não entra em (L), porque a palavra sozinha ainda aparece em comentários de legado. A exceção é `` `ATENDLY` ``, que é o valor.
- **(E) Nome de ambiente.** A pasta do projeto `atendly-ia` quando nomeia pasta, caminho ou repositório (não quando nomeia o pacote npm, que já é `avenly-ia`); os nomes de D-122 (viii), como serviços e hosts do Render (`atendly-ia-*`), a instância `atendly-platform`, os bancos `atendly_bff_test`, `atendly_bff`, `atendly_ai`, `atendly_scheduling` e `atendly_ai_orchestrator`, e os nomes do Docker local como `atendly_postgres_dev`; as URLs externas do Claude Design com `?file=Atendly.dc.html`; e os dois `.zip` (`Atendly-Stage-1-delivery*.zip`), que D-122 (x) deixou com o nome.
- **(Q) Citação literal de saída de ferramenta antiga.** Saída copiada de um comando (lista de `git ls-files`, linha de log, nome de teste impresso pelo runner), em bloco de código ou entre aspas como saída. Hash de commit também fica.
- **(R) Identificador retirado antes da troca.** Token em formatação de código que não existe fora de `docs/` nem com o nome antigo nem com o novo: ele foi retirado antes do Goal102 e nunca teve o nome novo. Fica, e cada caso vai para a lista de julgamento do relatório.

Todo o resto troca, inclusive:
- os caminhos que o Goal102 renomeou (o token trocado existe hoje fora de `docs/`, e o antigo não);
- os pacotes `@atendly-ia/*` e o pacote raiz;
- o nome do produto em prosa, títulos, `tags` e `aliases` do vault;
- o texto de tela citado pelos registros que hoje diz Avenly no código (por exemplo, "Agenda Atendly").

Caso que parece caber em mais de uma classe, ou em nenhuma, **fica** e vai para a lista de julgamento do relatório, com arquivo, linha e motivo.

## Escolhas de desenho desta passada

- **(a) O `.md` solto ganha o nome novo.** `docs/astra_goal_0_auditoria_arquitetura_roadmap_atendly.md` passa a `docs/astra_goal_0_auditoria_arquitetura_roadmap_avenly.md` com `git mv`, e o texto dele segue a regra. As citações do nome antigo em D-122, no review102 e na seção do Goal102 em VALIDATION_GATE ficam, por (F) e (Q). Motivo: D-122 deixou a decisão para este Goal, e nenhum link aponta para o arquivo.
- **(b) Âncora acompanha o título.** Se um título muda, todo link para a âncora dele muda no mesmo diff. O título de DATA_MIGRATION §14 cita o valor `ATENDLY` do Goal027. Ele fica por (L), e os quatro links também.
- **(c) O documento deste Goal não é editado pelo Developer.** O texto dele cita o nome antigo como objeto da regra, por (F). A virada de status é do fechamento.
- **(d) Texto novo dos registros usa Avenly.** A regra vale para o que se escreve daqui em diante: D-124, o delta de CURRENT_STATE e a seção de VALIDATION_GATE deste Goal dizem Avenly, salvo citação de (L), (E), (Q) ou (R).
- **(e) Nenhum arquivo fora de `docs/` muda.** `docs/design-reference/` e `graphify-out/` também não mudam. Se um hook regenerar `graphify-out/`, restaurar.

## Escopo obrigatório

### 1. Documentação fora dos registros

`docs/product-vault/` (34 arquivos), `docs/architecture/README.md`, `docs/landing-page/BRIEF_PROTOTIPO.md`, `docs/README.md`, `docs/PLANO_REFATORACAO.md` e o `.md` solto de (a), com o `git mv`. No vault, os títulos, as `tags` e os `aliases` trocam. Quase tudo aqui é prosa de produto: espera-se que quase nada fique. O que ficar entra no inventário com a classe.

### 2. Goals da migração

Os 64 arquivos de `docs/migration/goals/` com o nome, menos este. Os Goals 102, 109 e 110 são (F). Nos demais, os caminhos que o Goal102 renomeou trocam, e os valores legados (por exemplo, o `ATENDLY` do Goal027) ficam.

### 3. Reviews da migração

Os 75 arquivos de `docs/migration/reviews/` com o nome. Os reviews 102, 109 e 110 são (F).

### 4. Registros da raiz de `docs/migration/`

Os 14 arquivos da raiz com o nome. É onde a densidade de valores legados é maior: D-120 a D-123 são (F), e as seções dos Goals 027, 028, 109, 110 e 102 citam valores e constraints. Em CURRENT_STATE, VALIDATION_GATE e FINAL_AUDIT, uma seção aceita de outro Goal muda **só** pela troca da palavra, linha a linha. Nenhuma frase é reescrita, e nenhum título muda além da palavra.

### 5. Inventário, provas e documentação

Ver "Validação e ordem" e "Documentação".

### 6. O que este Goal não pode fazer

- mudar qualquer arquivo fora de `docs/`, em `docs/design-reference/` ou em `graphify-out/`;
- reescrever frase, reordenar texto, corrigir outro erro ou atualizar contagem antiga: só a palavra muda (o que o Developer notar vai para o relatório como observação);
- trocar o nome dentro de um registro da família (F), salvo a prosa que nomeia o produto sem falar da troca;
- trocar um valor de (L), um nome de (E), uma citação de (Q) ou um identificador de (R);
- editar o documento deste Goal.

## Pontos de implementação

- Fazer a troca com um script fora do repositório (na pasta temporária da sessão), que aplica a regra por linha e deixa intactos os tokens de (L), (E) e (Q). Depois, conferir à mão os arquivos da família (F) e os 14 da raiz. Não deixar o script, nem arquivo temporário, dentro da worktree.
- Para decidir (L), (R) ou troca de um token em formatação de código, rodar `git grep -F` com o token antigo e com o trocado fora de `docs/` e de `graphify-out/`.
- Linhas muito longas de CURRENT_STATE, VALIDATION_GATE e MASTER_PLAN podem ter ocorrências de classes diferentes na mesma linha. O inventário classifica por **ocorrência**, não só por linha.

## Fora do escopo

- A troca dos nomes de ambiente (D-122 (viii)): Render, domínio, instância do WhatsApp, bancos locais e do CI, Docker local. É do supervisor e do operador.
- A contração da compatibilidade de D-120 e D-121, que tira (ii) e (vi) do código.
- O SHA-256 de `Avenly-standalone.html` em `claude-design/README.md` (observação 2 do review102) e tudo em `docs/design-reference/`.
- `graphify-out/`, as migrations e o nome da pasta do projeto.
- A versão legal definitiva.

## Documentação

No mesmo diff, por acréscimo e depois das provas:

- [DECISIONS](../DECISIONS.md) ganha **D-124** em `PROPOSED`, no formato de D-122. Ela registra:
  - a regra da troca nos registros;
  - as classes (F), (L), (E), (Q) e (R) e a precedência;
  - as escolhas (a) a (e);
  - o inventário final por classe;
  - a lista de julgamento;
  - um "Revisar se": troca dos nomes de ambiente; contração de D-120 e D-121; renomeação do projeto externo do Claude Design.

  D-120 a D-123 não são reescritas.
- [CURRENT_STATE](../CURRENT_STATE.md) ganha um delta curto.
- [VALIDATION_GATE](../VALIDATION_GATE.md) ganha uma subseção do Goal111 com:
  - a recontagem de entrada;
  - o inventário final por arquivo e classe;
  - a prova linha a linha;
  - a prova dos tokens protegidos;
  - a conferência de links e âncoras.
- FINAL_AUDIT não ganha seção.

Toda contagem em documento permanente nomeia o comando e a árvore que a sustentam. Seção aceita de outro Goal não é editada além da troca da palavra. O texto deste Goal entra só por acréscimo.

**Blockers de documento.** Se o review apontar blockers de documento, cada um vira um item curto e separado. O Developer confere item por item antes de devolver (regra do 097 e do 104).

## Validação e ordem

1. **Recontar a entrada** na base imediata: `git grep -c -i atendly -- docs ':!docs/design-reference'` por arquivo, com o total de linhas e de ocorrências (`git grep -o -i`). Também contar cada token protegido da lista abaixo em `docs/` fora de `docs/design-reference/`. Os números vêm colados no relatório. Se diferirem dos desta página, o relatório diz por quê.
2. Fazer os §1 a §4.
3. **Prova linha a linha.** Para cada linha removida e cada linha adicionada em `git diff -M <base imediata> -- docs`, salvo os acréscimos de "Documentação", a linha nova se obtém da antiga trocando um subconjunto das ocorrências do nome antigo pelo nome novo na mesma caixa, e nada mais. O pareamento é por hunk e em ordem. Um caminho seguro é montar uma expressão a partir da linha antiga, com cada ocorrência virando `(?:Atendly|Avenly)` na caixa dela. O relatório traz o script, o comando e a saída: número de linhas conferidas e zero divergências. O `.md` de (a) entra na prova pelo par `R`.
4. **Prova dos tokens protegidos.** Para cada um destes tokens, a contagem em `docs/` fora de `docs/design-reference/` é igual antes e depois:
   - `atendly_session`, `atendly_csrf`, `atendly:internal:v1`, `atendly:csrf:` e `CalendarSettings_source_atendly_check`;
   - `"ATENDLY"` e `` `ATENDLY` ``;
   - `ATENDLY_`;
   - `20260828233000_add_atendly_calendar_provider` e `20260919120000_goal027_calendar_source_atendly`;
   - `agenda-atendly-`, `requireAtendlyCalendar`, `atendly-platform`, `atendly_bff_test` e `Atendly-Stage-1-delivery`.
5. **Inventário final.** `git grep -n -i atendly -- docs ':!docs/design-reference'`: cada ocorrência classificada em (F), (L), (E), (Q) ou (R), sem resto. O relatório traz a lista completa. VALIDATION_GATE traz a contagem por arquivo e por classe.
6. **Links e âncoras.** Todo link relativo e toda âncora dos arquivos mudados resolvem, ou já estavam quebrados na base imediata e não pioraram. O relatório traz o script, o número de links conferidos e a lista dos já quebrados, se houver.
7. `git ls-files | grep -i atendly` devolve só os dois diretórios de migration e os dois `.zip`.
8. Escrever a prosa de "Documentação" só depois disso, e rodar `git diff --check` por último.

## Critério de aceite

1. O inventário final está no relatório e em VALIDATION_GATE, com cada ocorrência classificada e sem resto. Fora da família (F), cada ocorrência que ficou cabe em (L), (E), (Q) ou (R) pela prova `git grep -F` do token, ou está na lista de julgamento.
2. A prova linha a linha sai com zero divergências: fora dos acréscimos de "Documentação", só a palavra mudou.
3. A contagem de cada token protegido é igual antes e depois.
4. `git ls-files | grep -i atendly` devolve só os dois diretórios de migration (D-122 (i)) e os dois `.zip` (D-122 (x)). O `.md` de (a) aparece como `R` em `git diff --name-status -M`.
5. Nenhum link relativo nem âncora fica quebrado por este diff. Os quatro links para DATA_MIGRATION §14 continuam resolvendo.
6. D-120, D-121, D-122 e D-123 continuam dizendo o que decidiram: nenhuma frase sobre valor legado, leitura do valor antigo ou classe de exceção passou a citar o nome novo no lugar do antigo.
7. `git diff --stat` e `git status --porcelain=v1 -uall` mostram só arquivos de `docs/` fora de `docs/design-reference/`, sem o documento deste Goal, sem `graphify-out/` e sem arquivo temporário.
8. D-124 está em `PROPOSED`. CURRENT_STATE e VALIDATION_GATE são escritos depois das provas, só por acréscimo, em Avenly.
9. `git diff --check` passa.

**O que o aceite não prova:**
- a troca dos nomes de ambiente;
- a contração da compatibilidade de D-120 e D-121;
- que o texto do vault, além do nome, esteja atual (este Goal não revisa conteúdo).

## Plano de execução

| WU | Tipo | Depende de | Entrega |
| --- | --- | --- | --- |
| WU-01 | STANDARD | — | Recontagem de entrada, script da troca e §1 (vault, `docs/architecture/`, `docs/landing-page/`, `.md` soltos e o `git mv` de (a)) |
| WU-02 | STANDARD | WU-01 | §2, Goals da migração |
| WU-03 | STANDARD | WU-01 | §3, reviews da migração |
| WU-04 | STANDARD | WU-01 | §4, os 14 registros da raiz de `docs/migration/` |
| WU-05 | STANDARD | WU-02, WU-03, WU-04 | Provas (linha a linha, tokens protegidos, links e âncoras), inventário final e documentação (D-124, CURRENT_STATE, VALIDATION_GATE) |
| WU-06 | DETERMINISTIC | WU-05 | git-diff-check final |

`tooling-tests` não se aplica (D-123), e nenhum gate de app roda: nenhum arquivo fora de `docs/` muda.
