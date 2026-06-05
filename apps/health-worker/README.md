# atendimeto-ia-health-worker

Background Worker Node para o Render que consulta as rotas publicas de saude da API e do Evolution Go a cada 40 segundos.

## Endpoints monitorados

- `https://atendimeto-ia.onrender.com/healthy`
- `https://evolution-go-4pmo.onrender.com/healthy`

## Rodar localmente

```bash
npm start
```

## Render

Este projeto usa `render.yaml` para criar um servico Render do tipo Background Worker:

- name: `atendimeto-ia-health-worker`
- runtime: `node`
- build command: `npm install`
- start command: `npm start`
