# atendimeto-ia-health-worker

Web service Node para o Render que expoe `/health` e consulta as rotas publicas de saude dos servicos a cada 40 segundos.

## Endpoints monitorados

- `https://atendly-ia-frontend.onrender.com/login`
- `https://atendly-ia-bff.onrender.com/health`
- `https://atendimeto-ia.onrender.com/health`
- `https://evolution-go-4pmo.onrender.com/healthy`

## Rodar localmente

```bash
npm start
```

## Render

Este projeto usa `render.yaml` para criar um web service leve no plano free do Render:

- name: `atendly-ia-health-worker`
- runtime: `node`
- build command: `npm ci`
- start command: `npm start`
- health check: `/health`
