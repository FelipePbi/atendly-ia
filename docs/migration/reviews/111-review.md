# Review formal — Goal 111

**Decisão vigente — rodada 2: ACCEPTED.** Tech Lead Agent ([D-018](../DECISIONS.md)), 2026-10-04, conforme o [Goal111](../goals/111-os-registros-e-a-documentacao-passam-a-dizer-avenly.md). O aceite vale só para o diff identificado abaixo. Nenhum aceite anterior foi reaberto, reavaliado ou revertido.

A documentação de `docs/` fora de `docs/design-reference/` e os registros da migração passam a dizer Avenly. A troca muda só a palavra, na mesma caixa, também dentro de caminhos e identificadores. O nome antigo fica só nas cinco classes da regra do Goal, por precedência: registro da própria troca (F), valor ou nome legado que existe hoje fora de `docs/` (L), nome de ambiente (E), citação literal de saída de ferramenta (Q) e identificador retirado antes da troca (R). O `.md` solto de `docs/` passa a `docs/astra_goal_0_auditoria_arquitetura_roadmap_avenly.md` com `git mv`. Nenhum arquivo fora de `docs/` mudou. Decisão: [D-124](../DECISIONS.md), aceita neste fechamento, com os onze pontos de julgamento como propostos.

## Escopo e identidade do diff

- Baseline aceita vigente: `9fe209f573ffcf8b31e5e2015678282aad50d6e9` (Goal102). Base imediata da implementação: `db877ca0c5854c9eabd14548083d7786702a249d`, o commit de planejamento que traz o documento do Goal, HEAD da worktree `.ai-worktrees/goal-111`, sem commit na worktree.
- Snapshot aceito, calculado pelo IA Loop: **171 arquivos**, hash do diff `2f61d90651cf19545a9aee7066e5bb5c32cadd1df6047870197043c07b64b4c1`. Mudança posterior nesses arquivos exige avaliar o novo diff.
- Arquivos, por `git diff -M --name-status db877ca`: **170** `M` e **1** `R098` (o `.md` solto). Todos em `docs/`, fora de `docs/design-reference/`:
  - `docs/product-vault/` (34 arquivos), `docs/architecture/README.md`, `docs/landing-page/BRIEF_PROTOTIPO.md`, `docs/README.md`, `docs/PLANO_REFATORACAO.md` e o `.md` renomeado;
  - `docs/migration/goals/` e `docs/migration/reviews/`, só pela troca da palavra;
  - os registros da raiz de `docs/migration/`. Em `DECISIONS.md`, `CURRENT_STATE.md` e `VALIDATION_GATE.md`, além da troca, entram por acréscimo, no fim de cada arquivo, D-124 (45 linhas), o delta do Goal111 (10) e a seção do Goal111 (136).
- O documento do Goal111 não foi tocado. Nenhum arquivo não rastreado, nada em `graphify-out/` e nada em `docs/design-reference/`.

## Histórico das rodadas

1. **Rodada 1 — `CHANGES_REQUIRED`, 4 blockers, todos de documento.** A troca conferia com a regra no geral. Os erros eram de classe: (1) o campo retirado `ShellConfig.source` foi trocado em `CURRENT_STATE.md:2627` e `DECISIONS.md:509` (3 ocorrências), embora nunca tenha tido o valor novo e tenha ficado em (R) nos reviews 015 e 028; (2) a mensagem de asserção impressa pelo runner em `FINAL_AUDIT.md:5612` e `VALIDATION_GATE.md:2265`, e o valor recebido pelo teste em `FINAL_AUDIT.md:6185`, foram trocados, embora sejam saída da execução antiga (Q); (3) a lista de julgamento de D-124 não trazia o rótulo do I2 que ficou só por ser token protegido (`DECISIONS.md:5815` e `reviews/105-review.md:23`), e o ponto 4 dizia que os globs ficavam em (R), mas o glob `*-*.css` em prosa tinha sido trocado em três linhas; (4) as provas, o inventário e as contagens de D-124, do delta de CURRENT_STATE e da seção de VALIDATION_GATE precisavam ser refeitos sobre a árvore final.
2. **Rodada 2 — `ACCEPTED`, 0 blockers.** A FIX-001 devolveu as 3 ocorrências de (R) e as 5 de (Q) ao nome antigo, com a prosa vizinha ("Agenda Avenly", "automação de") ainda trocada. D-124 ganhou os pontos de julgamento 10 e 11, e o ponto 4 passou a dizer que o glob em prosa foi trocado e por quê. As provas e as contagens foram refeitas sobre a árvore final. O conjunto de arquivos não mudou entre as rodadas: 171 nas duas.

Antes do review da rodada 1, o IA Loop parou duas vezes por causa do harness, não do diff: um `POLICY_VIOLATION` (`GOAL_DOC_MUTATED`), porque o Developer editou Goals e `MIGRATION_STATUS.md` pela troca da palavra, como o próprio Goal pede, e um `CAPACITY_STATE_CORRUPT` na primeira tentativa de review. O supervisor liberou a parada depois de o harness aceitar que um Goal declare editáveis os registros de controle da migração (observação M-15 do `relay-loop-ia`). O Developer rodou nas duas rodadas com o modo `WORK_UNITS` (6 unidades na rodada 1, FIX-001 e WU-06 na rodada 2).

