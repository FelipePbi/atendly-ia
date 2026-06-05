@C:\Users\felip\.codex\RTK.md

## Ambiente de execucao

- Considere que os projetos rodam no WSL/Linux.
- Ao executar comandos de projeto, use `Ubuntu-24.04` e paths Linux, por exemplo `/home/felip/atendimeto-ia`.
- Use comandos Windows apenas para configuracao do Codex em `C:\Users\felip\.codex` ou quando solicitado explicitamente.

## Projeto

Este repositorio e o monorepo privado `atendly-ia`.

Apps principais:

- `apps/frontend`: interface Next.js.
- `apps/bff`: gateway/BFF Fastify. O frontend deve consumir somente este servico.
- `apps/api`: dominio de IA, atendimento, agendamento e Minha Agenda.
- `apps/evolution-go`: dominio de WhatsApp, instancia, QR, status e envio.
- `apps/health-worker`: monitoramento simples de health checks.

## Regras de arquitetura

- O frontend nao deve conhecer URLs ou tokens internos da API ou Evolution Go.
- O BFF e dono da autenticacao da plataforma via JWT em cookie `HttpOnly`.
- A API continua dona da logica de IA, prompts, agendamentos e Minha Agenda.
- O Evolution Go continua dono da conexao WhatsApp.
- O fluxo WhatsApp critico nao deve passar pelo BFF nesta fase, salvo necessidade explicita.
- Segredos reais nunca devem entrar em `.env.example`, README, docs ou codigo.

## Comandos uteis

```bash
npm run build:bff
npm run build:api
npm run build:frontend
npm run check:health-worker
npm run test:evolution-go
```

## Documentacao

- Estado atual: `docs/architecture/current-architecture.md`.
- Arquitetura alvo: `docs/architecture/target-architecture.md`.
- Contrato BFF: `docs/architecture/bff-contract.md`.
- Render: `docs/architecture/render-deploy.md`.
