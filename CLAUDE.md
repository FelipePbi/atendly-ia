# CLAUDE.md — Atendly

Arquivo de **roteamento**. As regras completas vivem na documentação; não copie o conteúdo delas para cá.

## Política de leitura de documentação

- **Nunca** carregue `docs/**` ou `docs/product-vault/**` por inteiro. Nada de `cat docs/**/*.md`, varredura preventiva de `.md` ou "ler todo o vault" como etapa inicial.
- Documentação é consultada **sob demanda**: identifique o conceito → localize 1–3 documentos prováveis → leia somente eles → siga links `[[...]]` apenas se a dúvida persistir. Se os primeiros documentos bastarem, pare a busca.
- Antes de abrir mais um arquivo, pergunte: *isto pode mudar minha decisão ou implementação?* Se não, não leia.
- Fluxo detalhado, tabela de roteamento por tema e política de sincronização: [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md) — leia quando precisar, não por padrão.

## Quando consultar

Consulte antes de decidir quando a tarefa envolver produto, regra de negócio, fluxo, domínio, UX/copy, integração, multi-tenancy, autenticação, agendamento, WhatsApp, IA, importação, persistência, decisão técnica anterior ou comportamento cujo motivo não esteja evidente no código.

| Necessidade | Fonte |
| --- | --- |
| Produto, regras, fluxos, UX/UI | `docs/product-vault/` (índice: `docs/product-vault/00-HOME.md`) |
| Arquitetura, contratos, decisões técnicas | `docs/` (`PLANO_REFATORACAO.md`, ADRs em `docs/architecture/`), `apps/bff/PUBLIC_API_V1.md`, `AGENTS.md`/README do app |
| Guardrails globais de trabalho | `AGENTS.md` na raiz — leia antes de alterar comportamento, copy ou interface |
| Onde algo está implementado, símbolos, dependências | Graphify (`GRAPHIFY_WORKSPACE_MAP.md`) |
| Busca textual pontual | RTK `grep`/`find` |
| Shell, testes, build, git | RTK |

Graphify e RTK continuam válidos e **não** são fonte de verdade de produto. Documentação responde *como deve funcionar e por quê*; Graphify responde *como está implementado e onde*. Para dúvidas estritamente de localização de código, comece pelo Graphify.

## Divergência entre documentação e código

Não escolha um dos dois em silêncio. Determine se o código está defasado, se a documentação está defasada ou se existe decisão mais recente (`docs/product-vault/04-Referencia/02-Decisoes-Substituidas.md`). Resolva dentro do escopo da tarefa quando for possível; caso contrário, informe a divergência.

## Manutenção da documentação

Ao concluir uma alteração, verifique: *ela faz algum documento vigente mentir, ficar incompleto ou induzir agente/desenvolvedor ao erro?*

- **Sim** → atualize apenas os documentos afetados, sem esperar pedido explícito.
- **Não** → não toque na documentação. Refactor interno, rename local, formatação, lint, typo em código e teste sem mudança de comportamento não geram atualização de docs.

Prefira atualizar documento existente a criar novo. Documente conceitos, decisões, contratos, regras e fluxos — nunca implementação linha a linha.
