# Agentes vigentes da migração

Fonte canônica de **quem exerce cada papel** no ciclo de migração. Os demais
documentos referenciam os papéis (`Tech Lead Agent`, `Developer Agent`,
`IA Loop`); só este arquivo os associa a modelos concretos, de modo que trocar
de modelo no futuro não exija reescrever a documentação.

Vigência: a partir do **Goal003**. Ver [D-018](DECISIONS.md).

## Tech Lead / Architect / Reviewer

**Modelo atual:** escolhido por risco, não fixo. `LOW`/`MEDIUM` → Claude Opus 5
(`claude-opus-5`); `HIGH`/`CRITICAL` → Claude Fable 5.1 (`claude-fable-5-1`),
com fallback para Opus quando a cota do especialista fecha. A classificação é
determinística e não custa inferência. Tabela canônica em
`tools/ia-loop/lib/model-routing.mjs`.

Responsabilidades:

- revisar a implementação real, não o relatório do executor;
- decidir `ACCEPTED` / `CHANGES_REQUIRED` / `HUMAN_REQUIRED`;
- manter as decisões arquiteturais em [DECISIONS](DECISIONS.md);
- reavaliar o roadmap incrementalmente após cada aceite;
- autorizar o fechamento do Goal;
- definir as atualizações documentais causadas pelo aceite;
- escrever o próximo Goal executável;
- preservar a arquitetura global e o escopo.

**Sessão:** persistente, mantida pelo IA Loop entre reviews e entre reinícios.

## Developer / Executor

**Modelo atual:** escolhido pelo router, não fixo, e não necessariamente um só
por Goal.

- Execução legada (uma rodada, uma chamada): Claude Sonnet 5 (`claude-sonnet-5`)
  como padrão, Claude Opus 5 (`claude-opus-5`) por escalada com evidência.
- Execução por **Work Units** (`IA_LOOP_WORK_UNIT_EXECUTION=1`): cada unidade do
  plano é roteada pela sua natureza — trabalho determinístico é executado pelo
  próprio orchestrator sem modelo nenhum, mecânico em Claude Haiku 4.5
  (`claude-haiku-4-5-20251001`), normal em Sonnet, e genuinamente difícil em
  Opus. O Tech Lead declara tipo, complexidade e risco; **nunca** o modelo.

Tabela canônica em `tools/ia-loop/lib/model-routing.mjs`; a arquitetura está em
[tools/ia-loop/README.md](../../tools/ia-loop/README.md), seção V18.

Responsabilidades:

- implementar o Goal vigente;
- executar os testes e as validações declaradas no Goal;
- produzir o implementation report com diff, comandos, resultados e limitações;
- corrigir os blockers apontados no review.

**Sessão:** stateless por inferência. Cada tarefa usa uma sessão nova e recebe o
contexto reinjetado explicitamente pelo IA Loop. Isso é deliberado, não
limitação a contornar — ver [tools/ia-loop/README.md](../../tools/ia-loop/README.md).

## Orchestrator

**IA Loop** (`tools/ia-loop/`)

Responsabilidades:

- máquina de estados e transições autorizadas;
- jobs, workers e contratos;
- capacidade, espera e retomada;
- Git e worktree;
- persistência do estado do Goal;
- **aplicação mecânica** das decisões já tomadas.

O orchestrator **não** toma decisão de arquitetura nem de aceite. Ele não pode
inferir `ACCEPTED` a partir de prosa, relatório ou ausência de erro: toda
transição vem de campo estruturado emitido pelo papel competente.

## Separação entre decisão e execução

| Etapa | Responsável |
| --- | --- |
| Revisar e decidir o aceite | Tech Lead Agent |
| Definir o que a documentação precisa registrar | Tech Lead Agent |
| Validar invariantes e fazer o stage seletivo | IA Loop |
| Criar o commit de fechamento | IA Loop |
| Reavaliar o roadmap e escrever o próximo Goal | Tech Lead Agent |

O commit de fechamento continua existindo **somente** depois de um `ACCEPTED`
declarado pelo Tech Lead. A mudança em relação ao fluxo original é apenas quem
digita o comando; a autoridade permanece no papel de review.

## Histórico

Até o **Goal002 inclusive**, o papel de Tech Lead / Reviewer foi exercido pelo
**Astra**: o Goal0 (auditoria, arquitetura e roadmap), os reviews 001 e 002 e as
decisões registradas até D-017.

Os artefatos históricos que mencionam Astra permanecem **inalterados**. Reviews
concluídos não são reatribuídos, e a autoria original é preservada. A troca vale
operacionalmente a partir do Goal003, que ainda não foi executado.
