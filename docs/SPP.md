Spec-Driven Development — Serviço WhatsApp com Evolution Go
0. Contexto técnico

Você já tem uma API Node que foi pensada para a API oficial do WhatsApp/Meta. O problema é que agora o canal de entrada/saída será o Evolution Go, que funciona como gateway WhatsApp via dispositivo vinculado.

O Evolution Go se apresenta como uma API WhatsApp em Go, com endpoints REST, Swagger, eventos em tempo real por Webhook/WebSocket/AMQP/NATS, QR Code para pareamento, persistência opcional em PostgreSQL e suporte a Docker.

Na prática, a refatoração correta não é “trocar endpoint da Meta por endpoint do Evolution” dentro da regra de negócio. O correto é criar uma camada de provider/adapters:

Webhook Evolution Go
  ↓
Adapter Evolution
  ↓
Contrato interno da sua API
  ↓
IA / agenda / preços / regras do salão
  ↓
Provider Evolution
  ↓
Resposta no WhatsApp

O pacote que montei segue exatamente essa arquitetura.

1. Objetivo do MVP

Criar um serviço simples, dockerizado, que:

Suba a API Node, Evolution Go e bancos via docker compose.
Receba webhooks do Evolution Go.
Normalize mensagens do Evolution para um contrato interno único.
Reaproveite sua lógica atual de IA, agenda, preços e agendamentos.
Envie respostas pelo Evolution Go.
Permita atendimento humano pelo celular sem o bot responder por cima.
Mantenha a possibilidade futura de voltar para a API oficial, se necessário.
2. Estrutura inicial proposta

O pacote tem esta estrutura:

salao-evolution-spec/
├── README.md
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── docker/
│   └── postgres/
│       └── evolution-init.sql
├── docs/
│   └── specs/
│       ├── 00-visao.md
│       ├── 01-requisitos.md
│       ├── 02-arquitetura.md
│       ├── 03-contratos.md
│       ├── 04-refatoracao.md
│       ├── 05-docker.md
│       ├── 06-testes-aceite.md
│       └── 07-runbook-local.md
├── scripts/
│   └── send-sample-webhook.mjs
└── src/
    ├── server.ts
    ├── config/
    │   └── env.ts
    ├── routes/
    │   └── evolutionWebhook.routes.ts
    ├── modules/
    │   ├── automation/
    │   │   ├── ExistingSalonAutomationFacade.ts
    │   │   └── MessageOrchestrator.ts
    │   ├── channel/
    │   │   ├── domain/
    │   │   │   └── ChannelMessage.ts
    │   │   ├── ports/
    │   │   │   └── WhatsAppProvider.ts
    │   │   └── adapters/
    │   │       ├── evolution/
    │   │       │   ├── EvolutionInboundMapper.ts
    │   │       │   ├── EvolutionProvider.ts
    │   │       │   └── EvolutionTypes.ts
    │   │       └── meta/
    │   │           └── MetaProvider.placeholder.ts
    │   ├── handoff/
    │   │   └── HandoffService.ts
    │   └── idempotency/
    │       └── IdempotencyStore.ts
    └── shared/
        └── logger.ts
3. Serviços Docker

A stack inicial usa quatro serviços.

api

Sua API Node refatorada.

Responsabilidades:

- receber webhook do Evolution Go;
- validar token simples;
- normalizar payload;
- aplicar idempotência;
- detectar atendimento humano;
- chamar sua IA/agendamento;
- responder pelo Evolution Go.
evolution-go

Gateway WhatsApp.

A documentação oficial mostra instalação com Docker Compose, variáveis como SERVER_PORT, GLOBAL_API_KEY, POSTGRES_AUTH_DB, POSTGRES_USERS_DB, DATABASE_SAVE_MESSAGES, WADEBUG e LOGTYPE.

evogo-postgres

PostgreSQL usado pelo Evolution Go.

O pacote cria dois bancos:

evogo_auth
evogo_users
api-postgres

