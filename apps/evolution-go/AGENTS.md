# AGENTS.md — Evolution Go

Responsabilidade: transporte/provedor WhatsApp.

Não adicione lógica de negócio de IA, scheduling, tenant, RAG ou prompts. Evite alterar este fork sem necessidade explícita. Preserve compatibilidade com integrações atuais.

Antes de mudar endpoint, payload ou protocolo, procure consumidores em `apps/bff` e `apps/ai-orchestrator`.