## Evidência considerada

Números em [VALIDATION_GATE](../VALIDATION_GATE.md) (seção do Goal111 e sua nota de fechamento), em [CURRENT_STATE](../CURRENT_STATE.md) (delta do Goal111) e no item 5 de D-124. O Tech Lead refez as provas abaixo com scripts próprios, direto na worktree.

- **Prova linha a linha, contra `db877ca`.** Na rodada 1, 55355 linhas comparadas e 923 mudadas. Na rodada 2, por `difflib` e expressão regular, **920** linhas mudadas, **1096** ocorrências trocadas e **77** mantidas. A única divergência é a exceção declarada em `docs/product-vault/02-Fluxos/01-Onboarding.md:200`: a linha perdeu os dois espaços finais de uma quebra dura, porque o critério 2 (só a palavra muda) e o critério 9 (`git diff --check`) não podiam valer juntos ali. As inserções puras são só os três acréscimos de "Documentação", no fim dos arquivos.
- **Tokens protegidos.** Os 15 da lista do Goal têm a mesma contagem antes e depois. Na rodada 1 o Tech Lead conferiu também `findRequire*`, `no_require*`, as chaves de `localStorage` da assinatura da marca, o Docker local, a URL do Claude Design, os bancos e os serviços do Render, todos sem mudança de contagem.
- **Inventário da árvore final.** `git grep -n -i <nome antigo> -- docs ':!docs/design-reference'`: **65** arquivos, **716** linhas e **1243** ocorrências, todas classificadas: 735 em (F), 318 em (L), 144 em (E), 14 em (Q) e 32 em (R). A tabela por arquivo de VALIDATION_GATE bate arquivo a arquivo com o `git grep -o`, e a soma de cada linha está certa.
- **Ocorrências mantidas fora de (F) e dos tokens protegidos.** O Tech Lead as varreu na rodada 2. Os PNGs de favicon e logo com o nome antigo existem em `apps/frontend/tests/goal068-marca.test.tsx`, por isso ficam em (L). As duas folhas CSS retiradas e o pacote `@…/contracts` antigo dão 0 fora de `docs/` com os dois nomes, por isso ficam em (R). Os nomes de teste e as asserções impressas ficam em (Q), e a pasta temporária de teste fica em (E). Não sobrou troca esquecida.
- **Caminhos e identificadores trocados.** Todo caminho trocado existe hoje com o nome novo, e todo identificador trocado existe com o nome novo no código ou em comentário.
- **Arquivos.** `git ls-files` com o nome antigo devolve só os dois diretórios de migration do Scheduling (D-122 (i)) e os dois `.zip` (D-122 (x)). D-120 a D-123 (`DECISIONS.md`, linhas 5817 a 5970 na base) estão sem hunk. D-124 entrou em `PROPOSED`.
- **Links e âncoras.** Pelo registro do Developer: 5965 links relativos de 341 documentos, 0 quebrados por este diff e 20 já quebrados na base. Os quatro links para DATA_MIGRATION §14 continuam resolvendo, porque o título cita o valor legado do enum e ficou. O Tech Lead não refez essa contagem.
- **Gates do IA Loop.** Só `git diff --check` (WU-06), com exit 0 nas duas rodadas (170 ms e 180 ms). Nenhum gate de app rodou, porque nenhum código mudou e nenhum código lê esses documentos.

## Aceito sem prova completa

1. **A conferência de links e âncoras** vem do script do Developer. O Tech Lead conferiu os quatro links de DATA_MIGRATION §14 e os títulos mudados, mas não refez a contagem de 5965.
2. **A atualidade do texto do vault além do nome.** O Goal não revisa conteúdo.
3. **A lista de julgamento de D-124.** Os onze pontos ficam aceitos como propostos. O ponto 4 (o glob em prosa trocado em três linhas) foi aceito de forma explícita na rodada 2, porque as folhas `avenly-*.css` existem hoje e a frase trocada continua verdadeira.

## Observações registradas, sem mudar a decisão

1. **O item 5 de D-124 cita a constante de tela antiga** para descrever o que foi trocado. É aceitável, porque D-124 é da família (F).
2. **O alerta do orquestrador sobre a expressão `/Avenly/`** na rodada 2 é inofensivo: a correção do blocker 2 foi justamente tirar esse texto de `FINAL_AUDIT.md` e `VALIDATION_GATE.md`.
3. **Este review não estava em disco durante as rodadas.** Os blockers foram escritos autocontidos no resultado de cada rodada.

## O que o aceite não prova

- A troca dos nomes de ambiente (D-122 (viii)): Render, domínio, instância do WhatsApp, bancos locais e do CI, Docker local.
- A contração da compatibilidade de D-120 e D-121, que tira (ii) e (vi) do código. Quando ela vier, os tokens de (L) que perderem o código passam a (R).
- A renomeação do projeto externo do Claude Design e tudo em `docs/design-reference/`.
- Que o texto do vault, além do nome, esteja atual.