PostgreSQL opcional para a sua API local, caso você queira rodar agenda/preços em banco local durante desenvolvimento.

4. docker-compose.yml base

O pacote já inclui um docker-compose.yml. O ponto mais importante é que o webhook configurado no Evolution deve apontar para o hostname interno Docker:

http://api:3000/webhooks/evolution?token=<EVOLUTION_WEBHOOK_TOKEN>

Não use localhost nesse campo quando o Evolution estiver em container, porque localhost dentro do container do Evolution aponta para ele mesmo, não para a API Node.

O Evolution Go fica exposto localmente em:

http://localhost:8080

A API Node fica em:

http://localhost:3000

A documentação do Evolution Go também indica Swagger em /swagger/index.html.

5. Variáveis de ambiente principais

Arquivo .env.example:

NODE_ENV=development
API_PORT=3000
LOG_LEVEL=debug

CHANNEL_PROVIDER=evolution-go

EVOLUTION_WEBHOOK_TOKEN=troque-este-token

EVOLUTION_BASE_URL=http://evolution-go:8080
EVOLUTION_API_KEY=troque-esta-chave-global
EVOLUTION_INSTANCE_ID=
EVOLUTION_INSTANCE_NAME=salao-principal
EVOLUTION_SEND_TEXT_PATH=/send/text
EVOLUTION_IGNORE_GROUPS=true
EVOLUTION_BOT_ENABLED=true

HUMAN_HANDOFF_PAUSE_MINUTES=120

DATABASE_URL=postgresql://app:app@api-postgres:5432/salao?sslmode=disable

API_POSTGRES_USER=app
API_POSTGRES_PASSWORD=app
API_POSTGRES_DB=salao

EVOGO_POSTGRES_USER=postgres
EVOGO_POSTGRES_PASSWORD=postgres
EVOGO_AUTH_DB=evogo_auth
EVOGO_USERS_DB=evogo_users

A variável mais importante para manter flexibilidade é:

EVOLUTION_SEND_TEXT_PATH=/send/text

A referência atual do Evolution Go mostra envio de texto em POST /send/text, com body contendo campos como number e text. Já o README do repositório ainda lista endpoints-chave como /message/sendText, então deixei o caminho configurável para você ajustar conforme a versão real exposta no Swagger do seu container.

6. Contrato interno da API

O centro da refatoração é este contrato:

export interface ChannelInboundMessage {
  provider: 'evolution-go' | 'meta-official';
  instanceId: string;
  messageId: string;
  chatId: string;
  customerPhone: string;
  customerName?: string;
  fromMe: boolean;
  isGroup: boolean;
  kind: 'text' | 'audio' | 'image' | 'document' | 'unknown';
  text?: string;
  timestamp?: string;
  raw: unknown;
}

Sua IA/agendamento deve receber isso, e não o payload bruto do Evolution nem o payload bruto da Meta.

7. Contrato do provider de saída
export interface WhatsAppProvider {
  sendText(input: {
    to: string;
    text: string;
    quotedMessageId?: string;
    correlationId?: string;
  }): Promise<{
    provider: 'evolution-go' | 'meta-official';
    messageId?: string;
    raw: unknown;
  }>;
}

Com isso, sua regra de negócio passa a chamar:

await provider.sendText({
  to: message.customerPhone,
  text: respostaDaIA
});

E não:

await metaClient.messages.create(...)

nem:

await evolutionClient.post(...)

A regra de negócio não sabe qual provider está por trás.

8. Fluxo de webhook

O Evolution Go permite configurar o webhook no momento da conexão da instância usando POST /instance/connect, com headers como apikey e instanceId, e body com webhookUrl, subscribe e immediate.

A configuração recomendada para o MVP:

{
  "webhookUrl": "http://api:3000/webhooks/evolution?token=troque-este-token",
  "subscribe": ["MESSAGE", "SEND_MESSAGE", "CONNECTION", "QRCODE"],
  "immediate": true
}

