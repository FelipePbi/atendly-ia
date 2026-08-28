# Fronteira da API pública

## TARGET

```text
Internet / Browser
        ↓
      somente BFF
        ├─→ AI Orchestrator (API interna)
        ├─→ Scheduling Service (API interna)
        └─→ Evolution Go (API interna de transporte)
```

BFF é único backend público consumido pelo frontend. Browser não chama diretamente:

- AI Orchestrator;
- Scheduling Service;
- Evolution Go;
- Minha Agenda;
- banco de qualquer serviço.

AI Orchestrator e Scheduling Service não precisam expor CORS ao browser. Evolution Go também não é API de produto para navegador.

## Exceção de integração, não de frontend

Webhook inbound é uma fronteira máquina-a-máquina:

```text
WhatsApp → Evolution Go → AI Orchestrator
```

Esse endpoint precisa ser alcançável e autenticado pelo transporte, mas não integra API pública web nem exige BFF no caminho crítico.

## CURRENT

### Frontend

`apps/frontend` ainda não chama backend. Todas as telas usam cenários/mocks locais; variáveis de URL do BFF estão reservadas e sem consumidor no código.

### BFF

BFF expõe hoje rotas legadas nas categorias:

- health e dependências;
- auth/session;
- onboarding e business settings;
- virtual attendant/persona/automação;
- lifecycle WhatsApp, QR, pairing e contatos;
- ignored contacts;
- conversations/messages/handoff;
- webhook Evolution Go.

Essas rotas descrevem implementação CURRENT, não Public API V1. Frontend novo não as consome. GOAL 11 definirá API pública somente a partir de consumidores reais.

### API transitória

`apps/api` expõe health, páginas legais legadas, webhook legado/direto e rotas `/internal/*`. Rotas internas exigem bearer token/admin token e já usam CORS desabilitado. A existência pública no deploy não as torna API do frontend.

### Evolution Go

Evolution Go expõe API ampla de instância/mensagem/contatos e hoje injeta CORS `*`. Atendly usa subconjunto por clients internos do BFF/API. TARGET não autoriza acesso direto do browser; revisão de deploy e exposição fica para goals responsáveis.

## TRANSITIONAL

BFF mantém rotas legadas enquanto consumidores migram. GOAL 11 define Public API V1; GOAL 12 cria data layer; GOAL 13–16 trocam mocks por adapters BFF. Rotas internas e webhooks mudam nos goals de seus owners, sem abrir acesso direto do browser.

## Autorização e tenant

Fluxo TARGET para requests do browser:

```text
cookie/session
   ↓
BFF autentica User
   ↓
TenantMember validado
   ↓
TenantContext confiável
   ↓
client interno chama owner do domínio
```

- `tenantId` recebido do browser nunca basta para autorização.
- BFF encaminha identidade/tenant por mecanismo interno autenticado.
- Serviço owner revalida contrato interno e aplica tenant scope em toda query operacional.
- Responses públicos usam DTOs; não expõem modelos Prisma, payloads brutos, tokens ou secrets.

## Política de rotas

1. Criar rota pública somente para consumidor real do frontend.
2. Criar rota interna somente para BFF ou serviço autorizado com caso real.
3. Não gerar CRUD completo por antecipação.
4. BFF pode agregar respostas sem assumir ownership dos dados agregados.
5. Serviços internos retornam erros estruturados e request ID/correlation ID.
6. Falha de persistência operacional nunca vira sucesso público.
7. Rotas legadas permanecem enquanto consumidas e saem no GOAL 17 após substituição e busca de consumidores.

## Matriz de acesso TARGET

| Origem | Destino autorizado | Finalidade |
| --- | --- | --- |
| Browser | BFF | Toda experiência web |
| BFF | AI Orchestrator | Conversas, handoff, settings/resultado de IA |
| BFF | Scheduling Service | Calendário, serviços, clientes, appointments, migração |
| BFF | Evolution Go | Lifecycle/status/configuração WhatsApp |
| Evolution Go | AI Orchestrator | Inbound WhatsApp |
| AI Orchestrator | Scheduling Service | Tools determinísticas de agenda |
| AI Orchestrator | Evolution Go | Envio de resposta WhatsApp |
| Scheduling Service | Minha Agenda | CalendarProvider do tenant configurado |
