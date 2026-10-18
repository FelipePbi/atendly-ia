# Produção: VM única com Docker Compose

A plataforma inteira roda em uma VM, com os serviços sempre ligados. A
Evolution Go mantém a sessão do WhatsApp aberta, e a IA roda o inbox e os
lembretes em laço contínuo. Por isso nenhum serviço pode dormir por falta de
tráfego.

O `render.yaml` e o `apps/health-worker` saíram do repositório. O plano free
do Render desligava os serviços ociosos, e o health-worker existia só para
mantê-los acordados. A decisão está em D-172 (`docs/migration/DECISIONS.md`).

## Estado atual (2026-10-15)

| Item | Valor |
| --- | --- |
| App | `https://app.avenly.com.br` (frontend) |
| API pública | `https://api.avenly.com.br` (BFF) |
| Painel do Coolify | `https://coolify.avenly.com.br` |
| Landing | `https://avenly.com.br`, repositório `avenly-lp`, Cloudflare Workers (fora desta VM) |
| VM | Oracle Cloud `avenly-prod`, região `sa-vinhedo-1`, VM.Standard.A1.Flex (ARM), 4 OCPU, 24 GB, disco de ~47 GB, Ubuntu 24.04 |
| Orquestração | Coolify 4.4.6 (recurso `avenly`, build pack Docker Compose, uuid `wxictoixqkxp3uh2h9dgogmk`), Traefik com Let's Encrypt |
| Portas abertas | 22, 80 e 443. O painel do Coolify sai pelo 443, via Traefik |
| DNS | Cloudflare, registros da VM em "DNS only" (nuvem cinza) |
| Deploy | automático: push na `main` com CI verde |
| Backup | diário, na VM e no Object Storage da Oracle |
| E-mail | envio pelo Resend, recebimento pelo Email Routing da Cloudflare |

### Custo

Tudo cabe na camada Always Free da Oracle: a A1 com 4 OCPU e 24 GB, o disco
dentro dos 200 GB, rede e IP público, até 10 TB de saída e 20 GB de Object
Storage. A conta é Pay As You Go só para garantir capacidade ARM e evitar que a
Oracle recupere a VM ociosa. Ela cobra apenas o que passa da faixa grátis. A
estimativa de custo do console na criação da VM não desconta essa faixa.

Um alerta de orçamento de 1 (moeda da conta), com limite em 1%, avisa por
e-mail no primeiro centavo. Gera cobrança: outra VM ou aumentar esta, disco
total acima de 200 GB, backups de volume acima da cota, balanceador ou banco
gerenciado. Resend, Cloudflare e Coolify usam planos grátis. O custo variável
do produto é a API da OpenAI.

## Arquivos

- `docker-compose.prod.yml`: topologia de produção.
- `.env.production.example`: variáveis e como gerar cada segredo.
- `apps/*/Dockerfile`: uma imagem por serviço. Frontend e BFF usam a raiz do
  repositório como contexto de build, porque dependem de `packages/`.
- `infra/postgres/`: imagem do Postgres (pgvector) com o
  `init-databases.sh` embutido, que cria usuário e banco por serviço na
  primeira subida do volume. O script vai dentro da imagem, não por bind
  mount: o Coolify não garante o arquivo do repositório no host, e o Docker
  monta um diretório vazio no lugar. A auditoria
  (`production_config_no_repository_bind_mounts`) reprova bind mount relativo
  no compose.
- `infra/backup/`: backup diário do banco (seção "Backup").

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

## CI/CD

O job `deploy` de `.github/workflows/validate.yml` dispara o deploy no
Coolify. Ele só roda em push na `main` e só depois de `core`, `go-windows` e
`integration` passarem. PR e `workflow_dispatch` nunca publicam. Do push ao ar
são cerca de 25 a 30 minutos: uns 20 de CI e 7 de build no Coolify.

Configuração no GitHub (Settings → Secrets and variables → Actions), já feita:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Variable | `DEPLOY_ENABLED` | `true`; ausente, o job fica pulado |
| Secret | `COOLIFY_DEPLOY_WEBHOOK` | `https://coolify.avenly.com.br/api/v1/deploy?uuid=wxictoixqkxp3uh2h9dgogmk&force=false` |
| Secret | `COOLIFY_API_TOKEN` | token `github-deploy` do Coolify, só com a permissão `deploy` |