A documentação lista eventos como MESSAGE, SEND_MESSAGE, CONNECTION, QRCODE, READ_RECEIPT, CALL, LABEL, CONTACT, GROUP e outros. Para o MVP, eu restringiria a lista a MESSAGE, SEND_MESSAGE, CONNECTION e QRCODE para evitar ruído.

O endpoint da sua API deve responder HTTP 2xx rapidamente. A documentação do Evolution Go informa que, se o endpoint não responder 2xx dentro de 30 segundos, ele tenta reenviar até 5 vezes com intervalo de 30 segundos.

Por isso, o código do pacote responde primeiro:

res.status(200).json({ ok: true, received: true });

E processa depois.

9. Payload recebido do Evolution

Exemplo esperado:

{
  "event": "Message",
  "instanceId": "249aad2e-68f9-464f-bc84-aca560c38f0e",
  "instanceToken": "token",
  "data": {
    "Info": {
      "Chat": "5511999999999@s.whatsapp.net",
      "Sender": "5511999999999@s.whatsapp.net",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB0C05FF2D3A0068B2A2D",
      "Type": "text",
      "PushName": "Maria",
      "Timestamp": "2026-05-24T12:00:00-03:00",
      "MediaType": ""
    },
    "Message": {
      "conversation": "quanto custa manicure?"
    }
  }
}

O Evolution Go documenta que eventos Message usam data.Info para metadados e data.Message para o conteúdo, incluindo campos como Info.Chat, Info.Sender, Info.IsFromMe, Info.IsGroup, Info.ID, Info.PushName, Info.Timestamp e Message.conversation.

10. Normalização

O adapter transforma:

{
  "data": {
    "Info": {
      "Chat": "5511999999999@s.whatsapp.net",
      "ID": "3EB0C05FF2D3A0068B2A2D",
      "PushName": "Maria"
    },
    "Message": {
      "conversation": "quanto custa manicure?"
    }
  }
}

em:

{
  "provider": "evolution-go",
  "messageId": "3EB0C05FF2D3A0068B2A2D",
  "chatId": "5511999999999@s.whatsapp.net",
  "customerPhone": "5511999999999",
  "customerName": "Maria",
  "kind": "text",
  "text": "quanto custa manicure?"
}
11. Handoff humano

Esse ponto é crítico para o seu caso.

Regra inicial proposta:

Se a mensagem recebida tem fromMe=true
  e não foi enviada pelo bot
então pausar o bot naquele chat por 120 minutos.

Também deixei comandos simples:

/bot off
/bot on

Fluxo:

Cliente fala
  ↓
IA responde
  ↓
Você pega o celular e responde manualmente
  ↓
Sistema detecta fromMe=true
  ↓
Bot pausa aquela conversa

Isso evita a IA responder por cima de você.

12. Idempotência

Como webhooks podem ser reenviados, o MVP usa chave:

provider:instanceId:messageId

Exemplo:

evolution-go:249aad2e-68f9-464f-bc84-aca560c38f0e:3EB0C05FF2D3A0068B2A2D

No pacote inicial isso está em memória. Para produção, mover para Redis ou banco.

13. Como encaixar sua API atual

No pacote, o arquivo provisório é:

src/modules/automation/ExistingSalonAutomationFacade.ts

Hoje ele só responde uma mensagem de teste:

return {
  replyText: `Recebi: "${message.text}". Integração Evolution Go -> API Node funcionando.`
};

Você deve trocar por algo assim:

export class ExistingSalonAutomationFacade {
  constructor(private readonly salonAgent: SalonAgent) {}

  async handleInboundMessage(message: ChannelInboundMessage) {
    return this.salonAgent.process({
      channel: 'whatsapp',
      provider: message.provider,
      phone: message.customerPhone,
      name: message.customerName,
      text: message.text,
      messageId: message.messageId
    });
  }
}

A sua lógica atual de:

detectar intenção
consultar serviços
consultar preços
consultar agenda
agendar
remarcar
cancelar
responder dúvidas

