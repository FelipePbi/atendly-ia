# Atendly Workspace Map

## Projetos

| Projeto | Responsabilidade | Tecnologia / entrypoint |
| --- | --- | --- |
| `apps/frontend` | Interface web aprovada; ainda com mocks | Next.js / `src/app` |
| `apps/bff` | API pública web e responsabilidades transitórias | Fastify / `src/server.ts` |
| `apps/ai-orchestrator` | Conversas, mensagens, handoff e execução de IA | Fastify / `src/server.ts` |
| `apps/scheduling-service` | Agenda, serviços, clientes, disponibilidade e appointments | Fastify / `src/server.ts` |
| `apps/evolution-go` | Transporte WhatsApp | Go / módulos Go |
| `apps/health-worker` | Monitoramento de saúde | Node / `src/index.js` |
| `apps/frontend-open-design` | Contrato visual de referência, não runtime | HTML/CSS/JS |

## Dependências e fluxos

- Web alvo: Frontend → BFF → AI Orchestrator, Scheduling Service e Evolution Go.
- WhatsApp inbound: Evolution Go → AI Orchestrator → Scheduling Service quando necessário → Evolution Go.
- Frontend atual usa `Mock*Service`; não chama serviços internos diretamente.
- `packages/legal-contract` e `packages/contracts` são contratos compartilhados.

## Banco e integrações

- BFF, AI Orchestrator e Scheduling Service: Prisma/PostgreSQL; AI Orchestrator também usa pgvector.
- Integrações: WhatsApp via Evolution Go; calendário via Agenda Atendly ou Minha Agenda, uma fonte oficial por tenant.
- Infraestrutura: `render.yaml`, Docker em Evolution Go e AI Orchestrator.

## Onde procurar

- Regras de produto: `docs/CONTEXTO_PRODUTO_ATENDLY.md`.
- UX: `docs/ESPECIFICACAO_TELAS_UX_ATENDLY.md` e `apps/frontend-open-design`.
- Migração: `docs/ROADMAP_INTEGRACAO_V1.md` e `docs/goals`.
- Configuração e comandos: `package.json`, manifests de cada app e `render.yaml`.

## Grafos Graphify

- Grafo compartilhado: `graphify-out/graph.json`.
- Visual: `graphify-out/graph.html`.
- Manifest incremental: `graphify-out/manifest.json`.
- Atualização: `graphify update .`; hooks Git fazem atualização AST após commit/checkout.
