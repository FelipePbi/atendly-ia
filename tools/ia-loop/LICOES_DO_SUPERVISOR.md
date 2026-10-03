# Lições do supervisor do ia-loop

Erros que o supervisor (o agente que acompanha o loop autônomo de fora) já cometeu, e as regras
que saíram deles. Leia antes de supervisionar o loop. Todo erro novo do supervisor entra aqui,
com data, sintoma, causa e regra, no mesmo commit da próxima pausa segura.

A seção final lista falhas do próprio harness encontradas durante a supervisão e ainda não
corrigidas. Elas não são erro do supervisor, mas a regra de contorno vale até a correção.

## Regras (checklist antes de agir)

1. **Nada no checkout principal com job ativo.** Nenhum commit, nenhum arquivo novo ou alterado
   no checkout principal enquanto houver qualquer job do Goal ativo: Developer, Reviewer,
   cobertura do Tech Lead, diagnóstico. A guarda compara HEAD e arquivos sujos antes e depois de
   cada job e acusa `MAIN_CHECKOUT_MUTATED`. Para escrever no repositório: `npm run ia-loop:pause`
   (ou `-- --after-goal`), esperar `status: PAUSED` e o run-auto fora do ar, fazer o trabalho,
   commitar, limpar a pausa e retomar. Rascunhos ficam fora do repositório até a pausa.
2. **Não reiniciar worker com o run-auto rodando.** O run-auto trata worker sem heartbeat como
   `UNKNOWN_FATAL`, mesmo que um worker novo assuma o job. Se for preciso reiniciar um worker,
   pausar antes, ou reanexar logo depois com `--from <goal> --resolved "<nota>"`.
3. **Confirmar que o worker morreu antes de reiniciar.** Uma linha `CRASH` no log não basta.
   Conferir o processo e o heartbeat. Se o processo está vivo e com heartbeat, não mexer
   (`WORKER_ALREADY_RUNNING` é a recusa correta).
4. **Pausa pedida sobrevive a toda retomada.** Qualquer caminho do supervisor que religa o
   run-auto (recuperação de planejamento, `--from`, attach) lê `pauseRequested` antes e não
   retoma se houver pausa pedida pelo operador.
5. **Pausa cumprida é pausa limpa.** Depois de fazer o trabalho que motivou a pausa, limpar o
   pedido (`clearPause`) antes de retomar. Pedido esquecido para o loop horas depois sem motivo.
6. **Supervisor fora das tarefas do Claude.** Supervisor, guarda, keeper e amostrador de memória
   rodam como processos desanexados (`Start-Process ... -WindowStyle Hidden`), não como tarefa
   em segundo plano da sessão do Claude, que morre por limite de tempo ou quando o app fecha.
7. **Conferir no byte antes de declarar arquivo corrompido.** Acento estranho na saída do
   terminal costuma ser só a exibição (code page do console). Ler o arquivo como UTF-8 (por
   exemplo `node -e` ou Python) antes de concluir que há mojibake.
8. **Depois de reiniciar a máquina:** consertar os sockets do Docker, religar workers,
   `npm run ia-loop:recover` para o lease `DIFFERENT_BOOT`, e só então reanexar o run-auto.
   Não reanexar antes do recover.

## Erros cometidos

### S-01 — Commit no main durante job ativo

- **Quando:** 2026-10-02 22:28 (Goal 094, correção R2), commits `4dcd3bc` e `e4335f5` do
  registro do Goal 102.
- **Sintoma:** `POLICY_VIOLATION MAIN_CHECKOUT_MUTATED`, loop parado.
- **Causa:** o script do supervisor esperou não haver job do Developer na fila e tratou um job
  do Tech Lead como janela segura. A checagem de cobertura do Tech Lead roda em paralelo à
  correção do Developer.
- **Regra:** 1.

### S-02 — Reinício de worker derrubou o orquestrador

- **Quando:** 2026-10-02 17:52 (Goal 094) e 2026-10-03 03:44 (Goal 103).
- **Sintoma:** `The developer worker is no longer heartbeating.` e depois
  `Goal 103 needs a human: UNKNOWN_FATAL`.
- **Causa:** o supervisor reiniciou o worker do Developer com o run-auto ativo.
- **Correção aplicada:** reanexar com `--from <goal> --resolved "<nota>"`; o run-auto reanexou à
  tentativa em curso sem republicar.
- **Regra:** 2.

### S-03 — Reinício de worker que não tinha caído

- **Quando:** Goal 077, revisão R2, durante a pausa para o ajuste do harness.
- **Sintoma:** o supervisor tentou religar o worker do Tech Lead por causa de uma linha `CRASH`
  no log. O worker continuava vivo e com heartbeat; a recusa `WORKER_ALREADY_RUNNING` evitou
  dano.
- **Regra:** 3.

### S-04 — Pausa do operador perdida na recuperação do planejamento