O job chama a URL com `POST`: o Coolify 4.4 responde 405 a `GET` em
`/api/v1/deploy`. A API do Coolify está ligada, sem lista de IPs, porque os
runners do GitHub não têm IP fixo.

O auto-deploy por push do recurso está desligado no Coolify. Senão ele
publicaria antes do CI terminar, inclusive commit que vai reprovar.

O job só aciona o deploy, não espera o fim dele. O resultado do build e da
subida fica no painel do Coolify.

### Deploy manual

Para publicar sem push, por exemplo depois de mudar variável no Coolify: no
painel, recurso `avenly` → Deploy. Pela VM, o mesmo pelo tinker:

```bash
sudo docker exec coolify php artisan tinker --execute='queue_application_deployment(application: App\Models\Application::where("uuid","wxictoixqkxp3uh2h9dgogmk")->first(), deployment_uuid: (string) new Visus\Cuid2\Cuid2(), force_rebuild: false);'
```

## Variáveis de ambiente

As variáveis vivem em dois lugares, que precisam ficar iguais:

- **Coolify** (recurso `avenly` → Environment Variables): é o que produção lê.
- **`.env.production`** na máquina do dono, fora do Git: cópia de referência e
  backup dos segredos. O formato é o de `.env.production.example`, sem
  comentários, porque o Coolify recusa comentário ao colar.

Mudar variável no Coolify não publica nada sozinho: é preciso um deploy. As
`AVENLY_*` e a `API_URL` entram no build do frontend, então só aparecem depois
dele. `SERVICE_FQDN_*` e `SERVICE_URL_*` são geradas pelo próprio Coolify.

| Grupo | Variáveis | Estado |
| --- | --- | --- |
| Domínios e cookie | `APP_URL`, `API_URL`, `COOKIE_SAME_SITE` | preenchidas |
| Banco | `POSTGRES_PASSWORD`, `BFF_DB_PASSWORD`, `AI_DB_PASSWORD`, `SCHEDULING_DB_PASSWORD`, `EVOLUTION_DB_PASSWORD` | preenchidas; só valem na criação do volume |
| Segredos internos | `INTERNAL_SERVICE_TOKEN`, `JWT_SECRET`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `INTEGRATION_CREDENTIALS_KEY` | preenchidas |
| Chaves de credencial | `WHATSAPP_CREDENTIAL_KEYS`, `WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID`, `CHANNEL_CREDENTIAL_KEYS`, `CHANNEL_CREDENTIAL_ACTIVE_KEY_ID` | preenchidas |
| IA | `OPENAI_API_KEY`, `OPENAI_MODEL` | preenchidas |
| E-mail | `RESEND_API_KEY`, `EMAIL_FROM` | preenchidas; seção "E-mail" |
| Documentos legais | `AVENLY_*` (razão social, CNPJ, endereço, e-mails, encarregado, fornecedores, retenção, foro) | preenchidas; Termos e Privacidade sem marcadores e indexáveis (`AVENLY_LEGAL_REVIEW_APPROVED` e `AVENLY_LEGAL_INDEXABLE` em `true`) |
| Número oficial | `PLATFORM_WHATSAPP_INSTANCE_ID`, `PLATFORM_WHATSAPP_CREDENTIAL`, `PLATFORM_WHATSAPP_NUMBER` | **vazias**: falta conectar o chip da Avenly (seção "Número oficial da plataforma") |
| Filtro da IA | `AI_REPLY_ONLY_PHONES` | só o número do dono, para testar o fluxo em produção sem a IA responder clientes; esvaziar para liberar a IA a todos |
| Minha Agenda | `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` | **vazia**: a importação da Minha Agenda fica indisponível |

## Cuidados

- `NEXT_PUBLIC_BFF_URL` é lida no `next build`. Trocar `API_URL` exige rebuild
  do frontend.
- As senhas de banco são lidas só na criação do volume. Trocar depois exige
  `ALTER ROLE` no Postgres.
