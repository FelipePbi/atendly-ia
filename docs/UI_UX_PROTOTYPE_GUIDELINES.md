# UI/UX Prototype Guidelines — Atendly

## Missão

Criar e evoluir a interface da Atendly como um produto **mobile-first, simples, elegante e profissional**, desenhado para profissionais autônomos que usam principalmente o celular e podem ter pouca familiaridade com softwares administrativos.

Não é exploração livre. As regras do `docs/product-vault/` são restrições de produto.

## Fonte de verdade

Leia nesta ordem:

1. `docs/product-vault/00-HOME.md`;
2. documento de produto/regra/fluxo relevante;
3. `docs/product-vault/03-UX-UI/`;
4. `apps/frontend-open-design/DESIGN.md` para identidade visual;
5. este guia.

Se houver conflito, o product vault prevalece.

## Resultado central

A interface deve reforçar:

> **A IA atende clientes pelo WhatsApp e controla os agendamentos na Agenda Atendly, enquanto o profissional continua podendo usar o WhatsApp normalmente.**

## Prioridade de dispositivos

1. Mobile
2. Tablet
3. Notebook
4. Desktop

A solução deve nascer no mobile.

Em telas maiores, adicione contexto e densidade apenas quando isso melhorar a operação.

## Qualidade visual

Simplicidade não significa tela crua.

Use de forma criteriosa:

- iconografia consistente;
- assets/ilustrações pontuais;
- microanimações;
- transições;
- skeletons;
- feedback de sucesso;
- empty states trabalhados;
- eventos visuais de IA e agenda.

Evite:

- excesso de cards;
- dashboards cheios de gráficos;
- muitos CTAs com o mesmo peso;
- decoração sem função;
- animações lentas;
- visual infantil ou “robô/assistente personagem”.

## Navegação vigente

### Mobile

Bottom navigation:

1. Início
2. Conversas
3. Agenda
4. Clientes
5. Mais

`Mais`:

- Serviços
- WhatsApp
- IA
- Agenda/configurações
- Negócio
- Importação
- Conta

### Desktop

Sidebar:

- Início
- Conversas
- Agenda
- Clientes
- Serviços
- Configurações

Topbar pode conter estado da IA, notificações e usuário.

## Onboarding

Quatro blocos:

1. Seu negócio
2. Sua agenda
3. Sua IA
4. WhatsApp

Regras:

- uma decisão principal por tela quando fizer sentido;
- dois campos simples relacionados podem compartilhar tela;
- evitar scroll excessivo;
- nunca sacrificar legibilidade para evitar scroll;
- CTA próximo ao rodapé no mobile quando adequado;
- progresso por blocos, não `Etapa 7 de 18`;
- sem menus da área logada durante onboarding;
- progresso salvo por etapa concluída.

### Fluxo

`Boas-vindas → segmento + nome → modalidade → endereço condicional → já usa sistema? → importar ou configurar → serviço/horários mínimos → demonstração → estilo → WhatsApp agora/depois → contatos ignorados → teste real → sucesso`

## Importação Minha Agenda

Nunca desenhar:

- Minha Agenda como agenda ativa;
- sincronização;
- last sync como estado operacional;
- “editar no Minha Agenda”;
- migração Atendly → Minha Agenda;
- troca de fonte.

Desenhar apenas:

- introdução;
- autenticação;
- análise;
- preview;
- conflitos;
- progresso;
- pendências;
- conclusão definitiva;
- histórico da importação após conclusão.

## Home

Mobile deve responder rapidamente:

- A IA está funcionando?
- Existe algo aguardando minha atenção?
- Quais são meus próximos atendimentos?

Métricas são secundárias e compactas.

Desktop pode adicionar mais contexto, mas sem virar BI.

## Conversas

Abas obrigatórias:

- Comercial
- Não classificadas
- Pessoal

Linha da conversa:

- nome;
- última mensagem;
- horário;
- estado relevante.

Estados:

- IA atendendo;
- Aguardando você;
- Você atendendo.

Mobile: chat full-screen.

Tablet landscape: lista + chat.

Desktop amplo: lista + chat + contexto do cliente.

Eventos internos como `Agendamento criado` não devem parecer mensagens comuns.

## Agenda

### Mobile

- Dia como visualização principal;
- seletor horizontal de datas;
- lista cronológica;
- botão `+`;
- não mostrar grade semanal comprimida.

### Desktop

- semana em grade;
- filtros simples;
- diferença clara entre atendimento, compromisso e bloqueio.

Hold aparece discretamente como `Em confirmação`.

## Clientes

Mobile:

- lista + busca;
- nome, telefone e contexto mais relevante;
- perfil em tela própria.

Perfil:

- resumo;
- próximos;
- histórico;
- observações;
- preferências;
- tags;
- métricas básicas.

## Serviços

Lista compacta com:

- nome;
- duração;
- preço;
- status.

Edição em tela própria no mobile.

Representar:

- preço fixo;
- a partir de;
- sob consulta;
- sem preço informado;
- recorrência opcional;
- buffers;
- modalidades;
- regras privadas para IA.

## WhatsApp

### Desktop

QR Code.

### Mobile

Código de vinculação + passos visuais.

Antes de conectar, explicar:

- pode ser número pessoal ou comercial;
- conversas serão organizadas;
- usuário pode ignorar contatos;
- quando ele responde manualmente, a IA sai de cena.

## Teste real

Tela dedicada antes do início.

Durante:

- progresso visual em tempo real;
- permitir abrir WhatsApp no mobile;
- estado preservado ao trocar de app.

Sucesso:

> **Tudo pronto! Sua IA está ativa e pronta para atender seus clientes.**

## IA

Estilos:

- Profissional
- Equilibrada
- Descontraída

Não desenhar “persona”, avatar de robô ou nome próprio da IA.

Na UI, usar `IA`, não `Atendly`, para se referir ao mecanismo automatizado.

## Copy

Português do Brasil.

Tom da plataforma:

- claro;
- direto;
- próximo;
- profissional;
- não técnico.

Evitar `LLM`, `tenant`, `handoff`, `provider`, `sync`, `token`.

Usar linguagem operacional:

- `Aguardando você`;
- `IA ativa`;
- `Reconectar WhatsApp`;
- `Concluir importação`;
- `Criar agendamento`.

## Estados e feedback

Toda ação assíncrona relevante precisa de:

- loading adequado;
- sucesso compreensível;
- erro explicando o que aconteceu;
- ação de recuperação quando possível.

Skeleton para conteúdo; spinner para ações curtas.

Alertas críticos podem usar banner persistente.

## Acessibilidade

- contraste adequado;
- touch target confortável;
- foco visível;
- não depender só de cor;
- ícone + texto quando ação não for óbvia;
- teclado não pode esconder campo/CTA no mobile.

## Tema

MVP em tema claro.

## Regra final

Não preserve uma tela antiga por “fidelidade ao protótipo” se ela representa uma regra substituída. Fidelidade de produto prevalece sobre fidelidade histórica do mockup.
