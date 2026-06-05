# Arquitetura Alvo

## Diagrama

```text
Browser / Frontend
  |
  v
BFF
  |-- API
  |-- Evolution Go
```

Fluxo WhatsApp preservado nesta fase:

```text
WhatsApp -> Evolution Go -> API -> Evolution Go -> WhatsApp
```

## Decisoes

- O BFF autentica usuarios da plataforma com JWT em cookie `HttpOnly`.
- O frontend deve consumir somente o BFF.
- A API permanece dona de IA, agendamento, Minha Agenda e regras de atendimento.
- O Evolution Go permanece dono da instancia WhatsApp, QR, status, contatos e envio.
- Configuracoes de IA/negocio ainda devem migrar com cuidado, pois hoje estao no banco do frontend.
- O BFF inicial reutiliza o schema Prisma do frontend para preservar usuarios e configuracoes existentes.
- A API aceita `INTERNAL_SERVICE_TOKEN` nas rotas `/internal/*` em paralelo ao `ADMIN_API_TOKEN` legado.

## Fases

1. Monorepo e BFF base.
2. Auth JWT pelo BFF.
3. Migração das rotas `/api/*` do frontend para endpoints do BFF.
4. Remocao de NextAuth e variaveis internas do frontend.
5. Endurecimento de CORS e tokens internos na API/Evolution Go.
6. Render com `rootDir` por servico.

## Regras de seguranca

- Nao colocar segredos em `.env.example`.
- Frontend nao deve receber `EVOLUTION_GO_API_KEY`, `ADMIN_API_TOKEN`, `INTERNAL_SERVICE_TOKEN`, `OPENAI_API_KEY` ou credenciais da Minha Agenda.
- BFF deve padronizar erros e logs sem segredos.
- Webhooks publicos continuam validando token proprio.