continua onde está. Só muda o formato da entrada e o provider de saída.

14. Runbook local
14.1. Subir stack
cp .env.example .env

Edite:

EVOLUTION_API_KEY=uma-chave-forte
EVOLUTION_WEBHOOK_TOKEN=outro-token-forte

Depois:

docker compose up --build
14.2. Testar API
curl http://localhost:3000/health

Resposta esperada:

{
  "ok": true,
  "service": "salao-whatsapp-api",
  "provider": "evolution-go"
}
14.3. Ativar Evolution Go, se necessário

O README do Evolution Go informa que ele pode exigir ativação de licença no primeiro uso; nesse caso, endpoints retornam 503 até ativar pelo Manager em /manager/login.

Acesse:

http://localhost:8080/manager/login
14.4. Criar instância
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: sua-chave-forte" \
  -d '{
    "instanceName": "salao-principal",
    "integration": "WHATSAPP-BAILEYS"
  }'

A documentação de instalação mostra o fluxo de criação de instância com POST /instance/create e integration: "WHATSAPP-BAILEYS".

Guarde o instanceId retornado e coloque no .env:

EVOLUTION_INSTANCE_ID=<uuid-retornado>

Reinicie a API:

docker compose restart api
14.5. Conectar instância com webhook
curl -X POST http://localhost:8080/instance/connect \
  -H "Content-Type: application/json" \
  -H "apikey: sua-chave-forte" \
  -H "instanceId: <uuid-retornado>" \
  -d '{
    "webhookUrl": "http://api:3000/webhooks/evolution?token=troque-este-token",
    "subscribe": ["MESSAGE", "SEND_MESSAGE", "CONNECTION", "QRCODE"],
    "immediate": true
  }'

Depois de conectar, a documentação descreve o pareamento por QR Code em WhatsApp > Dispositivos conectados > Conectar dispositivo, e também informa que eventos como PairSuccess, Connected e OfflineSyncCompleted indicam conexão bem-sucedida.

15. Critérios de aceite
CA-001 — Stack sobe
docker compose up --build

Deve subir:

api
api-postgres
evogo-postgres
evolution-go
CA-002 — Healthcheck responde
curl http://localhost:3000/health

Deve retornar ok=true.

CA-003 — Token inválido é rejeitado
curl -i -X POST http://localhost:3000/webhooks/evolution?token=errado \
  -H 'Content-Type: application/json' \
  -d '{}'

Deve retornar:

401 Unauthorized
CA-004 — Webhook válido é aceito
EVOLUTION_WEBHOOK_TOKEN=troque-este-token npm run test:webhook

Deve retornar 200.

CA-005 — Mensagem duplicada é ignorada

Enviar duas vezes o mesmo data.Info.ID.

Resultado esperado:

primeiro evento processado
segundo evento ignorado
CA-006 — Grupo é ignorado

Payload com:

{
  "data": {
    "Info": {
      "IsGroup": true
    }
  }
}

Resultado esperado:

não chamar IA
não enviar resposta
CA-007 — Intervenção humana pausa o bot

Payload com:

{
  "data": {
    "Info": {
      "IsFromMe": true
    }
  }
}

Resultado esperado:

chat pausado por HUMAN_HANDOFF_PAUSE_MINUTES
CA-008 — Resposta usa EvolutionProvider

Quando a IA gerar resposta, a API deve chamar:

POST http://evolution-go:8080/send/text

com:

{
  "number": "5511999999999",
  "text": "resposta"
}
16. O que eu deixei pronto no pacote

O pacote já contém:

✅ docker-compose.yml
✅ Dockerfile
✅ .env.example
✅ API Express em TypeScript
✅ endpoint POST /webhooks/evolution
✅ validação simples por token
✅ mapper Evolution -> contrato interno
✅ provider Evolution para envio de texto
✅ idempotência em memória
✅ handoff humano simples
✅ facade para encaixar sua IA/agendamento existente
✅ specs em Markdown
✅ runbook local
✅ script de teste de webhook