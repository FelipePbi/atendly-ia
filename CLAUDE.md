# CLAUDE.md — Atendly

Arquivo de **roteamento**, não base de conhecimento: diz onde procurar, não qual é a resposta.
Guardrails de produto estão em `AGENTS.md`. Detalhe operacional em `docs/AI_WORKFLOW.md`.

## Roteamento

| Pergunta | Fonte | Como |
| --- | --- | --- |
| Regra de negócio, decisão de produto, fluxo, UX/copy, domínio, feature | `docs/product-vault/` | busca dirigida, depois 1–3 notas |
| Arquitetura conceitual, contratos, decisões técnicas, ADRs | `docs/PLANO_REFATORACAO.md`, `docs/architecture/`, `apps/bff/PUBLIC_API_V1.md`, `AGENTS.md`/README do app | abrir só o documento do tema |
| Onde/como algo está implementado, call paths, dependências, impacto | Graphify | `graphify query "..." --budget 800` |
| Output verboso de shell (git, testes, lint, build, logs) | RTK | automático — o hook `PreToolUse` reescreve o comando |

Tarefa mista: **Product Vault → Graphify → 2–5 arquivos → implementar → RTK (lint/typecheck/testes/diff) → atualizar docs afetados**.

## Leitura de documentação

- `docs/product-vault/` é a base **canônica** de produto/negócio e um **Obsidian Vault** (abra a pasta no Obsidian). `graphify-out/` é o grafo de **código**. São dois grafos separados, de propósito — não tente unificá-los.
- **Nunca** carregue `docs/**` ou `docs/product-vault/**` por inteiro. Nada de `cat docs/**/*.md`, varredura preventiva de `.md` ou "ler todo o vault" como etapa inicial.
- Consulta sob demanda: identifique o conceito → localize 1–3 documentos prováveis → leia só eles → siga `[[wikilinks]]` apenas se os primeiros forem insuficientes. Se bastarem, pare.
- Antes de abrir mais um arquivo, pergunte: *isto pode mudar minha decisão ou implementação?* Se não, não leia.
- O vault **não** é mapa de código — ele nunca diz qual arquivo editar. Graphify diz.
- Fluxo detalhado, roteamento por tema e política de sincronização: `docs/AI_WORKFLOW.md` (leia quando precisar, não por padrão). Índice do vault: `docs/product-vault/00-HOME.md`.

## graphify

Este projeto tem um grafo de conhecimento em `graphify-out/` com god nodes, comunidades e relações entre arquivos.

- Para perguntas sobre o código, rode primeiro `graphify query "<pergunta>" --budget 800` quando `graphify-out/graph.json` existir. Suba para `--budget 1500` só se insuficiente e `--budget 2500` só em perguntas realmente complexas. Use `graphify path "<A>" "<B>"` para relações, `graphify explain "<conceito>"` para conceitos focados e `graphify affected "<X>"` para análise de impacto. Isso devolve um subgrafo escopado, normalmente muito menor que `GRAPH_REPORT.md` ou grep cru.
- Leia `graphify-out/GRAPH_REPORT.md` apenas em revisão ampla de arquitetura ou quando query/path/explain não trouxerem contexto suficiente.
- O grafo cobre **código apenas**. `docs/product-vault/` e código vendorizado (`apps/evolution-go/whatsmeow-lib/`) são excluídos de propósito — ver `.graphifyignore`.
- O grafo é atualizado pelos hooks git post-commit/post-checkout. Rode `graphify update .` (AST-only, sem custo de API) só quando precisar dele atualizado antes de commitar. Nunca rode rebuild completo `graphify extract --mode deep` sem pedido explícito.
- Não use Graphify profundo para entender regra que já está documentada.

## RTK

RTK compacta output verboso. O hook global `PreToolUse` reescreve comandos Bash automaticamente (`git status` → `rtk git status`), então basta rodar o comando normal.

- Use `rtk grep` / `rtk find` / `rtk read` explicitamente quando a busca puder retornar muito output.
- Use as ferramentas nativas `Read` / `Grep` / `Glob` quando o alvo for pequeno e específico — o objetivo é o menor custo **líquido** de tokens, não uso máximo de RTK.
- `rtk gain` reporta a economia acumulada.

## Divergência entre documentação e código

Não escolha um dos dois em silêncio. Determine se o código está defasado, se a documentação está defasada, se houve mudança incompleta ou se existe decisão mais recente (`docs/product-vault/04-Referencia/02-Decisoes-Substituidas.md`). Resolva dentro do escopo da tarefa quando for possível; caso contrário, informe a divergência.

## Manutenção da documentação

Ao concluir uma alteração, verifique: *ela faz algum documento vigente mentir, ficar incompleto ou induzir agente/desenvolvedor ao erro?*

- **Sim** → atualize apenas os documentos afetados, sem esperar pedido explícito (arquitetura, regra, contrato, integração, fluxo, domínio, API, persistência, decisão técnica, feature documentada).
- **Não** → não toque na documentação. Refactor interno, rename local, formatação, lint, typo em código e teste sem mudança de comportamento não geram atualização de docs.

Prefira atualizar documento existente a criar novo. Documente conceitos, decisões, contratos, regras e fluxos — nunca implementação linha a linha.

## Regras de trabalho

- Leia apenas os arquivos de que realmente precisa; prefira `graphify query` a grep exploratório.
- Não commite nem faça push sem pedido explícito.
- `AGENTS.md` guarda os guardrails inegociáveis do produto — vence documentação e código defasados; `docs/product-vault/` vence `AGENTS.md` no detalhe de produto.
