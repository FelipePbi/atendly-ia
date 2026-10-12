# Deploy em VM única (Docker Compose)

Forma de deploy de produção: a plataforma inteira em uma VM, com os serviços
sempre ligados. A Evolution Go mantém a sessão do WhatsApp aberta, e a IA roda
o inbox e os lembretes em laço contínuo. Por isso nenhum serviço pode dormir
por falta de tráfego.

O `render.yaml` e o `apps/health-worker` saíram do repositório. O plano free
do Render desligava os serviços ociosos, e o health-worker existia só para
mantê-los acordados.

Arquivos:

- `docker-compose.prod.yml`: topologia de produção.
- `.env.production.example`: variáveis e como gerar cada segredo.
- `apps/*/Dockerfile`: uma imagem por serviço. Frontend e BFF usam a raiz do
  repositório como contexto de build, porque dependem de `packages/`.
- `infra/postgres/init-databases.sh`: cria usuário e banco por serviço na
  primeira subida do volume.

## Topologia

| Serviço | Exposição | Observação |
| --- | --- | --- |
| `frontend` | pública (`APP_URL`), porta 3001 | `NEXT_PUBLIC_BFF_URL` e os `AVENLY_*` são embutidos no build |
| `bff` | pública (`API_URL`), porta 3002 | CORS restrito a `APP_URL`, cookie `Secure`, `TRUST_PROXY_HOPS=1` (IP real para o rate limit) |
| `ai-orchestrator` | interna | recebe o webhook da Evolution pela rede do compose |
| `scheduling-service` | interna | |
| `evolution-go` | interna | `CONNECT_ON_STARTUP=true` reconecta as instâncias após restart |
| `postgres` | interna | pgvector; um usuário e um banco por serviço |

Os serviços Node aplicam `prisma migrate deploy` antes de subir. Cada serviço
tem healthcheck no compose.

O `validate:core` audita o `docker-compose.prod.yml` em
`scripts/final-production-audit.mjs`: cobertura das env obrigatórias, flags de
laço explícitas, nenhum host de desenvolvimento nem segredo literal, e
contexto de build e Dockerfile existentes.

## Cuidados

- `NEXT_PUBLIC_BFF_URL` é lida no `next build`. Trocar `API_URL` exige rebuild
  do frontend.
- As senhas de banco são lidas só na criação do volume. Trocar depois exige
  `ALTER ROLE` no Postgres.
- Com `app.<domínio>` e `api.<domínio>`, o cookie `lax` funciona porque os dois
  são same-site. Se frontend e API ficarem em domínios registráveis diferentes,
  use `COOKIE_SAME_SITE=none`.
- Backup: o volume `postgres_data` é o único estado. Agende um `pg_dumpall`
  para fora da VM.