- Com `app.<domínio>` e `api.<domínio>`, o cookie `lax` funciona porque os dois
  são same-site. Se frontend e API ficarem em domínios registráveis diferentes,
  use `COOKIE_SAME_SITE=none`.
- `TRUST_PROXY_HOPS=1` vale com o DNS da Cloudflare em modo "DNS only" (nuvem
  cinza), com só o Traefik na frente do BFF. Com o proxy da Cloudflare ligado
  (nuvem laranja) são dois proxies: use `2` e restrinja as portas 80/443 da VM
  às faixas de IP da Cloudflare. Sem essa restrição, quem acessar a VM direto
  forja o IP do rate limit.
- O build do frontend usa bastante memória. Na VM de 24 GB não há problema; em
  máquina pequena, construa as imagens uma de cada vez.

## Acesso operacional

- **SSH:** `ubuntu@157.151.0.243`, com a chave `avenly_oracle` do dono. Só por
  chave, sem senha.
- **Coolify:** `https://coolify.avenly.com.br`, conta do dono.
- **Evolution Go:** não tem porta pública. O painel (`/manager`) é aberto por
  túnel SSH até o IP do container na rede do compose, que muda a cada deploy:

  ```bash
  ssh -i ~/.ssh/avenly_oracle ubuntu@157.151.0.243 'sudo docker inspect $(sudo docker ps -q --filter label=com.docker.compose.service=evolution-go) --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"'
  ```

  ```bash
  ssh -i ~/.ssh/avenly_oracle -N -L 127.0.0.1:8085:<ip do container>:8080 ubuntu@157.151.0.243
  ```

  Depois, `http://localhost:8085/manager`, com a URL `http://localhost:8085` e
  a `EVOLUTION_API_KEY` como chave.
- **Logs:** no Coolify, recurso `avenly` → Logs, ou `sudo docker logs` na VM.
  Os nomes dos containers trazem o horário do deploy; ache pelo label
  `com.docker.compose.service`.

## Número oficial da plataforma

O teste real da IA no onboarding usa um número da Avenly que simula uma cliente
e escreve para o número do negócio (pergunta 285 do vault). Ele é uma
instância própria na Evolution Go, fora dos vínculos de negócio, lida das
variáveis `PLATFORM_WHATSAPP_*` (`apps/ai-orchestrator/src/config/platform-whatsapp.ts`).
Sem as três, o teste real não é oferecido; o resto funciona.

