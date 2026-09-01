# ADR 007 — GOAL 17 legacy cleanup

## Status

Concluído em 2026-09-01.

## Resultado

O runtime V1 deixou de manter implementações paralelas para contratos já migrados. A limpeza preserva a UI aprovada, os owners de domínio e os fluxos concluídos até o GOAL 16.

## Remoções por aplicação

### Frontend

- removidos services mock sem consumidor;
- mantidos somente `MockAuthService` e fixtures usadas pelo catálogo `/_preview`;
- produto continua usando exclusivamente os adapters BFF.

### BFF

- removidas rotas pré-V1 de auth, onboarding, settings e WhatsApp que não eram registradas;
- removidos clients/services antigos de persona, Evolution Go e AI Orchestrator;
- removidos `UserProfile`, imports de conversa para persona, contatos ignorados e campos de identidade/sexo/persona customizada;
- removida a tabela duplicada `BusinessSettings`; `BusinessProfile` é a única fonte tenant-scoped de nome e timezone;
- substituído `UserSettings` por `AiSettings` tenant-scoped, limitado a `PROFESSIONAL_OBJECTIVE` e `LIGHT_CLOSE`;
- configurações históricas `CUSTOM` são migradas para `LIGHT_CLOSE`, o tom V1 mais próximo, sem preservar instruções customizadas;
- removidos testes órfãos ligados exclusivamente às rotas apagadas.

### AI Orchestrator

- removidos endpoints internos sem consumidor para dispatch, bot e handoff agregado; o lifecycle V1 permanece nas rotas de conversa;
- removidas rotas legais, que pertencem ao frontend/BFF;
- substituído o adapter antigo pelo `InboundMessageProcessor`, ligado diretamente ao runtime LangGraph persistente;
- removidos módulos de configuração ampla de negócio e identidade da atendente;
- contexto sincronizado foi reduzido a `businessName` e `timezone`, e a configuração da IA aos dois tons aprovados;
- removidos fallbacks globais de instância/token WhatsApp; as credenciais são fornecidas somente no fluxo tenant-scoped já resolvido;
- mantido `LangChainModelProvider` como único consumidor de OpenAI. Não havia client HTTP OpenAI paralelo.

### Scheduling Service

Nenhum adapter temporário foi encontrado. `migrationAvailabilityRules` tem consumidor ativo no provider Minha Agenda e participa da migração assistida entregue no GOAL 16; portanto não é legado. Minha Agenda permanece corretamente encapsulada pelo Scheduling Service.

## Dependências e configuração

As dependências declaradas dos quatro apps foram confrontadas com imports e scripts ativos. Não foi identificada dependência direta órfã. Foram removidos o smoke script das rotas pré-V1 e variáveis antigas de provider, instância global, admin token e políticas comerciais duplicadas.

## Ocorrências históricas justificadas

Termos removidos ainda podem aparecer somente nestes contextos não executáveis ou necessários:

- migrations Prisma anteriores, que são histórico imutável, e a migration do GOAL 17, que precisa nomear estruturas antigas para migrá-las;
- documentos de goals/roadmap e este registro arquitetural;
- `apps/frontend-open-design`, preservado como contrato visual histórico;
- código/protocolo do Evolution Go quando a nomenclatura pertence ao provider;
- fixtures `mock*` usadas exclusivamente por `/_preview`.

Não há ocorrência dos conceitos removidos no código ativo dos boundaries auditados.
