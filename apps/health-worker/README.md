# Atendly health worker

Web service Node que consulta os health checks dos serviços a cada 40 segundos.

## Superfície HTTP

- `GET /health` — saúde do próprio worker;
- `GET /targets` — nomes dos alvos configurados.

## Alvos padrão

- frontend;
- BFF;
- AI Orchestrator;
- Scheduling Service;
- Evolution Go.

As URLs vêm de `FRONTEND_BASE_URL`, `BFF_BASE_URL`, `AI_ORCHESTRATOR_BASE_URL`, `SCHEDULING_SERVICE_BASE_URL` e `EVOLUTION_GO_BASE_URL`. `HEALTH_TARGETS` pode substituir a lista inteira.

## Rodar localmente

```bash
npm start
```

## Render

O deployment é definido em `render.yaml` na raiz do repositório:

- name: `atendly-ia-health-worker`
- runtime: `node`
- build command: `npm ci`
- start command: `npm start`
- health check: `/health`.
