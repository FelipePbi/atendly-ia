# Plano de Refatoração de Produto — Atendly

## Objetivo

Alinhar a experiência existente, protótipos e documentação do repositório ao produto definido em `docs/product-vault/`, sem antecipar decisões de arquitetura técnica.

Este plano descreve **o que precisa deixar de representar o produto antigo** e **qual comportamento deve ser refletido na experiência nova**.

## Mudança central

### Antes

O produto foi desenhado para permitir duas fontes oficiais de calendário:

- Agenda Atendly;
- Minha Agenda.

### Agora

A regra é única:

> **Agenda Atendly é a agenda oficial de todos os negócios.**

Minha Agenda existe somente como origem de uma única importação de dados.

## Frentes de refatoração

### 1. Documentação

Remover ou marcar como histórica qualquer afirmação de:

- escolha permanente de fonte de agenda;
- sincronização com Minha Agenda;
- reimportação;
- migração Atendly → Minha Agenda;
- edição “no sistema externo”; 
- status de sincronização como estado operacional principal.

Atualizar todas as fontes para apontar ao product vault.

### 2. Onboarding

Fluxo vigente:

1. cadastro;
2. Seu negócio;
3. pergunta sobre sistema atual;
4. importar agora / depois / começar do zero;
5. serviço(s) e horários mínimos quando necessário;
6. demonstração automática da IA;
7. escolha do estilo;
8. conexão do WhatsApp opcional;
9. contatos ignorados opcional;
10. teste real;
11. IA ativa ou Home com checklist caso WhatsApp tenha sido pulado.

Não mostrar escolha “Agenda Atendly vs Minha Agenda”.

### 3. Importação

A experiência deve ser de **migração única**:

`Conectar → analisar → preview → conflitos → importar → revisar pendências → concluir`

Após conclusão:

- não mostrar nova importação;
- exibir somente histórico;
- informar que alterações futuras no Minha Agenda não serão refletidas.

### 4. Agenda

Agenda deve assumir controle completo da operação:

- serviços;
- clientes;
- disponibilidade;
- bloqueios;
- compromissos pessoais;
- agendamentos;
- remarcações;
- cancelamentos;
- recorrência por serviço.

Mobile: foco em dia/lista.

Desktop: semana em grade.

### 5. Conversas

Estrutura principal:

- Comercial;
- Não classificadas;
- Pessoal.

Estados visíveis:

- IA atendendo;
- Aguardando você;
- Você atendendo.

Adicionar/representar:

- contatos em Ignorar IA;
- número pessoal ou comercial;
- pausa automática da IA quando humano responde;
- áudio com transcrição/compreensão;
- imagem → handoff;
- sugestões de resposta durante atendimento humano.

### 6. IA

Substituir tons/personas antigos por:

- Profissional;
- Equilibrada — padrão;
- Descontraída.

Não usar nome/persona para a IA.

Não chamar a IA de “Atendly”; Atendly é a plataforma.

### 7. Home

Prioridade:

1. status da IA/WhatsApp;
2. pendências;
3. próximos atendimentos;
4. poucas métricas operacionais.

Remover como requisito principal:

- horas economizadas sem base confiável;
- receita estimada como métrica central;
- status de integração de calendário externo.

### 8. Serviços e clientes

Garantir representação das regras atuais:

- preço fixo / a partir de / sob consulta / não informado;
- duração obrigatória;
- recorrência opcional por serviço;
- multi-serviço;
- observações privadas autorizáveis para IA;
- relações entre clientes;
- histórico e preferências.

### 9. WhatsApp e ativação

Desktop: QR Code.

Mobile: código de vinculação + instruções.

Depois de conectar:

- confirmação do número;
- contatos ignorados opcionais;
- teste real enviado por número oficial da Atendly;
- sucesso ativa IA automaticamente.

### 10. UX mobile-first

Prioridade de projeto:

**Mobile → Tablet → Notebook → Desktop**

Não adaptar desktop para celular. Criar o fluxo mobile como experiência base e adicionar contexto progressivamente.

## Critério de conclusão desta refatoração de produto

Considerar alinhado quando:

- nenhuma tela ativa trata Minha Agenda como agenda operacional;
- onboarding segue quatro blocos vigentes;
- IA usa três estilos atuais;
- navegação mobile usa cinco itens principais;
- Agenda e Conversas refletem regras vigentes;
- documentos antigos não contradizem `docs/product-vault/`;
- estados vazios, loading, erros e handoff estão coerentes com UX atual.

## Fora deste documento

Este plano não decide:

- desenho de serviços/backend;
- persistência;
- APIs;
- filas;
- infraestrutura;
- estratégia de migração técnica de dados internos;
- remoção de código legado.

Essas decisões devem ser feitas em uma etapa técnica separada, depois do alinhamento de produto.