- **Quando:** pausa pedida para depois do Goal 086.
- **Sintoma:** o loop seguiu para o 087 sem parar.
- **Causa:** ao recuperar a falha transitória de `git worktree add` do planejamento pós-086, o
  supervisor religou o run-auto com `--from`. A execução nova não herdou o pedido de pausa.
- **Correção aplicada:** o supervisor lê `pauseRequested` antes de religar e não retoma se houver
  pausa pedida.
- **Regra:** 4.

### S-05 — Pedido de pausa esquecido armado

- **Quando:** fim do Goal 077, depois do ajuste do harness.
- **Sintoma:** o loop parou "Paused at a safe boundary" sem motivo atual.
- **Causa:** a pausa pedida para o ajuste do harness (troca para Sonnet 5.5) continuou armada
  depois do ajuste.
- **Regra:** 5.

### S-06 — Supervisor morto junto com a tarefa do Claude

- **Quando:** até 2026-10-02 14:37.
- **Sintoma:** o loop ficava sem supervisor quando a tarefa em segundo plano da sessão do Claude
  atingia o limite de tempo ou o app fechava; uma queda transitória deixava de ser tratada.
- **Correção aplicada:** supervisor, guarda, keeper e amostrador viraram processos desanexados.
- **Regra:** 6.

### S-07 — Falso alarme de texto corrompido no MASTER_PLAN

- **Quando:** 2026-10-03.
- **Sintoma:** acentos trocados na saída do terminal levantaram suspeita de mojibake no
  `docs/migration/MASTER_PLAN.md`. O arquivo estava íntegro; era só a exibição.
- **Regra:** 7.

## Falhas do harness ainda abertas

Registradas durante a supervisão de 2026-10-02 e 2026-10-03. Nada aqui foi corrigido no harness.

- **M-01 — Worker não reconhece lease de outra inicialização da máquina.** Depois de reiniciar
  a máquina, o worker registra `ORPHANED_EXECUTION_UNCERTAIN` sem parar e nunca pega o job.
  `canStartNewAttempt` (`lib/leases.mjs`) só confia em `workerHealth`; o `run-recover` já trata
  `DIFFERENT_BOOT`. Corrigir: lease com `bootAt` anterior ao boot atual vale como órfão
  confirmado. Contorno: parar orquestrador, esperar o lease expirar, `ia-loop:recover`, religar.
- **M-02 — Retomada trava em unidade FAILED com gate `-gN` posterior.**
  `[STAGE_NOT_RETRYABLE] Attempt ...-wu-06-a1 is FAILED`. O DAG redespacha a unidade pelo id
  original sem ler a linhagem de gate (`-gN`) e diagnóstico (`DIAG-*`). Corrigir: unidade
  FAILED com gate posterior COMPLETED está resolvida; sem diagnóstico concluído, retomar pelo
  diagnóstico. Contorno: mover a cadeia de falha para `.state/quarantine-*` com `OPERATOR_NOTE`.
- **M-03 — Worker não tenta de novo depois de erro na retomada.** O job fica QUEUED e o worker
  IDLE. Corrigir: estado explícito visível ao run-auto, ou nova tentativa no próximo ciclo.
- **M-04 — Falta janela segura para commit do operador.** `run-pause` deveria ter um modo que
  espera nenhum job ativo, segura o próximo despacho e libera depois (ver S-01).
- **M-05 — Reiniciar um worker derruba o orquestrador.** Tolerar alguns minutos sem heartbeat
  se um worker novo do mesmo papel aparecer com o lease da tentativa vivo (ver S-02).
- **M-06 — Documentação de fechamento esquece o status ACCEPTED.** Todo
  `feat(migration): complete goal NNN` vem seguido de
  `docs(migration): mark Goal NNN ACCEPTED (closure documentation omitted it)` (13 vezes desde
  2026-09-30). Incluir a virada de status no job de documentação de fechamento.
- **M-07 — Rodadas inteiras gastas só com documentação.** Goals 095 (R3, R4) e 097 (R3–R5):
  código aceito, rodada recusada por texto de CURRENT_STATE, VALIDATION_GATE ou DECISIONS.
  Aceitar com pendência quando todos os blockers forem só de documentação, ou dar ao Developer
  um molde com as contagens que o gate imprime.
- **M-08 — Serviços de Goals fechados continuam rodando.** A cadeia
  `bash.exe (npx tsx src/server.ts)` → `node tsx cli` → `node loader` escapa de
  `selectLoopOrphans`, que exige "órfão e cita a worktree" no mesmo processo. Varrer por árvore
  e, no fechamento, matar tudo que cite `.ai-worktrees/goal-NNN` do Goal fechado.
- **M-09 — Worktrees e diretórios de planejamento nunca são removidos.** Cerca de 200 em
  `.ai-worktrees/`. No fechamento, remover a worktree do Goal e a de planejamento anterior
  (primeiro `cmd /c rmdir` nas junctions de `node_modules`, depois `git worktree remove`).