Para ligar: criar a instância no painel da Evolution Go (seção "Acesso
operacional"), conectar o chip dedicado pelo QR code e preencher as três
variáveis com o ID da instância, o token dela e o número só com dígitos. A
instância só envia, então não precisa de webhook.

## E-mail

O único e-mail do sistema hoje é o de recuperação de senha. Ele sai pelo
[Resend](https://resend.com) quando o BFF tem `RESEND_API_KEY` e
`EMAIL_FROM` (`Avenly <nao-responda@avenly.com.br>`); o domínio do
remetente precisa estar verificado no Resend, com os registros DNS dele na
Cloudflare. Sem as duas variáveis, `forgot-password` responde
`503 CONFIGURATION_ERROR`. O plano grátis do Resend cobre 3.000
e-mails por mês e 100 por dia. A chave do BFF só tem permissão de envio.

O recebimento é o Email Routing da Cloudflare, grátis. Hoje só
`contato@avenly.com.br` existe, encaminhado ao Gmail do dono; outros endereços
são regras novas em Email Routing → Routing rules. No Gmail, um filtro manda
tudo de `@avenly.com.br` para o marcador "Avenly", fora da Caixa de entrada.
As respostas saem como `contato@` pelo "Enviar e-mail como" do Gmail, via SMTP
do Resend (`smtp.resend.com:465`, usuário `resend`), com uma chave própria
(`gmail-contato`), separada da chave do BFF.

## DNS (zona `avenly.com.br` na Cloudflare)

| Registro | Tipo | Valor | Para quê |
| --- | --- | --- | --- |
| `avenly.com.br` | Worker | `avenly-lp` (proxy) | landing |
| `www` | AAAA | `100::` (proxy) + Redirect Rule 301 | `www` para o domínio sem `www` |
| `app`, `api`, `coolify` | A | `157.151.0.243` (DNS only) | VM |
| `avenly.com.br` | MX | `route1/2/3.mx.cloudflare.net` | recebimento (Email Routing) |
| `avenly.com.br` | TXT | `v=spf1 include:_spf.mx.cloudflare.net ~all` | SPF do Email Routing |
| `cf2024-1._domainkey` | TXT | chave DKIM da Cloudflare | Email Routing |
| `resend._domainkey` | TXT | chave DKIM do Resend | envio |
| `send` | CNAME | `send.forge.rmta.net` (DNS only) | SPF e retorno do Resend |
| `rsend` | CNAME | `rsend-sae1.forge.rmta.net` (DNS only) | Resend, região São Paulo |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | DMARC |

Os registros da VM ficam em "DNS only" por causa do `TRUST_PROXY_HOPS=1` e do
certificado do Let's Encrypt emitido pelo Traefik.

## Backup

O volume `postgres_data` é o único estado da aplicação. O backup diário roda na
VM por um timer do systemd, com os arquivos de `infra/backup/`:

- `avenly-db-backup.sh` (em `/usr/local/bin/`) grava, em
  `/var/backups/avenly/<data UTC>/`, um `pg_dump -Fc` de cada banco do Postgres
  do compose, os roles (`globals.sql`), o banco do Coolify e um `SHA256SUMS`.
  Cada dump passa por `pg_restore --list` antes de ser aceito. O container é
  achado pelos labels do compose, porque o nome muda a cada deploy.
- `avenly-db-backup.timer` dispara às 06:30 UTC (03:30 de Brasília), com
  `Persistent=true`: se a VM estava desligada, o backup roda ao ligar.
- Ficam os últimos 14 dias. O diretório é só do root.
- `restore-check.sh` restaura o backup mais recente num Postgres descartável e
  conta as tabelas de cada banco. Rode depois de mudar o script.

Comandos na VM:

```bash
sudo systemctl start avenly-db-backup.service     # backup agora
sudo journalctl -u avenly-db-backup.service -n 20 # resultado do último
systemctl list-timers avenly-db-backup.timer      # próxima execução
```

Restaurar um banco (com a aplicação parada para ele):

```bash
sudo docker exec -i <container postgres> pg_restore -U postgres -d <banco> --clean --if-exists < /var/backups/avenly/<data>/<banco>.dump
```

### Cópia fora da VM

Cada backup também vai para o bucket privado `avenly-db-backups` do Object
Storage da Oracle (região `sa-vinhedo-1`), em `<data UTC>/<arquivo>`, com o
`SHA256SUMS` por último. Usa o OCI CLI da VM (`/opt/oci-cli`, link em
`/usr/local/bin/oci`), autenticado pelo instance principal: sem senha nem
token na VM.

- Grupo dinâmico `avenly-backup` (domínio Default): só a instância
  `avenly-prod`.
- Política `avenly-backup` (root): o grupo só tem `OBJECT_CREATE` e
  `OBJECT_INSPECT` no bucket. A VM cria e lista; não lê, não apaga nem
  sobrescreve (o upload usa `--no-overwrite`). Quem invadir a VM não destrói as
  cópias.
- A mesma política deixa o serviço `objectstorage-sa-vinhedo-1` gerenciar
  objetos, para a regra de ciclo de vida `apagar-30-dias` do bucket apagar o
  que passa de 30 dias.

Para restaurar a partir do bucket, baixe a pasta da data pelo console (ou por
um usuário com leitura) e use o `pg_restore` acima. A cópia fica no mesmo
provedor da VM: cobre a perda da VM, não a perda da conta Oracle.

## Pendências

- Conectar o número oficial da plataforma e preencher as `PLATFORM_WHATSAPP_*`.
- `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL`, se a importação da Minha Agenda for
  oferecida.
- Uma segunda cópia do backup fora da Oracle (por exemplo, R2 da Cloudflare),
  para cobrir a perda da conta.
- Alerta externo de e-mail (A-05/A-06) segue sem implementação (U-03).
