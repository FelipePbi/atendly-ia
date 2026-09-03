---
title: Perguntas e Respostas da Entrevista de Produto
aliases: [Decision Log Atendly, Entrevista Atendly]
tags: [atendly, decisoes, entrevista, produto, ux]
status: referencia
---

# Perguntas e Respostas da Entrevista de Produto

Este arquivo registra a entrevista de produto realizada para redefinir a Atendly.

## Como ler

- **Vigente**: decisão faz parte da especificação atual.
- **Substituída**: uma decisão posterior prevalece.
- **Descartada**: pergunta/ramificação perdeu validade porque a premissa foi removida.
- Quando o usuário respondeu **“Todas recomendadas”**, a alternativa recomendada foi registrada como resposta.
- Este vault é de **produto e UX/UI**. Quando uma pergunta entrou em detalhe puramente técnico, o registro preserva apenas a intenção de produto, sem transformar este documento em especificação de engenharia.

---

# Rodada 1 — Fundamentos do produto

1. **Qual é a identidade central da Atendly?** — **B — Atendente de WhatsApp que também controla a agenda.** **Vigente.** A agenda é infraestrutura essencial; o valor percebido principal é automação do atendimento.
2. **Quem pode operar o MVP?** — **C — Interface focada em autônomo, conceito preparado para profissional/recurso.** **Vigente no nível de produto**, porém o MVP expõe apenas um profissional.
3. **Como a importação aparece no onboarding?** — **A — Perguntar se já usa sistema para organizar agendamentos.** **Vigente.**
4. **Minha Agenda deve aparecer explicitamente?** — **C — Tela genérica de origem preparada conceitualmente para fontes, com Minha Agenda disponível.** **Vigente**, sem prometer integrações futuras na UI.
5. **O que acontece com a relação com Minha Agenda após importação?** — **A — Encerra; sem conexão contínua.** **Vigente.**
6. **Pode importar novamente mais tarde?** — **A inicialmente. Substituída.** Posteriormente foi decidido que existe apenas **uma importação concluída por negócio**.
7. **Conflitos da importação?** — **B — Usuário decide conflitos.** **Vigente apenas para a primeira importação.**
8. **Quanto histórico importar?** — **B — Tudo tecnicamente possível.** **Vigente.**
9. **Pode entrar no produto sem agenda plenamente utilizável?** — **C — Pode entrar, mas IA fica bloqueada até requisitos mínimos.** **Vigente.**
10. **Objetivo principal do onboarding?** — **B — Levar ao primeiro valor rapidamente e deixar complementos para depois.** **Vigente.**

# Rodada 2 — Ativação, onboarding e importação

11. **O que é o primeiro valor percebido?** — **B — Ver a IA simulando conversa real com dados do negócio.** **Vigente.**
12. **Quando conectar WhatsApp?** — **C — Oferecer no onboarding, mas permitir pular.** **Vigente.**
13. **Como fica a Home se faltam configurações?** — **B — Checklist destacado de ativação.** **Vigente.**
14. **Requisitos para ativar IA?** — **C — Serviço + disponibilidade + WhatsApp + teste bem-sucedido.** **Vigente**, com teste real definido depois.
15. **Tom da IA deve ter etapa própria?** — **C — Configurar em torno da demonstração da IA.** **Vigente.**
16. **Quem já usa sistema deve ser incentivado a importar?** — **A — Sim, importação é caminho principal.** **Vigente.**
17. **Usuário escolhe o que importar?** — **C — Importar tudo por padrão, com escolha avançada.** **Vigente.**
18. **Dados externos imperfeitos?** — **B — Importar válidos e separar pendências.** **Vigente.**
19. **Importação parcial permite continuar?** — **B — Sim, se requisitos mínimos estiverem válidos.** **Vigente.**
20. **Agendamentos passados importados aparecem onde?** — **B — Na agenda ao navegar ao passado e no histórico do cliente.** **Vigente.**
21. **Mostrar origem dos registros?** — **B — Guardar e exibir somente quando relevante/detalhes.** **Vigente conceitualmente.**
22. **Como funcionaria reimportação?** — **A — Comparar diferenças.** **Descartada.** Reimportação foi removida.
23. **Como reconciliar agendamentos em reimportação?** — **C — ID externo + heurística.** **Descartada para produto atual.**
24. **Como apresentar outros sistemas no MVP?** — **B — UI genérica, mas apenas Minha Agenda disponível.** **Vigente.**

# Rodada 3 — Agenda e múltiplos profissionais

25. **MVP permite cadastrar mais de um profissional?** — **A — Não.** **Vigente.**
26. **Quem é o profissional principal?** — **A na experiência.** A conta cria/representa o primeiro profissional. **Vigente.**
27. **A quem pertence um serviço?** — **C — Ao negócio, com possibilidade futura de associação a profissionais.** **Vigente conceitualmente.**
28. **Preço/duração variam por profissional?** — **A — Não no MVP.** **Vigente.**
29. **Como funciona disponibilidade?** — **C — Horário geral e conceito de disponibilidade por profissional, mas experiência simplificada.** **Vigente no produto atual como “meus horários”.**
30. **O que ocupa o horário?** — **B — Duração + buffers.** **Vigente.**
31. **Intervalo entre atendimentos?** — **C — Configurável por serviço.** **Vigente.**
32. **Cliente pode agendar vários serviços juntos?** — **B — Sim.** **Vigente.**
33. **Como calcular duração multi-serviço?** — **A — Somar durações.** **Vigente.**
34. **Agendamento precisa de cliente?** — **A — Sim.** **Vigente.**
35. **Identificador importante de cliente?** — **C — Cliente tem identidade própria; telefone é identificador operacional.** **Vigente.**
36. **IA cadastra cliente automaticamente?** — **B — Somente ao confirmar um agendamento.** **Vigente.**
37. **Futuro “qualquer profissional”: como escolher?** — **A — Primeiro disponível.** **Futuro, fora da UI do MVP.**
38. **Agenda aceita compromissos não relacionados a clientes?** — **B — Sim, compromisso pessoal.** **Vigente.**
39. **Como tratar bloqueios?** — **B — Podem ter título/motivo e recorrência.** **Vigente.**
40. **Reimportação exige autenticação novamente?** — **A.** **Descartada como reimportação; primeira importação continua sem conexão permanente.**
41. **Manter metadados de origem?** — **A.** **Vigente apenas como rastreabilidade de importação; detalhes técnicos fora deste vault.**

# Rodada 4 — Serviços, clientes e estados de agendamento

42. **Usuário e profissional devem ser conceitos separados?** — **B.** **Vigente conceitualmente**, sem expor complexidade na UI.
43. **O que representa o negócio?** — **B — Unidade principal que agrupa operação.** **Vigente.**
44. **Serviço precisa de preço?** — **C — Fixo, a partir de ou sob consulta; depois também foi aceito sem preço informado.** **Vigente.**
45. **Serviço precisa de duração?** — **A — Sim.** **Vigente.**
46. **Granularidade de duração?** — **B — Passos de 5 min.** **Vigente como UX.**
47. **Buffers por serviço?** — **B — Antes e depois separadamente.** **Vigente.**
48. **Buffers entre serviços de um multi-serviço?** — **B — Aplicar apenas externamente, não entre cada serviço.** **Vigente.**
49. **A ordem dos serviços importa?** — **A — Não no MVP.** **Vigente.**
50. **IA pode entender combinação de serviços?** — **A — Sim.** **Vigente.**
51. **Combos como entidade própria?** — **B — Não.** **Vigente.**
52. **Estados do agendamento?** — **C — Confirmado, concluído, cancelado, não compareceu.** **Vigente.**
53. **Quando IA cria o agendamento?** — **B — Após confirmação explícita final.** **Vigente.**
54. **Reservar horário durante conversa?** — **B — Hold temporário.** **Vigente.**
55. **Duração do hold?** — **B — 5 minutos.** **Vigente.**
56. **Cliente pode remarcar pelo WhatsApp?** — **B — Sim, respeitando política.** **Vigente.**
57. **Cliente pode cancelar pelo WhatsApp?** — **B — Sim, respeitando política.** **Vigente.**
58. **Pedido fora da política?** — **B — Explicar regra e oferecer humano.** **Vigente.**
59. **Não compareceu?** — **A — Profissional marca manualmente.** **Vigente.**
60. **Concluído automático?** — **C — Automático, com possibilidade de correção.** **Vigente.**
61. **Profissional cria agendamento manual?** — **A — Sim.** **Vigente.**
62. **Cliente inexistente na criação manual?** — **B — Criar rapidamente no fluxo.** **Vigente.**
63. **Dados mínimos de cliente?** — **A — Nome + telefone.** **Vigente como regra geral.**
64. **Cliente presencial sem telefone?** — **B — Permitir.** **Vigente.**
65. **Dois clientes compartilham telefone?** — **B — Sim.** **Vigente.**
66. **Perguntar “para quem é?”** — **C — Assumir o próprio cliente salvo indicação em contrário.** **Vigente.**
67. **Observações internas?** — **B — Sim, campo livre.** **Vigente.**
68. **IA pode usar observações internas?** — **C — Somente as explicitamente autorizadas.** **Vigente.**

# Rodada 5 — Disponibilidade e políticas

69. **Como definir jornada padrão?** — **A — Um período-base por dia.** **Vigente.**
70. **Dias diferentes podem ter horários diferentes?** — **B — Sim.** **Vigente.**
71. **Como configurar horários no onboarding?** — **B — Dias primeiro, depois horários agrupados.** **Vigente.**
72. **Almoço automático?** — **B — Não; usar bloqueios/períodos.** **Vigente.**
73. **Feriados automáticos?** — **A — Não.** **Vigente.**
74. **Feriados estaduais/municipais?** — **C — Nenhum automático.** **Vigente.**
75. **Exceção de indisponibilidade?** — **A — Bloqueios.** **Vigente.**
76. **Disponibilidade extra fora do padrão?** — **B — Sim, por data.** **Vigente.**
77. **Antecedência mínima?** — **B — Configurável.** **Vigente.**
78. **Antecedência máxima?** — **B — Configurável.** **Vigente.**
79. **Granularidade de horários?** — **B — Configurável.** **Vigente.**
80. **Quantos horários mostrar?** — **C — Poucas opções relevantes e oferecer mais.** **Vigente.**
81. **Como escolher as opções?** — **C — Usar preferência/histórico quando útil.** **Vigente.**
82. **IA pode afirmar disponibilidade sem consulta atual?** — **B — Não.** **Vigente.**
83. **Sem serviço informado, o que fazer?** — **A com exceção:** usar histórico forte para confirmar serviço provável. **Vigente.**
84. **Vários serviços usam qual duração?** — **A — Soma.** **Vigente.**
85. **Preço “a partir de”?** — **C — Informar como valor inicial/estimativa.** **Vigente.**
86. **Sob consulta pode agendar?** — **C — Configurável por serviço.** **Vigente.**
87. **Preço multi-serviço?** — **C — Soma quando fixos; caso contrário mantém incerteza/consulta.** **Vigente.**
88. **Profissional pode editar preço do agendamento?** — **B — Sim.** **Vigente.**
89. **Editar preço altera catálogo?** — **B — Não.** **Vigente.**
90. **Mudança de preço altera agendamentos futuros existentes?** — **B — Não.** **Vigente.**
91. **Mudança de duração altera agendamentos existentes?** — **B — Não.** **Vigente.**
92. **Profissional pode fazer encaixe manual?** — **B — Sim, com alerta.** **Vigente.**
93. **IA pode fazer encaixe?** — **B — Não.** **Vigente.**
94. **Sobreposição manual?** — **B — Sim, com confirmação de conflito.** **Vigente.**
95. **Compromisso pessoal bloqueia IA?** — **A — Sim.** **Vigente.**
96. **Recorrência de bloqueio?** — **B — Diário/semanal/mensal com fim opcional.** **Vigente.**
97. **Qual fuso governa agenda?** — **A — Fuso do negócio.** **Vigente no produto.**
98. **Cliente em outro fuso?** — **A — Falar no horário do negócio.** **Vigente.**
99. **Políticas de cancelamento/remarcação?** — **A — Regra global do negócio.** **Vigente.**
100. **Default de política?** — **A — Cancelar/remarcar a qualquer momento.** **Vigente.**

# Rodada 6 — Memória, handoff e linguagem da IA

101. **Serviço provável pelo histórico?** — **B — Confirmar de forma curta.** **Vigente.**
102. **Confiança para sugerir histórico?** — **B + C — Padrão objetivo + análise contextual.** **Vigente como comportamento.**
103. **“Sim” após confirmação de serviço vale?** — **A — Sim.** **Vigente.**
104. **Usar horário habitual?** — **B — Priorizar internamente sem expor o padrão.** **Vigente.**
105. **Profissional habitual futuro?** — **B — Priorizar e mencionar só quando necessário.** **Futuro.**
106. **Quais dados históricos usar?** — **B — Agendamentos, serviços, horários e preferências autorizadas.** **Vigente.**
107. **IA salva preferências inferidas?** — **C — Sim, diferenciando inferência.** **Vigente.**
108. **Profissional vê preferências inferidas?** — **A — Sim.** **Vigente.**
109. **IA atualiza dados de cliente?** — **C — Sim quando simples/seguro; ambiguidade exige confirmação.** **Vigente.**
110. **Reconhecimento de cliente?** — **B — Telefone como primeiro sinal, confirmação quando ambíguo.** **Vigente.**
111. **Vários clientes no mesmo telefone?** — **C — Inferir pelo texto; perguntar se necessário.** **Vigente.** Observação adicional: registrar que um contato costuma agendar para outro cliente.
112. **Quanto dura contexto ativo?** — **B — 24h.** **Vigente.**
113. **Retomar oferta antiga dias depois?** — **B — Reconsultar e reconfirmar.** **Vigente.**
114. **Separar contexto temporário e memória do cliente?** — **B — Sim.** **Vigente conceitualmente.**
115. **Cliente pode pedir humano?** — **A — Sim, transferência imediata.** **Vigente.**
116. **O que é transferir?** — **B — Aguardando humano, IA pausa.** **Vigente.**
117. **Quando IA volta após humano?** — **B — Quando profissional escolhe Retomar IA.** **Vigente na sessão atual.**
118. **Retomada automática após X minutos?** — **B — Não no MVP.** **Vigente.**
119. **IA decide handoff sozinha?** — **B — Sim quando não consegue resolver com segurança.** **Vigente.**
120. **Situações de handoff?** — **B — Falta de entendimento, exceção, conflito, reclamação, pedido fora da capacidade etc.** **Vigente.**
121. **Reclamação?** — **B — Reconhecer brevemente e encaminhar quando necessário.** **Vigente.**
122. **Negociar preço?** — **B — Nunca no MVP.** **Vigente.**
123. **Responder perguntas fora de agendamento?** — **B — Sim, se informação estiver cadastrada.** **Vigente.**
124. **Fonte dessas informações?** — **C — Dados estruturados + campo complementar.** **Vigente.**
125. **Responder algo não cadastrado?** — **B — Não inventar.** **Vigente.**
126. **Quando não sabe?** — **B originalmente — oferecer humano. Refinada depois:** handoff só quando material; perguntas secundárias podem receber “não tenho essa informação”.
127. **O que o tom altera?** — **B — Vocabulário, tamanho, emojis, saudações e informalidade.** **Vigente.**
128. **Imitar jeito específico do profissional?** — **C — Presets agora, personalização avançada depois.** **Vigente.**
129. **Emojis?** — **B — Dependem do estilo.** **Vigente.**
130. **IA deve se identificar espontaneamente?** — **C — Não precisa anunciar, mas não finge ser pessoa.** **Vigente.**
131. **Se perguntarem se é robô?** — **B — Explicar que é assistente virtual.** **Vigente.**
132. **Mensagens proativas?** — **B — Sim, eventos operacionais como lembretes.** **Vigente.**
133. **Confirmação prévia do atendimento?** — **B — Opcional/configurável.** **Vigente.**
134. **Cliente responde “não vou conseguir”?** — **B — Iniciar cancelamento/remarcação.** **Vigente.**
135. **Lembrete para cliente sem telefone?** — **A — Não.** **Vigente.**
136. **Explicar por que IA sugeriu algo?** — **C — Sinais simples quando útil.** **Vigente.**

# Rodada 7 — Clientes, relacionamentos e inbox

137. **Como representar pessoa que agenda para outra?** — **B — Relação estruturada entre clientes.** **Vigente.**
138. **Pessoa atendida precisa ser cliente cadastrado?** — **A — Sim.** **Vigente.**
139. **Cliente relacionado sem telefone?** — **A — Pode existir sem telefone, mantendo responsável relacionado.** **Vigente.**
140. **Múltiplos responsáveis?** — **A — Apenas um no MVP.** **Vigente.**
141. **Tipos de relação?** — **B — Tipos básicos.** **Vigente.**
142. **IA cria relação automaticamente?** — **B — Só depois de confirmação.** **Vigente.**
143. **Confirmação para salvar relação?** — **A — Sim.** **Vigente.**
144. **Próxima conversa de quem costuma agendar para outro?** — **C — Confirmar pessoa provável quando padrão forte.** **Vigente.**
145. **Preferências estruturadas?** — **B — Serviço, período, profissional futuro, observações autorizadas.** **Vigente.**
146. **Registrar origem da preferência?** — **B — Sim.** **Vigente.**
147. **Preferência inferida expira?** — **C — Não some abruptamente; perde relevância.** **Vigente.**
148. **Comportamento recente contradiz preferência?** — **C — Considerar ambos e atualizar inferência.** **Vigente.**
149. **Profissional edita/remove memória inferida?** — **B — Sim.** **Vigente.**
150. **Cliente pode pedir para esquecer informação?** — **A — Sim, quando identificável.** **Vigente conceitualmente.**
151. **Visão principal do cliente?** — **B — Perfil + próximos + histórico + observações + preferências.** **Vigente.**
152. **Resumo por IA no perfil?** — **B — Sim automático.** **Vigente.**
153. **Resumo usa notas sensíveis?** — **B — Só informações autorizadas.** **Vigente.**
154. **Métricas do cliente?** — **B — Total, último, frequência, gasto realizado, faltas/cancelamentos.** **Vigente.**
155. **Gasto total usa qual valor?** — **B — Valor final registrado.** **Vigente.**
156. **Valor final cobrado?** — **A — Campo opcional.** **Vigente.**
157. **Sem valor final, usar previsto?** — **B — Não; realizado fica desconhecido.** **Vigente.**
158. **Tags?** — **B — Tags manuais.** **Vigente.**
159. **IA vê tags?** — **C — Só autorizadas.** **Vigente.**
160. **Tela Conversas própria?** — **A — Sim, central.** **Vigente.**
161. **Destaque na lista?** — **B — Estado da conversa.** **Vigente.**
162. **Estados da conversa?** — **B — IA atendendo / aguardando humano / atendimento humano / encerrada.** **Vigente com copy refinada depois.**
163. **Quando conversa encerra?** — **C — Sem obrigação de “fechar ticket”; estado muda conforme interação.** **Vigente.**
164. **Nova conversa futura volta para IA?** — **B — Sim, nova sessão volta automaticamente.** **Vigente.**
165. **O que define nova sessão?** — **A — 24h.** **Vigente.**
166. **Onde humano responde?** — **B — WhatsApp normal ou Atendly.** **Vigente.** Observação: número pode ser pessoal e profissional.
167. **Sugestões de resposta?** — **B — Sim, apenas no chat da Atendly.** **Vigente.**
168. **Pode editar sugestão?** — **A — Sim.** **Vigente.**
169. **Mensagens humanas podem servir à personalização futura?** — **C — Guardar possibilidade, só usar quando feature for ativada.** **Futuro.**
170. **Apagar mensagem interna?** — **C — Ocultar/retirar de contexto quando aplicável, preservando registro necessário.** **Vigente conceitualmente.**

# Rodada 8 — WhatsApp pessoal e controle da IA

171. **Como identificar conversas em número pessoal?** — **C — Classificação automática + controles manuais.** **Vigente.** Observação: usuário configura contatos ignorados.
172. **Mensagem incerta?** — **C — Aguardar contexto antes de responder.** **Vigente.**
173. **Usar histórico para contatos pessoais?** — **C — Apenas contatos marcados manualmente como sinal permanente.** **Vigente na forma refinada pelas rodadas seguintes.**
174. **Tipos de contato?** — **C — Cliente / potencial cliente / pessoal / ignorado + estado da IA.** **Vigente conceitualmente.**
175. **Contato pessoal aparece onde?** — **B com refinamento:** todas as conversas permanecem na Atendly em abas Comercial / Não classificadas / Pessoal. **Vigente.**
176. **Conversas pessoais armazenadas?** — **A — Sim integralmente dentro da retenção.** **Vigente.**
177. **Contato pessoal envia pedido comercial?** — **C — Notificar/perguntar antes quando explicitamente marcado pessoal na sessão; depois regras foram refinadas por sessão.**
178. **Lista de contatos que IA nunca atende?** — **A — Sim.** **Vigente.**
179. **Grupos?** — **A — IA nunca participa no MVP.** **Vigente.**
180. **Profissional responde manualmente enquanto IA atende?** — **B — Detectar e pausar IA.** **Vigente.**
181. **Pausa dura quanto?** — **A — Até Retomar IA na sessão.** **Vigente.**
182. **Qualquer mensagem manual pausa?** — **A — Sim.** **Vigente.**
183. **Apenas visualizar pausa?** — **B — Não.** **Vigente.**
184. **Humano e IA respondem juntos?** — **B — Humano tem prioridade.** **Vigente.**
185. **IA deve esperar antes de responder?** — **C — Espera contextual/configurável em cenários apropriados.** **Vigente conceitualmente**, refinada pelas mensagens ambíguas.
186. **Distinguir autoria na Atendly?** — **C — Sim internamente, sem diferença para cliente.** **Vigente.**
187. **IA atende fora do horário comercial?** — **A — Sim, 24h.** **Vigente.**
188. **Pode confirmar agendamento fora do horário?** — **A — Sim.** **Vigente.**
189. **Mensagem pessoal fora do horário?** — **B — Mesmas proteções.** **Vigente.**
190. **Número desconhecido recebe resposta automática?** — **C com regra especial:** só intenção comercial clara; em “oi/tudo bem” aguardar e eventualmente enviar saudação neutra. **Vigente.**
191. **Intenção comercial clara?** — **A — Responder imediatamente.** **Vigente.**
192. **Mensagem ambígua?** — **C com observação 190.** **Vigente.**
193. **Intenção comercial aparece depois?** — **A — IA entra naquele momento se humano ainda não assumiu.** **Vigente.**
194. **Humano já respondeu e depois surge pedido comercial?** — **B + C — Conversa permanece humana e IA pode sugerir resposta na Atendly.** **Vigente.**
195. **O que mostrar na inbox?** — **Todas as conversas separadas em Comercial / Não classificadas / Pessoal.** **Vigente.**
196. **Classificação errada?** — **A — Usuário corrige.** **Vigente.**
197. **Ao marcar pessoal, apagar conteúdo?** — **Não. Apenas desativar IA para a conversa e manter armazenamento.** **Vigente.**
198. **IA aprende estilo com conversas pessoais?** — **C — Só se usuário selecionar explicitamente numa feature futura.** **Vigente/futuro.**
199. **Explicar que número pessoal funciona?** — **B — Sim, explicitamente.** **Vigente.**
200. **Recomendar número exclusivo?** — **A — Sim como recomendação, não requisito.** **Vigente.**
201. **Trocar número?** — **C — Sim, com fluxo e impacto explicado.** **Vigente.**
202. **Mais de um número por negócio?** — **A — Nunca; um negócio = um número.** **Vigente e direção definida.**
203. **Número desconectado?** — **B — Alerta crítico e reconexão quando possível.** **Vigente.**
204. **Alerta externo de desconexão?** — **C — Sim, pelo menos e-mail no MVP.** **Vigente.**

# Rodada 9 — Classificação Comercial/Pessoal

205. **Classificação pertence ao contato ou conversa?** — **C — Ambos: perfil predominante + conversa atual.** **Vigente.**
206. **Ignorar IA significa o quê?** — **A — IA nunca envia, classificação continua separada.** **Vigente.**
207. **Ignorado pode ser comercial?** — **A — Sim, atendimento sempre humano.** **Vigente.**
208. **“Sempre permitir IA”?** — **A — Sim.** **Vigente conceitualmente.**
209. **Quem vence: usuário ou classificador?** — **B — Configuração manual sempre vence.** **Vigente.**
210. **Quando entra em Comercial?** — **B + C — Probabilidade/intenção comercial; cliente cadastrado é sinal forte, não regra absoluta.** **Vigente.**
211. **Cliente cadastrado fala assunto pessoal?** — **B — Conversa pessoal.** **Vigente.**
212. **Conversa pessoal vira comercial no meio?** — **B — Dali em diante estado operacional passa a comercial.** **Vigente.**
213. **Em qual aba fica depois?** — **A — Comercial, refletindo estado atual.** **Vigente.**
214. **O que é Não classificadas?** — **B — Baixa confiança entre Comercial/Pessoal.** **Vigente.**
215. **Pode ficar indefinidamente Não classificada?** — **A — Sim.** **Vigente.**
216. **Quanto esperar após “Oi”?** — **B — Cerca de 2 minutos.** **Vigente.**
217. **Nova mensagem ambígua reinicia espera?** — **A — Sim.** **Vigente.**
218. **Limite total?** — **B — Aproximadamente 5 minutos.** **Vigente.**
219. **Saudação depois do limite?** — **B + A — Adaptada ao estilo, mas semanticamente neutra.** **Vigente.**
220. **Depois fica claro que é pessoal?** — **B — IA para e classifica Pessoal.** **Vigente.**
221. **Mandar mensagem final antes de parar?** — **A — Não.** **Vigente.**
222. **Humano responde durante espera?** — **A — Cancelar resposta da IA.** **Vigente.**
223. **Contato Ignorar IA recebe saudação neutra?** — **B — Nunca.** **Vigente.**
224. **Pessoal implica IA desligada?** — **A — Sim na sessão.** **Vigente.**
225. **Intenção comercial clara em Não classificadas?** — **A — Move para Comercial.** **Vigente.**
226. **Intenção pessoal clara?** — **A — Move para Pessoal.** **Vigente.**
227. **Usuário pode mover entre abas?** — **A — Sim.** **Vigente.**
228. **Mover para Pessoal aplica à conversa ou contato?** — **C — Perguntar “esta conversa” ou “sempre”.** **Vigente.**
229. **Mover para Comercial?** — **C — Mesma escolha.** **Vigente.**
230. **Retenção configurável?** — **C — Sim.** **Vigente.**
231. **Default geral discutido?** — **A — 90 dias inicialmente.** **Refinado depois:** Comercial 90 / Pessoal 30.
232. **Retenção diferente por categoria?** — **A — Sim.** **Vigente.**
233. **O que apagar ao expirar?** — **A — Conteúdo, preservando metadados mínimos.** **Vigente.**
234. **Usuário pode apagar conversa inteira manualmente?** — **B — Não no MVP.** **Vigente.**
235. **Inbox suporta mídia?** — **A — Sim, tipos suportados.** **Vigente.**
236. **IA entende áudio?** — **A — Sim.** **Vigente.**
237. **IA interpreta imagem?** — **C — Não; handoff.** **Vigente.**
238. **IA analisa documentos?** — **B — Mostra, mas não analisa.** **Vigente.**
239. **Stickers/GIFs?** — **B — Ignorar semanticamente quando não houver contexto operacional.** **Vigente.**
240. **Mensagem central de produto?** — **B — Continue usando WhatsApp; IA atende e sai de cena quando você assume.** **Vigente.**

# Rodada 10 — Onboarding e ativação

241. **Primeira tela após cadastro?** — **C — Abertura curta explicando resultado e CTA.** **Vigente.**
242. **Precisamos saber segmento?** — **A — Sim, obrigatório.** **Vigente.**
243. **Como selecionar segmento?** — **B — Opções frequentes + Outro.** **Vigente.**
244. **Nome do negócio obrigatório?** — **C — Perguntar como clientes conhecem você.** **Vigente.**
245. **Pedir endereço?** — **B — Só quando modalidade exigir local físico.** **Vigente.**
246. **Modalidade de atendimento?** — **C — Pode selecionar várias.** **Vigente.**
247. **Quando perguntar se usa outro sistema?** — **A — Após dados básicos do negócio.** **Vigente.**
248. **Copy da pergunta?** — **B — “Você já usa algum sistema para organizar seus clientes e agendamentos?”** **Vigente.**
249. **Se responder sim?** — **C — Perguntar importar agora ou depois.** **Vigente.**
250. **Origem disponível?** — **A — Apenas Minha Agenda em tela genérica.** **Vigente.**
251. **Ao escolher Minha Agenda?** — **B — Explicação antes de credenciais.** **Vigente.**
252. **Explicar que não há conexão contínua?** — **A — Sim, destaque visível.** **Vigente.**
253. **Após autenticar, preview?** — **C — Resumo + opção de revisar detalhes.** **Vigente.**
254. **Importar tudo?** — **A — CTA principal + link para escolher.** **Vigente.**
255. **Importação longa permite continuar onboarding?** — **A — Não; permanecer na tela até concluir.** **Vigente.**
256. **Demonstração espera importação?** — **A — Sim.** **Vigente.**
257. **Quantos serviços para começar do zero?** — **C — Pelo menos um, podendo adicionar outros.** **Vigente.**
258. **Campos rápidos do serviço?** — **B ajustado — Nome + duração + preço opcional/tipo.** **Vigente.**
259. **Preço em microetapa?** — **B originalmente. Refinado depois:** pode estar junto de nome/duração no cadastro inicial, sem sobrecarregar.
260. **Disponibilidade antes da demonstração?** — **A — Sim.** **Vigente.**
261. **Fluxo de horários?** — **A — Dias → horário padrão → personalizar.** **Vigente.**
262. **Dias diferentes?** — **A — Personalização manual.** **Vigente.**
263. **Pausas no onboarding?** — **A — Não entram; configurar depois.** **Vigente.**
264. **Como apresentar demonstração?** — **B — Automática.** **Vigente.**
265. **Dados usados na demonstração?** — **B — Dados reais cadastrados/importados.** **Vigente.**
266. **Demonstração cria agendamento real?** — **B — Não; simulada.** **Vigente.**
267. **Destacar ações internas?** — **A — Sim, discretamente.** **Vigente.**
268. **Como escolher tom?** — **B — Mostrar resposta e permitir mudar jeito de falar.** **Vigente.**
269. **Quantos estilos?** — **B — 3: profissional, equilibrado, descontraído.** **Vigente.**
270. **Nomes do estilo?** — **A — Termos descritivos, não personas.** **Vigente.**
271. **Após demonstração, WhatsApp?** — **B — Oferecer conexão podendo pular.** **Vigente.**
272. **Copy de transição?** — **B — “Agora vamos colocar sua Atendly para atender de verdade”, com CTA conectar.** **Vigente como direção de copy.**
273. **Explicar número pessoal?** — **B — Resumo curto na própria conexão.** **Vigente.**
274. **Contatos ignorados no onboarding?** — **C — Após conectar, opcional e pulável.** **Vigente.**
275. **Como escolher ignorados?** — **C — Conversas/contatos + número manual.** **Vigente.**
276. **Qual teste de ativação?** — **B originalmente — outro telefone. Substituída** por número oficial da Atendly simulando cliente real.
277. **O que validar no teste?** — **C — Fluxo completo até agendamento.** **Vigente no teste real atual.**
278. **Como identificar telefone de teste?** — **Substituída.** Teste usa número oficial da Atendly, sem telefone informado pelo usuário.
279. **Depois do teste, ativar?** — **B originalmente. Substituída:** sucesso ativa automaticamente.
280. **Se pulou WhatsApp?** — **B — Onboarding concluído, IA não ativa.** **Vigente.**
281. **Home sem ativação?** — **B — Checklist.** **Vigente.**
282. **Checklist após ativação?** — **C — Some; configurações continuam nos módulos.** **Vigente.**
283. **Sensação final?** — **B — “Criei uma IA para atender meus clientes.”** **Vigente.**

# Rodada 11 — Teste real de ativação (versão vigente)

284. **Como o teste começa?** — **B — Usuário lê explicação e clica Iniciar teste.** **Vigente.**
285. **O que explicar antes?** — **B — Informar claramente que um número da Atendly simulará um cliente e o usuário apenas observa.** **Vigente.**
286. **Como indicar no WhatsApp que é teste?** — **B — Mensagem separada antes da conversa simulada.** **Vigente.**
287. **Número de teste?** — **A — Um número oficial da Atendly inicialmente.** **Vigente como produto.**
288. **Caminho feliz do teste?** — **A — Perguntar preço → pedir horário → escolher opção → confirmar.** **Vigente.**
289. **Qual serviço usar?** — **C — Sistema escolhe automaticamente um serviço válido e informa.** **Vigente.**
290. **Serviço sob consulta inadequado para teste?** — **A — Escolher outro serviço apto.** **Vigente.**
291. **Qual horário pedir no teste?** — **C — Próximo horário disponível.** **Vigente.**
292. **Sem disponibilidade?** — **B — Impedir início e orientar correção da agenda.** **Vigente.**
293. **Teste cria agendamento real?** — **A — Sim temporariamente e remove depois.** **Vigente.**
294. **Agendamento de teste ocupa horário?** — **A — Sim.** **Vigente.**
295. **O que acontece com o agendamento ao terminar?** — **A — Apagar completamente.** **Vigente.**
296. **E o cliente de teste?** — **B — Criar e apagar ao final.** **Vigente.**
297. **Tempo máximo do teste?** — **B — Cerca de 3 minutos.** **Vigente como UX.**
298. **Precisa ficar na tela?** — **B — Não; pode alternar para o WhatsApp.** **Vigente.**
299. **Acompanhar em tempo real?** — **A — Sim, passo a passo.** **Vigente.**
300. **Usuário responde manualmente no teste?** — **C — Pausar e permitir reiniciar.** **Vigente.**
301. **Falha durante teste?** — **A — Uma nova tentativa automática antes de falhar.** **Vigente.**
302. **Segunda falha?** — **A — Não ativar; mostrar problema e tentar novamente.** **Vigente.**
303. **Depois do sucesso?** — **A — Tela de sucesso com IA já ativa.** **Vigente.**
304. **CTA principal após sucesso?** — **B — Ir para o início.** **Vigente.**
305. **Teste pode ser repetido livremente?** — **C — Apenas ao reconectar/trocar WhatsApp.** **Vigente.**

# Rodada 12 — Home, navegação e módulos

306. **Menu principal desktop?** — **A — Início / Agenda / Conversas / Clientes / Serviços / Configurações.** **Vigente.**
307. **Navegação mobile?** — **C — Bottom nav principais + Mais.** **Vigente**, refinada depois para 5 itens.
308. **Tela padrão ao abrir?** — **A — Home.** **Vigente.**
309. **Prioridade da Home?** — **B — O que precisa de atenção agora.** **Vigente.**
310. **Hierarquia da Home?** — **A — status, pendências, agenda, resumo.** **Vigente.**
311. **Status da IA permanente na Home?** — **A — Sim.** **Vigente.**
312. **Pausar/reativar pela Home?** — **C — Sim, com confirmação.** **Vigente.**
313. **Quais pendências mostrar?** — **B — Handoff, desconexão, erros e configuração incompleta.** **Vigente.**
314. **Agenda de hoje na Home?** — **A — Sim.** **Vigente.**
315. **Quantos próximos atendimentos?** — **B — 3–5 com Ver agenda.** **Vigente.**
316. **Compromissos pessoais na Home?** — **C — Sim, diferenciados.** **Vigente.**
317. **Métricas da Home?** — **A — agendamentos, clientes atendidos, conversas automatizadas, handoffs.** **Vigente de forma simples.**
318. **Tempo economizado?** — **B — Não sem cálculo confiável.** **Vigente.**
319. **Taxa de automação?** — **A — Sim.** **Vigente como métrica simples.**
320. **Conversão conversa → agendamento?** — **C — Só com volume mínimo.** **Vigente.**
321. **Agenda desktop inicial?** — **B — Semana.** **Vigente.**
322. **Agenda mobile inicial?** — **A — Dia.** **Vigente.**
323. **Visualização mensal?** — **C — Mini calendário para navegação, sem necessidade de mês completo.** **Vigente.**
324. **Clique em espaço vazio desktop?** — **C — Menu Agendamento / Compromisso / Bloqueio.** **Vigente.**
325. **Botão global + na Agenda?** — **A — Sim.** **Vigente.**
326. **Abrir agendamento?** — **A — Detalhes rápidos em modal/drawer.** **Vigente**, com mobile em tela própria quando necessário.
327. **Ações rápidas do agendamento?** — **C — editar, remarcar, cancelar, concluir, falta, conversa.** **Vigente.**
328. **Mostrar origem do agendamento?** — **C — Só nos detalhes.** **Vigente.**
329. **Ordem das abas de Conversas?** — **A — Comercial / Não classificadas / Pessoal.** **Vigente.**
330. **Contador nas abas?** — **B — Conversas que exigem atenção.** **Vigente.**
331. **Handoff na lista?** — **A — No topo de Comercial com destaque.** **Vigente.**
332. **Conteúdo da linha de conversa?** — **B — nome, última mensagem, estado e contexto relevante.** **Vigente.**
333. **Painel lateral do cliente no desktop?** — **A — Sim.** **Vigente.**
334. **Cliente no mobile?** — **A — Acessível por drawer/tela pelo cabeçalho.** **Vigente.**
335. **Ações internas da IA no chat?** — **C — Eventos discretos/recolhíveis.** **Vigente.**
336. **Transcrição de áudio?** — **A — Mostrar automaticamente.** **Vigente.**
337. **Clientes: layout principal?** — **A — Lista/tabela com busca.** **Vigente**, refinado para lista moderna mobile-first.
338. **Informações principais do cliente na lista?** — **A — nome, telefone, último e próximo atendimento.** **Vigente.**
339. **Busca de cliente?** — **B — nome, telefone, tags e serviços.** **Vigente.**
340. **Criar cliente manualmente?** — **A — Sim.** **Vigente.**
341. **Serviços ativos/inativos?** — **B — Desativar sem perder histórico.** **Vigente.**
342. **Excluir serviço com histórico?** — **C — Remover do catálogo preservando histórico.** **Vigente.**
343. **Ordem do serviço afeta IA?** — **A — Não.** **Vigente.**
344. **Descrição do serviço?** — **A — Opcional.** **Vigente.**
345. **Instruções privadas para IA por serviço?** — **A — Sim.** **Vigente.**
346. **Estrutura de Configurações?** — **A — Negócio / Agenda / IA / WhatsApp / Importação / Conta.** **Vigente.**
347. **Onde fica Importar dados?** — **A — Configurações → Importação.** **Vigente.**
348. **Histórico de importações?** — **A — Sim.** **Vigente**, porém só existirá uma importação concluída.
349. **Exportar dados no MVP?** — **B — Não.** **Vigente.**
350. **Onde ficam políticas da agenda?** — **A — Configurações → Agenda.** **Vigente.**

# Rodada 13 original — Reimportação e reconciliação

351–396. **Toda a rodada original sobre reimportação, diff entre origem/Atendly, propagação de alterações e snapshots de reimportação foi substituída antes de ser respondida.** **Descartada.** A decisão vigente é: **uma única importação concluída por negócio, sem reimportação.** As perguntas foram substituídas pela Rodada 13 revisada abaixo.

# Rodada 13 revisada — Importação única

351. **Falha completa consome única importação?** — **A — Não; pode tentar novamente.** **Vigente.**
352. **Importação parcial consome imediatamente?** — **C — Mantém sessão aberta para pendências antes de concluir.** **Vigente.**
353. **Quando a importação termina definitivamente?** — **C — Ao clicar Concluir importação, mesmo com pendências ignoradas.** **Vigente.**
354. **Depois de concluir, como fica a área?** — **B — Histórico visível, sem nova importação.** **Vigente.**
355. **Se não importar no onboarding?** — **A — Pode importar depois, enquanto nunca tiver concluído uma.** **Vigente.**
356. **Prazo para primeira importação?** — **A — A qualquer momento, se nunca concluiu.** **Vigente.**
357. **Já existem dados Atendly quando importar?** — **A — Permitir, com análise de conflitos.** **Vigente.**
358. **Conflitos da primeira importação?** — **A — Comparar e permitir decisão.** **Vigente.**
359. **Credenciais depois da conclusão?** — **A — Não manter relação.** **Vigente em produto.**
360. **Manter referência de origem?** — **A — Sim para rastreabilidade.** **Vigente conceitualmente.**
361. **Manter snapshot completo para reimportação?** — **B — Não; só o necessário da importação concluída.** **Vigente conceitualmente.**
362. **Mensagem final deve explicar que Atendly vira fonte oficial?** — **A — Sim.** **Vigente.**

# Rodada 14 — Lembretes e pós-atendimento

363. **Quantos lembretes?** — **B — Até dois.** **Vigente.**
364. **Default?** — **B — Um lembrete 24h antes.** **Vigente.**
365. **Antecedência livre?** — **C — Presets + personalizada.** **Vigente.**
366. **Configuração do lembrete?** — **A — Global no MVP.** **Vigente.**
367. **Quem escreve lembrete?** — **C — Conteúdo operacional previsível adaptado ao estilo.** **Vigente.**
368. **Conteúdo mínimo?** — **B — Serviço + data + horário.** **Vigente.** Endereço só se perguntado/contextualmente necessário.
369. **Preço no lembrete?** — **Configurável: Nunca (default) ou mostrar quando fixo.** **Vigente.**
370. **Lembrete pede confirmação?** — **B — Opcional.** **Vigente.**
371. **Estado do agendamento enquanto espera confirmação?** — **C — Agendamento continua confirmado; confirmação do lembrete é separada.** **Vigente.**
372. **Estados separados de confirmação?** — **A — Sim.** **Vigente no produto.**
373. **Cliente confirma?** — **B — Registrar e responder brevemente.** **Vigente.**
374. **Cliente responde não?** — **B — Perguntar cancelar ou remarcar.** **Vigente.**
375. **Cliente responde talvez?** — **B — Tentar esclarecer.** **Vigente.**
376. **Sem resposta?** — **A — Nada muda; agendamento segue.** **Vigente.**
377. **Destacar não confirmados?** — **A — Sim, discretamente.** **Vigente.**
378. **Cancelar dentro da política?** — **A — Confirmar uma vez e cancelar.** **Vigente.**
379. **Após cancelar?** — **B — Perguntar se quer outro horário.** **Vigente.**
380. **Fora da política?** — **B — Explicar e oferecer humano.** **Vigente.**
381. **Remarcação libera horário antigo quando?** — **B — Só depois do novo confirmado.** **Vigente.**
382. **Novo horário em remarcação tem hold?** — **A — Sim.** **Vigente.**
383. **Remarcação cria novo ou atualiza?** — **A — Atualiza o mesmo agendamento.** **Vigente.**
384. **Limite de remarcações?** — **A — Sem limite no MVP.** **Vigente.**
385. **Confirmação após novo agendamento?** — **A — Sim, resumo.** **Vigente.**
386. **Mostrar política na confirmação?** — **B — Só se houver regra restritiva.** **Vigente.**
387. **Profissional recebe notificação de novo agendamento?** — **C — Configurável, default silencioso.** **Vigente.**
388. **Onde notificar?** — **A — Dentro da Atendly inicialmente.** **Vigente.**
389. **Remarcação manual notifica cliente?** — **B — Perguntar, marcado por padrão.** **Vigente.**
390. **Cancelamento manual notifica?** — **A — Mesmo comportamento, marcado por padrão.** **Vigente.**
391. **Alteração interna de preço/nota notifica?** — **B — Não.** **Vigente.**
392. **Alterar data/hora/serviço/local?** — **A — Sugerir fortemente notificar.** **Vigente.**
393. **Conclusão automática quando?** — **B — 30 min após término previsto.** **Vigente.**
394. **Cancelado/falta é sobrescrito?** — **A — Não.** **Vigente.**
395. **Estado “em atendimento”?** — **B — Não existe no MVP.** **Vigente.**
396. **Mensagem pós-atendimento?** — **A — Não no MVP.** **Vigente.**
397. **Pedido de avaliação/NPS?** — **B — Futuro.** **Vigente fora do MVP.**
398. **Pendência para valor final?** — **A — Não; campo opcional ao editar.** **Vigente.**
399. **Falta pode ter observação?** — **A — Sim opcional.** **Vigente.**
400. **Número de faltas aparece no cliente?** — **A — Sim.** **Vigente.**
401. **IA considera faltas?** — **B — Pode usar internamente, sem punir/alterar automaticamente.** **Vigente.**
402. **IA menciona falta anterior automaticamente?** — **B — Nunca.** **Vigente.**
403. **Sinal futuro para reincidentes?** — **A — Pode ser evolução futura.** **Futuro.**

# Rodada 15 — Monetização (direção futura, não implementar agora)

404. **Modelo inicial de cobrança?** — **A — mensalidade fixa por negócio.** **Hipótese futura, não decidida para lançamento.**
405. **Quantidade de planos?** — **A — um plano inicialmente.** **Hipótese futura.**
406. **Trial?** — **B — 14 dias.** **Hipótese futura.**
407. **Quando começa trial?** — **C — quando IA fica ativa.** **Hipótese futura.**
408. **Agenda pode ser usada antes do trial?** — **A — Sim.** **Hipótese futura.**
409. **Agenda grátis como produto?** — **C — Não decidir agora.** **Vigente: decisão adiada.**
410. **Quando pedir pagamento?** — **C — fim do trial.** **Hipótese futura.**
411. **Sem pagamento?** — **A — IA pausa, dados permanecem.** **Hipótese futura.**
412. **Inbox continua?** — **A — Sim.** **Hipótese futura.**
413. **Classificação continua?** — **A — Sim.** **Hipótese futura.**
414. **Lembretes continuam sem assinatura?** — **B — Não.** **Hipótese futura.**
415. **Agendamentos manuais continuam?** — **A — Sim.** **Hipótese futura.**
416. **Limite visível de IA?** — **A — Não inicialmente, apenas proteção contra abuso.** **Hipótese futura.**
417. **Uso anormal?** — **B — Tratar individualmente.** **Hipótese futura.**
418. **Limite de clientes?** — **A — Não.** **Hipótese futura.**
419. **Limite de agendamentos?** — **A — Não.** **Hipótese futura.**
420. **Limite de histórico?** — **A — Política de retenção.** **Hipótese futura.**
421. **Assinatura expira: desconectar WhatsApp?** — **A — Não de imediato.** **Hipótese futura.**
422. **Meses sem pagar?** — **B — Desconectar após período.** **Hipótese futura.**
423. **Avisar antes?** — **B — Plataforma + e-mail.** **Hipótese futura.**
424. **Voltar a pagar após desconexão?** — **B — Reconectar e refazer teste.** **Hipótese futura.**
425. **Cancelamento voluntário?** — **B — Até fim do período pago.** **Hipótese futura.**
426. **Depois do período?** — **A — IA pausa e dados continuam.** **Hipótese futura.**
427. **Excluir conta?** — **A — Sim.** **Vigente no produto, mesmo sem cobrança.**
428. **Exclusão imediata?** — **B — 7 dias para recuperação.** **Vigente.**
429. **Durante recuperação?** — **B — IA/automações desligadas, exclusão pode ser cancelada.** **Vigente.**
430. **Futura cobrança multi-profissional?** — **B — base + adicional por profissional.** **Hipótese futura, não consolidar em MVP.**
431. **Mostrar consumo técnico?** — **C — Mostrar valor operacional, não tokens.** **Direção futura.**
432. **Plano/cobrança na UI?** — **A — Configurações → Plano e cobrança.** **Futuro.**
433. **Dias restantes do trial?** — **B — Só últimos 3 dias.** **Futuro.**
434. **CTA ao fim do trial?** — **A — Assinar Atendly.** **Futuro.**

> [!important]
> Após esta rodada, o usuário decidiu **não implementar cobrança/planos antes da validação prática**. Também deixou em aberto se a Agenda será gratuita ou se haverá planos Básico/Pro. Portanto, 404–434 são apenas hipóteses de monetização e não regras do MVP.

# Rodada 16 — Validação controlada

435. **Quem entra no primeiro teste?** — **A — Pessoas conhecidas/controladas.** **Vigente.** Na prática: usuário e namorada do estúdio de beleza.
436. **Quantos usuários no primeiro ciclo?** — **A — 3 a 5 sugeridos**, porém validação inicial ficou ainda mais simples e controlada. **Direção.**
437. **Cadastro deve parecer beta/fechado?** — **Resposta customizada:** produto pronto para produção, sem mencionar beta; testes controlados pelo próprio usuário. **Vigente.**
438. **Como liberar acesso?** — **Resposta customizada:** enviar o link diretamente. **Vigente.**
439. **Usuários precisam saber que é beta?** — **B — Não.** **Vigente.**
440. **Onboarding assistido?** — **B — Não; usar produto normalmente.** **Vigente.**
441. **Pode usar WhatsApp pessoal desde o início?** — **A — Sim.** **Vigente.**
442. **IA atende clientes reais desde o primeiro teste?** — **A — Sim.** **Vigente.**
443. **Modo observação permanente?** — **C — Não implementar.** **Vigente.**
444. **Se houvesse observação, o que registrar?** — **B recomendado**, mas **descartado** porque modo observação foi removido.
445. **Interface admin para revisar decisões?** — **A recomendado originalmente**, mas **descartado para MVP**.
446. **Área admin separada?** — **B — Não por enquanto.** **Vigente.**
447. **Kill switch remoto de admin?** — **B — Não.** **Vigente para MVP.**
448. **Comportamento anormal da IA?** — **B + C recomendados conceitualmente**, mas sem painel/admin específico. **Regra de segurança operacional pode existir sem UX admin.**
449. **Limite de mensagens automáticas seguidas?** — **B — Sim, limite simples.** **Vigente conceitualmente.**
450. **Limite inicial?** — **B — 3 mensagens consecutivas.** **Vigente como proteção de produto.**
451. **Falha ao persistir agendamento?** — **B — Nunca confirmar antes de concluir.** **Vigente e regra absoluta.**
452. **Hipótese principal do teste?** — **B — IA assumir parcela relevante do atendimento sem atrapalhar.** **Referência de validação.**
453. **Principal métrica quantitativa?** — **B recomendada**, mas usuário pediu **não implementar métricas de validação**. **Fora do MVP como instrumentação específica.**
454. **Sinal inicial de sucesso?** — **B sugerido >60%**, mas **não consolidado como meta rígida**.
455. **Métricas adicionais de validação?** — **Não implementar métricas específicas de experimento.**
456. **Registrar correções do profissional como qualidade?** — **A recomendado**, mas não criar camada específica de métricas de beta. Histórico operacional normal continua útil.
457. **Perguntar motivo ao assumir?** — **C recomendado**, porém não transformar em formulário de feedback experimental.
458. **Botão reportar problema na resposta?** — **B — Não.** **Vigente.**
459. **Contexto automático de reporte?** — **Descartado** porque botão de reporte não entra.
460. **Como coletar feedback inicial?** — **A — Conversas diretas.** **Vigente.**
461. **Quando conversar com testers?** — **B — primeiro dia + uma semana.** **Direção de processo, não feature.**
462. **Pergunta qualitativa mais útil?** — **B — Em quais situações ainda preferiu responder manualmente e por quê?** **Direção.**
463. **Implementar tudo antes de testar?** — **A por decisão posterior:** sim, MVP completo antes da validação. **Vigente.**
464. **Qual fluxo é central?** — **A — WhatsApp → serviço → agenda → horário → confirmação → agendamento.** **Vigente.**
465. **Features secundárias antes de testar?** — **A por decisão posterior:** tudo que foi definido como MVP entra antes da validação. **Vigente.**
466. **Importação entra antes da validação?** — **A por decisão posterior:** faz parte do MVP completo. **Vigente.**
467. **Distinguir MVP final e Beta 1?** — **B — Não; um único escopo chamado MVP.** **Vigente.**

# Rodada 17 — Corte de MVP inicial

468–500. **Rodada não consolidada.** Ela propunha um “primeiro release utilizável” menor que o MVP completo. O usuário rejeitou a premissa e definiu que **tudo que já havia sido especificado compõe um único MVP**, ainda que o desenvolvimento seja executado em etapas internas sequenciais. As escolhas recomendadas dessa rodada não devem ser usadas para remover features do MVP.

# Rodada 18 — Conta, acesso e integridade de produto

468. **Como criar conta?** — **A — Nome + e-mail + senha.** **Vigente.**
469. **Verificação de e-mail no MVP?** — **C — Não implementar.** **Vigente.**
470. **Recuperação de senha?** — **B — Código por e-mail na UX, porém no MVP apenas frontend visual, sem ação real.** **Vigente.**
471. **Alterar e-mail da conta?** — **B — Não no MVP.** **Vigente.**
472. **Relação usuário-negócio no MVP?** — **A — 1 usuário → 1 negócio.** **Vigente.**
473. **Mesmo e-mail pode participar de outro negócio futuramente?** — **A — Não preparar essa experiência; conta permanece ligada a um negócio.** **Vigente como direção atual.**
474. **Nome da conta e nome exibido podem divergir?** — **A — Sim.** **Vigente.**
475. **Dados básicos editáveis depois?** — **A — Nome, segmento, modalidades, endereço e fuso.** **Vigente.**
476. **Alterar fuso muda agendamentos existentes?** — **B — Não alterar compromissos já marcados; mudança afeta apresentação/regras futuras.** **Vigente no comportamento.**
477. **Alterar segmento muda dados existentes?** — **B — Não; só contexto/defaults futuros.** **Vigente.**
478. **Mesmo WhatsApp em dois negócios?** — **B — Não.** **Vigente.**
479. **Trocar número: como fica histórico?** — **A — Conversas antigas permanecem associadas ao negócio, sem diferenciação visual de “número antigo”.** **Vigente.**
480. **Clientes do número antigo continuam?** — **A — Sim.** **Vigente.**
481. **Usuário pode impedir armazenamento por conversa?** — **A — Não no MVP.** **Vigente.**
482. **Se houvesse “não armazenar”, manter metadados?** — **Pergunta perde relevância**, pois 481A manteve armazenamento.
483. **Ignorar IA fica fora do processamento da IA?** — **A — Sim.** **Vigente.**
484. **Pessoal volta a ser analisado quando?** — **C — Nova sessão de 24h pode ser reavaliada, salvo Ignorar IA.** **Vigente.**
485. **Registrar autoria de ações?** — **A — Sim, histórico operacional.** **Vigente.**
486. **Mostrar histórico ao usuário?** — **B — Seção de histórico de alterações.** **Vigente.**
487. **Edição concorrente manual enquanto IA opera?** — **C — Bloquear temporariamente a edição manual.** **Vigente.**
488. **Profissional altera enquanto IA remarca?** — **B recomendado**, mas 487C prevalece durante a operação transacional; após liberar, IA trabalha com estado atual.
489. **LLM indisponível?** — **A — Não responder e colocar conversa para humano.** **Vigente.**
490. **Mensagem automática ao cliente sobre instabilidade?** — **C — Nenhuma.** **Vigente.** Usuário recebe logs/aviso interno.
491. **Agenda indisponível?** — **B — Não oferecer horários; handoff.** **Vigente.**
492. **Falha de envio?** — **A — Uma tentativa e depois erro/handoff.** **Vigente.**
493. **Excluir cliente?** — **C — Excluir cadastro preservando histórico necessário.** **Direção conceitual**, mas fluxo LGPD self-service depois foi removido do MVP.
494. **Cliente arquivado pode voltar?** — **A — Sim.** **Vigente.**
495. **Cliente arquivado manda mensagem?** — **C — Reconhecer e reativar quando houver nova relação comercial.** **Vigente.**
496. **Excluir dados de cliente por solicitação dentro da UI?** — **C — Não no MVP.** **Vigente.**
497. **Como anonimizar em eventual exclusão?** — **B recomendado**, porém fluxo não é parte da UI do MVP; tema jurídico futuro.
498. **Relações entre clientes entram na exclusão?** — **A recomendado**, mas segue como tema jurídico futuro.
499. **Login em múltiplos dispositivos?** — **A — Permitido.** **Vigente.**
500. **Gerenciar sessões?** — **C — Só “Sair de todos os dispositivos”.** **Vigente.**
501. **2FA?** — **C — Futuro.** **Vigente fora do MVP.**

# Rodada 19 — Notificações e atenção

502. **Central de notificações?** — **A — Sim.** **Vigente.**
503. **O que entra?** — **B — Eventos relevantes que exigem atenção/informam operação.** **Vigente.**
504. **Novo agendamento gera notificação?** — **C — Configurável, default desativado.** **Vigente.**
505. **Handoff gera notificação?** — **A — Sempre.** **Vigente.**
506. **Níveis de alerta?** — **B — Informativa / atenção / crítica.** **Vigente.**
507. **Críticos aparecem onde?** — **B — Banner persistente + central.** **Vigente.**
508. **Quais justificam banner?** — **B — WhatsApp desconectado, IA indisponível, configuração impeditiva.** **Vigente.**
509. **IA indisponível muda status?** — **A — `IA com instabilidade`.** **Vigente.**
510. **Depois da recuperação?** — **A — Volta automaticamente ao estado ativo quando apropriado.** **Vigente.**
511. **Handoff sobe na lista?** — **A — Sim.** **Vigente.**
512. **Ordem dos handoffs?** — **C — Gravidade e depois tempo.** **Vigente.**
513. **IA classifica prioridade?** — **A — Sim, para ordenação interna.** **Vigente.**
514. **Mostrar tempo aguardando?** — **A — Sim.** **Vigente.**
515. **Abrir conversa significa assumir?** — **A — Não; continua aguardando até mensagem.** **Vigente.**
516. **Primeira resposta humana muda estado?** — **A — Sim, para Você atendendo.** **Vigente.**
517. **E-mail real para alertas críticos?** — **A — Sim.** **Vigente.**
518. **Quais eventos geram e-mail?** — **B — WhatsApp desconectado + falha crítica prolongada da IA.** **Vigente.**
519. **Quanto esperar em falha da IA antes de e-mail?** — **B — 5 min contínuos.** **Vigente como UX operacional.**
520. **Quanto esperar na desconexão do WhatsApp?** — **B — 5 min de tentativa antes de alertar externamente.** **Vigente.**
521. **IA caiu e chega mensagem comercial?** — **A — Aguardando humano.** **Vigente.**
522. **IA recupera após handoff?** — **B — Continua humano até Retomar IA.** **Vigente.**
523. **IA recupera antes do humano assumir?** — **A — Ainda permanece aguardando humano.** **Vigente.**
524. **Falha ao criar agendamento?** — **B — Tentar uma vez; se falhar, handoff.** **Vigente.**
525. **Motivo técnico para profissional?** — **B — Explicação amigável + detalhes opcionais.** **Vigente como UX.**
526. **Mensagem “cliente ainda não recebeu confirmação” + detalhe técnico opcional?** — **A — Adequado.** **Vigente em produto; detalhes técnicos específicos ficam fora deste vault.**
527. **Quando bloquear edição manual?** — **B — Só durante operação transacional naquele agendamento.** **Vigente.**
528. **Como avisar bloqueio?** — **B — Mensagem clara de que IA está atualizando.** **Vigente.**
529. **Tempo máximo do bloqueio?** — **B — Curto; liberar/falhar rapidamente.** **Vigente como UX, sem fixar implementação aqui.**
530. **Notificações lida/não lida?** — **A — Sim.** **Vigente.**
531. **Problema resolvido automaticamente?** — **B — Permanecer no histórico como resolvido.** **Vigente.**
532. **Histórico de notificações?** — **A — 30 dias.** **Vigente.**

# Rodada 20 — Conhecimento do negócio

533. **Como estruturar conhecimento?** — **C — Dados estruturados + campo livre complementar.** **Vigente.**
534. **Informações básicas estruturadas?** — **B — Nome, descrição, modalidades, endereço, pagamentos, estacionamento, acessibilidade, redes, instruções.** **Vigente.**
535. **Formas de pagamento?** — **B — Seleção de formas + observação.** **Vigente.**
536. **Parcelamento?** — **A — Opcional.** **Vigente.**
537. **Instruções adicionais do endereço?** — **A — Sim.** **Vigente.**
538. **Área atendida a domicílio?** — **B — Texto livre no MVP.** **Vigente.**
539. **Modalidade por serviço?** — **A — Sim.** **Vigente.**
540. **Agendamento registra modalidade?** — **A — Sim quando houver mais de uma opção.** **Vigente.**
541. **Endereço do cliente em domicílio?** — **A — Sim no agendamento.** **Vigente.**
542. **Salvar endereço no cliente?** — **B — Permitir/perguntar.** **Vigente.**
543. **Área de FAQ?** — **A — Sim.** **Vigente.**
544. **IA sugere FAQs automaticamente?** — **C — Não no MVP.** **Vigente.**
545. **FAQ por serviço?** — **A — Sim.** **Vigente.**
546. **Campo livre de conhecimento?** — **A — Um campo “Outras informações importantes”.** **Vigente.**
547. **Orientar preenchimento?** — **B — Texto livre + exemplos.** **Vigente.**
548. **IA pode alterar texto original?** — **C — Não alterar conteúdo original; apenas interpretar para uso.** **Vigente.**
549. **Conflitos de conhecimento?** — **C — Hierarquia entre fontes.** **Vigente.**
550. **Hierarquia?** — **A — Regra de serviço > FAQ > dados estruturados > campo livre.** **Vigente como orientação.**
551. **Instrução privada vence descrição pública?** — **A — Sim.** **Vigente.**
552. **Avisos temporários como entidade?** — **C — Não; indisponibilidades ficam na Agenda/bloqueios.** **Vigente.**
553. **Avisos temporários têm prioridade?** — **Descartada**, pois entidade foi removida.
554. **Aviso expira automaticamente?** — **Descartada.**
555. **Pergunta não cadastrada?** — **B — Não inventar.** **Vigente.**
556. **Sempre oferecer humano quando não sabe?** — **B — Não; só quando necessário.** **Vigente.**
557. **Pergunta desconhecida material para decisão/segurança?** — **B — Handoff obrigatório.** **Vigente.**
558. **Orientação médica/jurídica etc.?** — **B — Não ir além do que foi explicitamente informado pelo profissional.** **Vigente.**
559. **Instruções pré-atendimento estruturadas?** — **B — Não no MVP.** **Vigente.**
560. **Quando enviar instrução pré?** — **Descartada** porque feature saiu do MVP.
561. **Instruções pós-atendimento?** — **B — Não no MVP.** **Vigente.**
562. **Aprender conhecimento automaticamente de conversa humana?** — **B — Não.** **Vigente.**
563. **Correção humana atualiza conhecimento automaticamente?** — **B — Não no MVP.** **Vigente.**
564. **Dados cadastrados ficam disponíveis à IA?** — **A — Sim, exceto campos privados.** **Vigente.**
565. **Observação interna de cliente?** — **A — Só se autorizada.** **Vigente.**
566. **Instrução privada de serviço?** — **A — IA pode usar, sem revelar literalmente.** **Vigente.**
567. **Regra interna “encaminhar desconto”?** — **B — Executar sem revelar a instrução.** **Vigente.**
568. **Onde cadastrar conhecimento?** — **B — Nos módulos correspondentes; IA consome.** **Vigente.**
569. **Configurações → IA contém o quê?** — **A — estilo, comportamento, automação/status.** **Vigente.**
570. **Tela “O que minha IA sabe?”** — **C — Depois.** **Futuro.**

# Rodada 21 — Limites funcionais da Agenda

571. **Agendamentos recorrentes entram?** — **A — Sim, recorrência completa orientada por serviço.** **Vigente**, refinada em rodadas 21A/21B.
572. **Cliente pede recorrência mensal?** — **A ajustado — IA pode criar múltiplos próximos agendamentos, pelo menos 3 quando solicitado.** **Vigente.**
573. **Lista de espera?** — **C — Não; oferecer outros horários.** **Vigente fora do MVP.**
574. **Sem horário na data pedida?** — **B — Oferecer automaticamente opções próximas em outros dias.** **Vigente.**
575. **Até onde procurar?** — **C — Dentro da janela máxima, retornando melhores opções.** **Vigente.**
576. **Disponibilidade específica por serviço?** — **B — Não no MVP; serviços seguem disponibilidade geral.** **Vigente.**
577. **Serviço pode ser desativado?** — **A — Sim.** **Vigente.**
578. **Agendamentos futuros de serviço desativado?** — **B — Permanecem válidos.** **Vigente.**
579. **Cliente pede serviço inativo?** — **B — Informar indisponibilidade e alternativas.** **Vigente.**
580. **Atender simultaneamente mais de um cliente?** — **B — Não como capacidade automática.** **Vigente.**
581. **Sobreposição manual continua exceção?** — **A — Sim.** **Vigente.**
582. **Alterar duração de um agendamento específico?** — **A — Sim manualmente.** **Vigente.**
583. **IA altera duração sozinha?** — **B — Não.** **Vigente.**
584. **Cliente pede mais tempo?** — **C — Confirmar com profissional/handoff.** **Vigente.**
585. **Agendamento manual sem serviço cadastrado?** — **B — Sim, com título e duração manual.** **Vigente.**
586. **IA cria atendimento sem serviço?** — **C — Não; handoff se não mapear.** **Vigente.**
587. **Conceito especial de avaliação?** — **B — Não; avaliação pode ser serviço.** **Vigente.**
588. **Serviço sem preço e cliente pergunta?** — **A — Informar que preço não está cadastrado e oferecer humano quando necessário.** **Vigente.**
589. **Sob consulta com agendamento permitido?** — **A — Agendar e informar que valor será definido depois.** **Vigente.**
590. **“A partir de R$100” vira preço previsto?** — **B — Não; manter como referência de valor inicial.** **Vigente.**
591. **Cliente pode ter vários futuros?** — **A — Sim.** **Vigente.**
592. **Mesmo serviço/data/horário duplicado?** — **B — Detectar e confirmar intenção.** **Vigente.**
593. **Cliente já tem agendamento próximo?** — **A — Mencionar e confirmar antes de criar outro.** **Vigente.**
594. **Editar atendimento concluído?** — **B — Apenas valor/observações/status.** **Vigente.**
595. **Concluído → Não compareceu?** — **A — Sim.** **Vigente.**
596. **Apagar agendamento futuro?** — **B — Em geral cancelar e preservar histórico.** **Vigente.**
597. **Agendamento manual criado por engano?** — **B — Pode excluir se não houve interação com cliente.** **Vigente.**
598. **Busca global?** — **B — Não; busca por módulo.** **Vigente.**
599. **Filtros da Agenda?** — **A — Status + serviço.** **Vigente.**
600. **Busca em Conversas?** — **A — Nome, telefone e conteúdo.** **Vigente.**

# Rodada 21A original — Recorrência genérica

601–620. **Substituída antes de ser consolidada.** A primeira proposta tratava recorrência como série genérica semanal/quinzenal/mensal. O usuário redefiniu o conceito: **a frequência pertence ao serviço e é usada pela IA quando o cliente pede múltiplos próximos atendimentos**. As decisões vigentes estão na versão revisada abaixo.

# Rodada 21A revisada — Recorrência por serviço

601. **Recorrência do serviço é opcional?** — **A — Sim.** **Vigente.**
602. **Como configurar intervalo?** — **B — Quantidade + unidade, ex.: 2 semanas / 1 mês.** **Vigente.**
603. **Recorrência é obrigatória ou recomendação?** — **B — Default recomendado; cliente pode pedir outra frequência.** **Vigente.**
604. **Cliente pede “próximas manutenções” sem quantidade?** — **A — Perguntar quantas.** **Vigente.**
605. **Data ideal sem horário?** — **C — Buscar mesmo dia e depois datas próximas.** **Vigente.**
606. **Quanto afastar da data ideal?** — **B — Cerca de ±3 dias como referência.** **Vigente como comportamento inicial.**
607. **Próxima recorrência é calculada a partir de quê?** — **B — Data efetivamente marcada.** **Vigente.**
608. **Mostrar todas as ocorrências antes de criar?** — **A — Sim.** **Vigente.**
609. **Após “pode confirmar”?** — **A — Criar todas como uma operação lógica.** **Vigente.**
610. **Hold em todas as opções?** — **A — Sim.** **Vigente.**
611. **Uma opção deixa de estar disponível?** — **A — Preservar as demais e buscar substituta.** **Vigente.**
612. **Criar série permanente?** — **B — Não; depois de criados são agendamentos independentes.** **Vigente.**
613. **Remarcar só o segundo?** — **A com observação:** remarca o solicitado, mas IA verifica se a nova distância prejudica a cadência e pode perguntar sobre os seguintes. **Vigente.**
614. **Cliente quer mudar todos futuros do conjunto?** — **A — IA recalcula e apresenta nova proposta.** **Vigente.**
615. **Serviço sem recorrência e cliente pede 3?** — **A — Perguntar intervalo desejado.** **Vigente.**
616. **UX da configuração?** — **A — Toggle + “A cada X semanas/meses”.** **Vigente.**

# Rodada 21B — Relação entre recorrências

617. **Preservar relação técnica entre agendamentos do conjunto?** — **B — Sim, apenas o necessário para a IA reconhecer que nasceram juntos.** **Vigente conceitualmente**, sem expor série complexa.
618. **Mostrar agrupamento ao profissional?** — **B — Badge discreto de recorrência.** **Vigente.**
619. **Remarcação quebra cadência: perguntar sobre seguintes?** — **B — Só quando desvio for significativo.** **Vigente.**
620. **O que é significativo?** — **B — Tolerância proporcional ao intervalo, aproximadamente 20% como referência inicial.** **Vigente como regra de produto inicial.**
621. **Copy de alerta sobre cadência?** — **A — Sim, explicar distância e perguntar se quer ajustar seguintes.** **Vigente.**
622. **Cliente quer ajustar seguintes?** — **A — Recalcular futuros a partir da nova data.** **Vigente.**
623. **Mostrar proposta completa antes de mover?** — **A — Sim.** **Vigente.**
624. **Novo horário indisponível?** — **A — Buscar próximo adequado e reapresentar.** **Vigente.**
625. **Cliente prefere manter os outros?** — **A — Respeitar; recorrência é conveniência.** **Vigente.**
626. **Edição manual deve mostrar alerta de cadência?** — **B — Não; essa inteligência é do fluxo da IA.** **Vigente.**
627. **Alterar recorrência do serviço muda agendamentos existentes?** — **A — Não.** **Vigente.**

# Rodada 22 — Conversação natural e abandono de fluxo

628. **Pergunta secundária no meio do agendamento?** — **A — Responder e retomar naturalmente o ponto anterior.** **Vigente.**
629. **Pergunta secundária exige humano?** — **B — Handoff preservando contexto do fluxo.** **Vigente.**
630. **Retomar IA após humano?** — **B — Reavaliar contexto atual antes de continuar.** **Vigente.**
631. **Cliente some após horários?** — **A — Não enviar follow-up.** **Vigente.**
632. **Hold ao cliente sumir?** — **A — Expira; contexto permanece.** **Vigente.**
633. **Cliente volta 20 min depois e escolhe horário antigo?** — **B — Consultar novamente.** **Vigente.**
634. **Horário já ocupado?** — **A — Explicar e oferecer alternativas.** **Vigente.**
635. **Vários agendamentos numa conversa?** — **A — Sim, um objetivo por vez.** **Vigente.**
636. **Duas pessoas na mesma conversa?** — **A — Deixar claro para quem é cada agendamento.** **Vigente.**
637. **Resumo deve incluir nome quando há mais de uma pessoa?** — **A — Sim.** **Vigente.**
638. **Mensagens fragmentadas?** — **B — Debounce curto.** **Vigente.**
639. **Janela de debounce?** — **B — Aproximadamente 2–3 segundos.** **Vigente.**
640. **Nova mensagem enquanto IA gera resposta?** — **B — Reavaliar/cancelar resposta pendente quando possível.** **Vigente.**
641. **Cliente corrige terça para quarta?** — **A — Última correção clara prevalece.** **Vigente.**
642. **Corrige nome da pessoa?** — **A — Última correção clara prevalece.** **Vigente.**
643. **“Fim da tarde”?** — **B — Interpretar faixa razoável e oferecer opções.** **Vigente.**
644. **“Manhã / depois do almoço / noite”?** — **A — IA interpreta faixas aproximadas.** **Vigente.**
645. **“O mais cedo possível”?** — **A — Primeiro horário realmente disponível.** **Vigente.**
646. **“Qualquer horário”?** — **C — Escolher primeiro adequado e perguntar se pode confirmar.** **Vigente.**
647. **“Sexta” na quinta?** — **C — Próxima ocorrência futura e data explícita na confirmação.** **Vigente.**
648. **“Dia 15” sem mês?** — **C — Inferir pelo contexto; perguntar se necessário.** **Vigente.**
649. **Confirmação deve usar data explícita?** — **A — Sim.** **Vigente.**
650. **Pedido às 23h fora da disponibilidade?** — **B — Informar indisponibilidade e oferecer opções.** **Vigente.**
651. **Cliente insiste em exceção?** — **B — Oferecer humano.** **Vigente.**
652. **Múltiplas exceções na mesma conversa?** — **A — Um handoff contextualizado.** **Vigente.**
653. **Cliente irritado mas pedido claro?** — **A — Continuar resolvendo de forma objetiva.** **Vigente.**
654. **Ofensas?** — **B — Não revidar; manter postura neutra.** **Vigente.**
655. **Ameaça/assédio persistente?** — **B — Handoff e pausa.** **Vigente.**
656. **Repetir saudação na mesma sessão?** — **B — Não.** **Vigente.**
657. **Nova sessão após 24h?** — **B — Saudação contextual curta.** **Vigente.**
658. **Chamar cliente pelo nome?** — **A — Sim, naturalmente.** **Vigente.**
659. **Nome cadastrado estranho?** — **B — Não usar até haver nome confiável.** **Vigente.**
660. **Quantas confirmações finais?** — **A — Uma confirmação clara.** **Vigente.**
661. **“pode / fechou / beleza” vale confirmação?** — **A — Sim semanticamente.** **Vigente.**
662. **“acho que sim”?** — **B — Pedir confirmação clara.** **Vigente.**
663. **👍 confirma?** — **A — Sim.** **Vigente.**
664. **Áudio “pode marcar”?** — **A — Sim.** **Vigente.**
665. **Mandar “só um instante”?** — **B — Não.** **Vigente.**
666. **Se operação demorar muito?** — **A recomendado originalmente**, mas 665B estabelece preferência por não enviar mensagens rotineiras de espera; erro/timeout segue fluxo de instabilidade.
667. **Nunca confirmar antes de persistir?** — **A — Regra absoluta.** **Vigente.**

# Rodada 23 — Fronteiras do MVP

668. **Pagamento do serviço pela Atendly?** — **B — Futuro.**
669. **Sinal para confirmar agendamento?** — **B — Futuro.**
670. **Financeiro completo?** — **B — Futuro módulo separado.**
671. **Valor final cobrado opcional?** — **A — Continua no MVP.**
672. **Fidelidade?** — **B — Futuro.**
673. **Indicação?** — **B — Futuro.**
674. **Página do cliente?** — **B — Futuro.**
675. **Marketing/reativação WhatsApp?** — **B — Futuro.**
676. **Aniversário automático?** — **B — Futuro.**
677. **Avaliação pós-atendimento?** — **B — Futuro.**
678. **Google Calendar?** — **C — Nunca integrar agendas externas.** **Vigente como direção.**
679. **Futuras integrações de agenda?** — **C recomendado originalmente**, mas 678C endureceu a direção: Agenda Atendly permanece oficial e não sincroniza agendas externas.
680. **Multi-profissional no MVP?** — **B — Não; futuro.**
681. **Funcionários/login/permissões?** — **B — Futuro.**
682. **Vários números por negócio?** — **A — Nunca; um negócio = um número.** **Vigente.**
683. **App nativo?** — **B — Web responsiva/PWA primeiro; nativo futuro.**
684. **Push mobile?** — **B — Futuro.**
685. **Analytics avançado?** — **B — Futuro.**
686. **Relatórios PDF/Excel?** — **B — Futuro.**
687. **Exportação?** — **A — Fora do MVP, futura.**
688. **CRM/ERP?** — **B — Futuro conforme demanda.**
689. **IA treinada com conversas do profissional?** — **B — Futuro.**
690. **Prompt livre?** — **B — Futuro avançado.**
691. **Instagram/Facebook?** — **B — Futuro multicanal.**
692. **Grupos WhatsApp?** — **A — Pode ser avaliado futuramente; não MVP.**
693. **IA interpretar imagens?** — **A — Futuro.**
694. **IA interpretar documentos?** — **A — Futuro.**
695. **Áudio entra no MVP?** — **A — Sim.**
696. **Base de conhecimento por PDFs?** — **B — Futuro.**
697. **Lista de espera?** — **A — Fora do MVP, futura.**
698. **Recorrência por serviço?** — **A — MVP.**
699. **Importação Minha Agenda?** — **A — MVP.**
700. **Cobrança/planos agora?** — **B — Não implementar antes da validação prática.** **Vigente.**

# Rodada 24 — Identidade e comunicação da IA

701. **Nome Atendly aparece ao cliente?** — **A — Não; IA representa o negócio.** **Vigente.**
702. **Como se apresentar na primeira interação?** — **B — Saudação natural, sem anunciar assistente.** **Vigente.**
703. **Autônomo sem marca: como falar?** — **B — Atendimento natural em nome da pessoa.** **Vigente.**
704. **Profissional dá nome à IA?** — **B — Não.** **Vigente.**
705. **IA pode falar “temos/aceitamos”?** — **A — Sim.** **Vigente.**
706. **Quando falar nome do profissional?** — **A — Quando relevante.** **Vigente.**
707. **Estilo default?** — **B — Equilibrado.** **Vigente.**
708. **Profissional = formal corporativo?** — **B — Não; educado, claro e natural.** **Vigente.**
709. **Equilibrado?** — **A — Conversacional, simpático e com poucos emojis.** **Vigente.**
710. **Descontraído?** — **B — Casual e próximo, mantendo clareza.** **Vigente.**
711. **Estilo muda quantidade de mensagens?** — **B — Não; evitar spam.** **Vigente.**
712. **Gírias?** — **A — Moderadas apenas no Descontraído.** **Vigente.**
713. **Controle separado de emojis?** — **A — Não no MVP; preset controla.** **Vigente.**
714. **Perguntar nome antes de responder preço?** — **B — Não; pedir quando necessário para agendar.** **Vigente.**
715. **Quando pedir nome?** — **B — Após entregar disponibilidade, antes da confirmação final.** **Vigente.**
716. **Nome do perfil WhatsApp?** — **B — Pode sugerir, mas confirmar quando necessário.** **Vigente.**
717. **Perfil “Maria 💕”?** — **C — Confirmar “posso cadastrar no nome de Maria?”.** **Vigente.**
718. **Único profissional: perguntar escolha de profissional?** — **C — Não no MVP.** **Vigente.**
719. **Termo profissional na UI?** — **B — Evitar; usar minha agenda/meus horários.** **Vigente.**
720. **Como chamar tenant na UI?** — **A — Negócio.** **Vigente.**
721. **Usar nome exato do serviço?** — **B — IA pode falar naturalmente e mapear internamente.** **Vigente.**
722. **“Manutenção” ambígua?** — **A — Histórico forte pode orientar confirmação; sem histórico perguntar.** **Vigente.**
723. **Serviço não cadastrado?** — **A — Informar que não encontrou e sugerir alternativas relacionadas.** **Vigente.**
724. **Sem alternativa?** — **A — “Não encontrei entre os serviços disponíveis”, sem afirmar que negócio nunca faz.** **Vigente.**
725. **Avisar quando humano assume?** — **B — Não.** **Vigente.**
726. **Avisar quando IA retoma?** — **B — Não.** **Vigente.**
727. **“Estou falando com Camila?”** — **B — Explicar que é assistente virtual da Camila.** **Vigente.**
728. **Confirmação de agendamento: formato?** — **C — Frase natural + resumo estruturado.** **Vigente.**
729. **Lembretes seguem estilo?** — **A — Sim, mantendo objetividade.** **Vigente.**
730. **Cancelamento/remarcação final?** — **A — Sempre pequeno resumo.** **Vigente.**
731. **Imitar erros/gírias?** — **B com exceção:** escrita correta nos estilos normal/equilibrado; Descontraído permite `Oiii`, `confirmadoo` etc. **Vigente.**
732. **Cliente escreve em maiúsculas?** — **B — IA mantém estilo normal.** **Vigente.**
733. **Só emojis?** — **B — Sem intenção clara, não iniciar fluxo operacional.** **Vigente.**
734. **Só “?”?** — **A — Usar contexto da sessão.** **Vigente.**
735. **Como chamar a IA dentro da plataforma?** — **A — “IA”.** **Vigente.** Atendly é a plataforma.
736. **Estados “Atendly ativa”?** — **Substituída pela 735A:** usar `IA ativa / IA pausada / IA com instabilidade`.
737. **Estados na conversa?** — **A com nomenclatura refinada:** `IA atendendo / Aguardando você / Você atendendo`. **Vigente.**

# Rodada 25 — Ciclo de vida do WhatsApp

738. **Como chamar a área?** — **A — WhatsApp.** **Vigente.**
739. **Tela sem número conectado?** — **A — Explicação curta + CTA Conectar WhatsApp.** **Vigente.**
740. **Explicar que pode usar número pessoal/comercial?** — **A — Sim.** **Vigente.**
741. **Explicar acesso/organização das conversas antes de conectar?** — **A — Sim.** **Vigente.**
742. **Conexão desktop?** — **A — QR Code.** **Vigente.**
743. **Conexão mobile?** — **B — Código de vinculação copiável.** **Vigente.**
744. **Passo a passo visual no mobile?** — **A — Sim.** **Vigente.**
745. **Detectar conexão automaticamente?** — **A — Sim.** **Vigente.**
746. **Depois da conexão, antes do teste?** — **A — Mostrar número/status e CTA continuar.** **Vigente.**
747. **Número errado?** — **A — Pode trocar/desconectar antes do teste.** **Vigente.**
748. **Lista Ignorar IA antes da ativação?** — **A — Sim, opcional.** **Vigente.**
749. **Copy da lista?** — **A — “Quer impedir que a IA responda algumas pessoas?”** **Vigente.**
750. **Como escolher contatos ignorados?** — **C — Conversas/contatos + número manual.** **Vigente.**
751. **Sem agenda de contatos do aparelho?** — **A — Usar conversas existentes + número manual.** **Vigente.**
752. **Tela WhatsApp conectada mostra o quê?** — **A — Número, estado da conexão, estado da IA, última conexão, trocar/desconectar.** **Vigente.**
753. **Mostrar nome/foto do perfil?** — **A — Sim quando disponíveis.** **Vigente.**
754. **Desconectar WhatsApp?** — **B — Área de perigo com confirmação.** **Vigente.**
755. **Copy de confirmação?** — **A — Explicar que IA para, mas dados permanecem.** **Vigente.**
756. **Depois de desconectar manualmente?** — **A — IA desativada e nova vinculação exige teste.** **Vigente.**
757. **Queda involuntária?** — **A — Tentar reconectar automaticamente.** **Vigente.**
758. **Estado durante tentativa?** — **A — `Reconectando...`.** **Vigente.**
759. **Quando considerar desconectado?** — **B — Após cerca de 5 min de reconexão.** **Vigente.**
760. **Reconectou dentro da janela?** — **A — IA volta automaticamente se estava ativa.** **Vigente.**
761. **Reconexão automática posterior da mesma sessão?** — **A — Retomar sem novo teste quando sessão saudável é restabelecida.** **Vigente.**
762. **Trocar número?** — **A — Desconectar atual e iniciar novo fluxo.** **Vigente.**
763. **Avisar impacto da troca?** — **A — Sim.** **Vigente.**
764. **Novo número exige teste real?** — **A — Sim.** **Vigente.**
765. **Cliente mantém histórico ao trocar número do negócio?** — **A — Sim.** **Vigente.**
766. **QR/código expirou?** — **A — Gerar novo/CTA.** **Vigente.**
767. **Falha repetida de conexão?** — **A — Erro amigável + passos básicos + tentar novamente.** **Vigente.**
768. **Solução de problemas contextual?** — **A — Sim.** **Vigente.**
769. **Copy central de conexão?** — **A — “Conecte seu WhatsApp e continue usando ele normalmente.”** **Vigente como direção.**
770. **Dizer que IA sai de cena quando usuário responde?** — **A — Sim.** **Vigente.**

# Rodada 26 — Importação única detalhada

771. **Objetivo da importação?** — **A — Máximo de dados acessíveis.** **Vigente.**
772. **Categoria indisponível na origem?** — **A — Importar restante e informar limitação.** **Vigente.**
773. **Preview por categoria?** — **A — Sim.** **Vigente.**
774. **Cliente com nome + telefone?** — **A — Importar normal.** **Vigente.**
775. **Cliente sem telefone?** — **A — Importar.** **Vigente.**
776. **Cliente sem nome, com telefone?** — **B — Importar como cadastro incompleto.** **Vigente.**
777. **Mesmo telefone, nomes diferentes na origem?** — **B — Pessoas diferentes/possível duplicidade.** **Vigente.**
778. **Mesmo nome e telefone claramente repetidos?** — **A — Deduplicar.** **Vigente.**
779. **Serviço sem duração?** — **B — Importar como Precisa de revisão, sem IA agendar.** **Vigente.**
780. **Serviço sem preço?** — **A — Sem preço informado.** **Vigente.**
781. **Serviço importado entra ativo?** — **A — Sim, salvo impedimento operacional.** **Vigente.**
782. **Inferir recorrência de serviço pelo histórico?** — **A — Não; fica desativada até profissional configurar.** **Vigente.**
783. **O que preservar do histórico?** — **A — Data, horário, cliente, serviço, status, preço quando disponível.** **Vigente.**
784. **Agendamento futuro importado?** — **A — Vira agendamento normal da Atendly.** **Vigente.**
785. **Futuro sem serviço válido?** — **B — Preservar criando referência incompleta/arquivada apropriada.** **Vigente no produto.**
786. **Agendamento sem cliente identificável?** — **A — Criar cliente mínimo.** **Vigente.**
787. **Cancelado histórico?** — **A — Preservar.** **Vigente.**
788. **Falta histórica?** — **A — Preservar.** **Vigente.**
789. **Jornada importada conflita com Atendly?** — **C — Usuário escolhe.** **Vigente.**
790. **Sem horários na Atendly?** — **A — Importar automaticamente.** **Vigente.**
791. **Bloqueios/exceções da origem?** — **C — Importar futuros quando disponíveis.** **Vigente.**
792. **Cliente Atendly + origem com telefone/nome compatíveis?** — **A — Mesclar automaticamente.** **Vigente.**
793. **Mesmo telefone, nomes claramente diferentes?** — **B — Manter separados e pedir decisão.** **Vigente.**
794. **Serviço idêntico?** — **A — Considerar o mesmo.** **Vigente.**
795. **Mesmo nome, preço/duração divergentes?** — **C — Mostrar conflito.** **Vigente.**
796. **Nomes parecidos?** — **B — Sugerir correspondência, usuário confirma.** **Vigente.**
797. **Agendamento futuro claramente duplicado?** — **A — Deduplicar.** **Vigente.**
798. **Poucos conflitos bloqueiam tudo?** — **B — Não; importar válidos e revisar conflitos.** **Vigente.**
799. **Pode concluir com conflitos fora?** — **A — Sim, com aviso de perda definitiva daquela oportunidade.** **Vigente.**
800. **Confirmação forte antes de concluir única importação?** — **A — Sim.** **Vigente.**
801. **Relação com credenciais após concluir?** — **A — Encerrar.** **Vigente.**
802. **Histórico da importação mostra?** — **A — Origem, data, totais, ignorados/falhos, status.** **Vigente.**
803. **Configurações → Importação depois?** — **A — Histórico sem CTA de nova importação.** **Vigente.**
804. **Mensagem final da migração?** — **A — Atendly vira fonte oficial e Minha Agenda não sincroniza.** **Vigente.**

# Rodada 27 — Continuidade, autosave e estados vazios

805. **Salvar progresso do onboarding?** — **A — Sim, por etapa concluída.** **Vigente.**
806. **Salvar etapa parcialmente preenchida?** — **B — Não; apenas etapas concluídas.** **Vigente.**
807. **Ao voltar, onde retomar?** — **A — Próxima etapa pendente.** **Vigente.**
808. **Pode voltar etapas?** — **A — Sim.** **Vigente.**
809. **Alteração retroativa invalida etapas posteriores?** — **B — Preservar dados e recalcular fluxo/conflitos.** **Vigente.**
810. **Botão “Sair e continuar depois”?** — **B — Não necessário; fechar é suficiente com autosave.** **Vigente.**
811. **Progresso do onboarding?** — **B — Barra sem quantidade explícita.** **Vigente.**
812. **Progresso representa o quê?** — **B — Grandes blocos.** **Vigente.**
813. **Botão Voltar?** — **A — Sim.** **Vigente.**
814. **Quando validar campos?** — **C — Formatos simples durante digitação; regra de negócio ao continuar.** **Vigente.**
815. **Erros aparecem onde?** — **A — Próximo ao campo.** **Vigente.**
816. **Erro ao salvar etapa?** — **A — Preservar valores e retry.** **Vigente.**
817. **Conexão cai?** — **A — Preservar estado local e sinalizar erro, sem prometer modo offline completo.** **Vigente como UX.**
818. **Horário final anterior ao inicial?** — **B — Erro e bloquear avanço.** **Vigente.**
819. **Dia ativo sem horário?** — **B — Não concluir.** **Vigente.**
820. **Copiar horários para outros dias?** — **A — Sim.** **Vigente.**
821. **Serviço sem preço?** — **B — Badge discreto `Preço não informado`.** **Vigente.**
822. **Serviço importado sem duração?** — **B — `Precisa de revisão`, IA não agenda.** **Vigente.**
823. **Home destaca pendências de serviço?** — **A — Sim, se impactam atendimento.** **Vigente.**
824. **Agenda vazia?** — **B — Empty state + Criar agendamento.** **Vigente.**
825. **Clientes vazios?** — **A — Explicar como clientes surgem + ação.** **Vigente.**
826. **Conversas vazias sem WhatsApp?** — **B — Explicar conexão + CTA.** **Vigente.**
827. **Conversas vazias com WhatsApp conectado?** — **A — Explicar que aparecerão quando chegarem mensagens.** **Vigente.**
828. **Serviços vazios?** — **A — CTA primeiro serviço.** **Vigente.**
829. **Desativar serviço pede confirmação?** — **B — Só se houver futuros.** **Vigente.**
830. **Serviço com futuros pode ser desativado?** — **A — Sim; existentes continuam válidos.** **Vigente.**
831. **Cancelar agendamento manual pede confirmação?** — **A — Sim.** **Vigente.**
832. **Marcar Não compareceu pede confirmação?** — **B — Não.** **Vigente.**
833. **Formato de hora no MVP?** — **A — 24h.** **Vigente na UX brasileira.**
834. **Formato de data?** — **A — dd/MM/aaaa.** **Vigente na UX brasileira.**
835. **Moeda do MVP?** — **A — BRL/R$.** **Vigente na UX brasileira.**
836. **Telefone?** — **A — UX brasileira, preparado para formato internacional futuramente.** **Vigente no produto.**
837. **Salvar alterações na área logada?** — **C — Ações simples imediatas; formulários usam Salvar.** **Vigente.**
838. **Sair com alterações não salvas?** — **B — Avisar.** **Vigente.**
839. **Toast de sucesso?** — **B — Só quando não houver feedback visual suficiente.** **Vigente.**
840. **Reabrir onboarding como wizard depois de concluído?** — **A — Não.** **Vigente.**
841. **Onboarding sem WhatsApp: como continuar depois?** — **A — Checklist leva ao fluxo de conexão.** **Vigente.**
842. **Falta serviço/horário para ativar?** — **A — Checklist abre módulo exato.** **Vigente.**

# Rodada 28 — Internacionalização futura sem globalizar o MVP

843. **Idioma do negócio deve estar preparado conceitualmente?** — **B — Sim, MVP pt-BR.** **Vigente como direção futura; detalhes técnicos fora deste vault.**
844. **Idioma da interface no MVP?** — **A — Português.** **Vigente.**
845. **Textos devem ser preparados para tradução futura?** — **B — Sim.** **Vigente como requisito de produto futuro, sem expor seletor.**
846. **Cliente escreve em inglês?** — **B — IA pode responder no idioma do cliente.** **Vigente.**
847. **Estilos funcionam em outros idiomas?** — **A — Sim.** **Vigente.**
848. **Moeda principal do negócio?** — **A — Sim; MVP BRL.** **Vigente conceitualmente.**
849. **Multi-moeda no mesmo negócio?** — **B — Não preparar agora.** **Vigente.**
850. **Detalhe técnico de armazenamento monetário?** — **Resposta recomendada foi técnica.** **Não consolidada neste vault**, apenas preservar que valores devem permitir internacionalização futura.
851. **Fuso do negócio é obrigatório conceitualmente?** — **A — Sim.** **Vigente.**
852. **Formato técnico do fuso?** — **Pergunta técnica.** Fora deste pacote; produto deve suportar fusos globais futuramente.
853. **Como armazenar timestamps?** — **Pergunta técnica.** Fora deste pacote.
854. **Como representar regra semanal e fuso?** — **Pergunta técnica.** Fora deste pacote.
855. **Formato técnico do telefone?** — **Pergunta técnica.** Fora deste pacote; produto deve suportar internacionalização futura.
856. **País do negócio deve existir conceitualmente?** — **A — Sim; MVP Brasil.** **Vigente.**
857. **Usuário escolhe Brasil no onboarding?** — **B — Não; não perguntar quando só há uma opção.** **Vigente.**
858. **Endereço estruturado para futuro global?** — **B — Sim de forma compatível, sem complicar UI.** **Vigente no produto.**
859. **Estado/Região deve ser globalmente adaptável?** — **B — Sim, UI brasileira mostra Estado.** **Vigente como direção.**
860. **Formatação depende do idioma/região no futuro?** — **A — Sim.** **Vigente.**
861. **12h/24h no futuro?** — **A — Conforme região.** **Vigente.**
862. **Enums internos em inglês?** — **Pergunta técnica.** Fora deste pacote.
863. **Tipos internos de preço?** — **Pergunta técnica.** Fora deste pacote.
864. **Essas decisões adicionam telas no MVP?** — **A — Não; são preparação futura, sem UX adicional.** **Vigente.**

# Rodada 29 — Privacidade e consentimentos

865. **Aceite de Termos/Privacidade?** — **A — Checkbox obrigatório, desmarcado.** **Vigente.**
866. **Links abrem onde?** — **A — Páginas próprias na Atendly.** **Vigente.**
867. **Confirmação específica antes de conectar WhatsApp?** — **A — Sim.** **Vigente.**
868. **Formato da confirmação?** — **A — Checkbox obrigatório.** **Vigente.**
869. **Perguntar se número é pessoal?** — **A — Sim.** **Vigente.**
870. **Se for pessoal?** — **A — Reforçar orientação sobre classificação e Ignorar IA.** **Vigente.**
871. **Se for só comercial, remover proteções?** — **A — Não; manter.** **Vigente.**
872. **Conversa Pessoal deve indicar IA desativada?** — **A — Sim.** **Vigente.**
873. **Busca de Conversas inclui pessoais?** — **C — Usuário escolhe via filtro.** **Vigente.**
874. **Home/métricas usam conversas pessoais?** — **A — Nunca.** **Vigente.**
875. **IA relê histórico pessoal para melhorar classificação?** — **B — Não; usar estado/metadados, não conteúdo íntimo antigo.** **Vigente.**
876. **Ignorar IA torna histórico indisponível para IA?** — **A — Sim.** **Vigente.**
877. **Onde configurar retenção?** — **A — Configurações → Conversas → Retenção.** **Vigente.**
878. **Opções?** — **A — 30/90/180/365 dias.** **Vigente.**
879. **Defaults Comercial/Pessoal?** — **A — 90 / 30 dias.** **Vigente.**
880. **Reduzir retenção apaga conteúdo antigo?** — **C — Avisar e confirmar antes.** **Vigente.**
881. **Conversa pode permanecer depois de conteúdo expirar?** — **A — Sim, com indicação.** **Vigente.**
882. **Diferenciar conteúdo armazenado/visível/usável pela IA?** — **A — Sim conceitualmente.** **Vigente.**
883. **Histórico comercial antigo é sempre enviado inteiro à IA?** — **B — Não; usar apenas contexto relevante.** **Vigente.**
884. **Conversas antigas viram memória estruturada?** — **B — Fatos operacionais confirmados, principalmente agendamentos; não mineração irrestrita.** **Vigente.**
885. **Consentimento por cliente no cadastro?** — **A — Não criar fluxo próprio no MVP.** **Vigente.**
886. **Data de nascimento?** — **B — Não no cadastro do MVP.** **Vigente.**
887. **E-mail do cliente?** — **B — Não no cadastro básico.** **Vigente.**
888. **Cadastro básico confirmado?** — **A — Nome, telefone quando houver, observações, tags, histórico.** **Vigente.**
889. **Observação interna aceita texto livre?** — **A — Sim.** **Vigente.**
890. **Orientação sobre dados desnecessários?** — **A — Sim.** **Vigente.**
891. **Observação disponível para IA exige ação explícita?** — **A — Sim.** **Vigente.**
892. **Logs técnicos guardam conversa completa sempre?** — **B — Não como padrão.** **Direção de privacidade; implementação fora deste vault.**
893. **Erros podem expor dados técnicos sensíveis?** — **A — Não.** **Vigente.**
894. **Senha do Minha Agenda deve permanecer?** — **A — Não manter relação permanente.** **Vigente no produto; detalhes técnicos fora deste vault.**
895. **Sessão temporária de importação?** — **A recomendado tecnicamente.** Fora deste pacote; intenção é apenas não manter conexão após migração.
896. **Mensagem obrigatória em toda conversa dizendo que é IA?** — **B — Não; transparência quando perguntado.** **Vigente.**
897. **Termos/configurações deixam responsabilidade clara?** — **A — Sim.** **Vigente.**
898. **Excluir conta desconecta WhatsApp?** — **A — Sim imediatamente.** **Vigente.**
899. **Cancelar exclusão exige reconectar/testar?** — **A — Sim.** **Vigente.**
900. **Após exclusão definitiva, manter tudo para sempre?** — **A — Não; aplicar política de exclusão/retenção apropriada.** **Vigente conceitualmente.**

# Rodada 30 original — UX/UI antes da prioridade mobile-first

901–948. **Substituída pela Rodada 30 revisada.** A primeira versão partia de uma distribuição mais equilibrada entre desktop e mobile. O usuário definiu explicitamente a prioridade **Mobile → Tablet → Notebook → Desktop**, com interface nascendo no mobile. Portanto, as decisões vigentes estão na versão revisada abaixo.

# Rodada 30 revisada — UX mobile-first

901. **Navegação principal no mobile?** — **A — Bottom nav com 5 itens: Início / Conversas / Agenda / Clientes / Mais.** **Vigente.**
902. **Serviços no mobile ficam onde?** — **A — Dentro de Mais.** **Vigente.**
903. **Home mobile prioriza o quê?** — **A — Status da IA + pendências + próximos atendimentos.** **Vigente.**
904. **Métricas no mobile?** — **A — Poucas, compactas e secundárias.** **Vigente.**
905. **Home desktop pode ganhar mais contexto?** — **A — Sim.** **Vigente.**
906. **Agenda mobile principal?** — **A — Dia + seletor horizontal de datas.** **Vigente.**
907. **Topo da Agenda mobile?** — **A — Data atual + navegação + calendário.** **Vigente.**
908. **Eventos do dia no mobile?** — **B — Cards/linhas em lista cronológica.** **Vigente.**
909. **Mostrar slots vazios no mobile?** — **B — Não; mostrar eventos e botão Novo.** **Vigente.**
910. **Criar novo evento no mobile?** — **A — Botão + fixo/flutuante.** **Vigente.**
911. **Ao tocar +?** — **A — Agendamento / Compromisso / Bloqueio.** **Vigente.**
912. **Criar/editar agendamento mobile?** — **A — Tela full-screen.** **Vigente.**
913. **Conversas mobile?** — **A — Abas Comercial / Não classificadas / Pessoal.** **Vigente.**
914. **Linha da conversa mostra?** — **A — Nome, última mensagem, horário e estado.** **Vigente.**
915. **Estado operacional?** — **A — Badge/texto claro.** **Vigente.**
916. **Abrir conversa mobile?** — **A — Chat full-screen.** **Vigente.**
917. **Informações do cliente no chat mobile?** — **A — Pelo cabeçalho.** **Vigente.**
918. **Sugestão da IA durante atendimento humano?** — **A — Card discreto acima do campo de mensagem.** **Vigente.**
919. **Clientes mobile?** — **A — Lista com busca fixa/visível.** **Vigente.**
920. **Informação na lista de clientes?** — **A — Nome, telefone, último/próximo quando relevante.** **Vigente.**
921. **Perfil do cliente mobile?** — **A — Resumo + seções/abas simples.** **Vigente.**
922. **Lista de serviços mobile?** — **A — Nome, duração, preço e status.** **Vigente.**
923. **Editar serviço mobile?** — **A — Tela própria.** **Vigente.**
924. **Mais abre o quê?** — **A — Lista simples de destinos.** **Vigente.**
925. **Configuração no mobile?** — **A — Uma tela por seção.** **Vigente.**
926. **Evitar mais de um formulário importante na mesma tela?** — **A — Sim.** **Vigente.**
927. **Tablet se parece mais com quê?** — **A — Mobile ampliado com contexto extra.** **Vigente.**
928. **Conversas em tablet landscape?** — **A — Lista + chat.** **Vigente.**
929. **Agenda tablet landscape?** — **C — Usuário pode escolher Dia/Semana.** **Vigente.**
930. **Conversas desktop amplo?** — **A — Lista + chat + cliente.** **Vigente.**
931. **Notebook menor?** — **A — Lista + chat; cliente sob demanda.** **Vigente.**
932. **Agenda desktop?** — **A — Semana em grade.** **Vigente.**
933. **Clientes desktop?** — **A — Lista/tabela compacta com mais colunas.** **Vigente.**
934. **Ações secundárias?** — **A — Menu `•••` quando pouco frequentes.** **Vigente.**
935. **Quantas ações primárias por tela?** — **A — Uma evidente.** **Vigente.**
936. **Informações avançadas?** — **A — Sob demanda.** **Vigente.**
937. **Empty state?** — **A — Explicar área e ação clara.** **Vigente.**
938. **Erro?** — **A — O que ocorreu + o que fazer.** **Vigente.**
939. **Estética?** — **A — Clean, elegante, profissional, espaçosa e hierárquica.** **Vigente.**
940. **Componentes priorizam?** — **A — Clareza e consistência.** **Vigente.**
941. **Uso de cards?** — **A — Só quando agrupam informação de verdade.** **Vigente.**
942. **Botões?** — **A — Uma ação primária forte e secundárias discretas.** **Vigente.**
943. **Ícones?** — **A — Acompanhar texto quando ação não for óbvia.** **Vigente.**
944. **Gestos escondidos?** — **A — Podem ser atalho, nunca única forma.** **Vigente.**
945. **Uma decisão principal por tela no onboarding?** — **A — Sim, como regra preferencial.** **Vigente.**
946. **Formulário longo?** — **A — Quebrar em microetapas coerentes.** **Vigente.**
947. **Continuar no mobile?** — **A — Próximo do rodapé quando adequado.** **Vigente.**
948. **Teclado mobile?** — **A — Layout deve se ajustar sem esconder campo/CTA.** **Vigente.**
949. **Desktop onboarding deve ficar simples?** — **A — Sim; não juntar etapas só por haver espaço.** **Vigente.**

> [!important]
> Observação visual adicional do usuário: **usar ícones, animações e assets para compor um design mais bonito e trabalhado. Simplicidade não deve produzir telas cruas cheias apenas de textos e botões.** Esta regra é vigente em toda a experiência.

# Rodada 31 — Fluxo definitivo do onboarding

950. **Primeira tela após cadastro?** — **A — Boas-vindas curta + Começar.** **Vigente.**
951. **Primeira informação?** — **A — Segmento.** **Vigente.**
952. **Ordem dos dados do negócio?** — **A — Segmento → nome usado com clientes → modalidade → endereço quando necessário.** **Vigente.**
953. **Segmento + nome podem ficar juntos?** — **B — Sim, por serem simples e relacionados.** **Vigente.**
954. **Modalidade em tela própria?** — **A — Sim.** **Vigente.**
955. **Local próprio pede endereço quando?** — **A — Imediatamente no onboarding.** **Vigente.**
956. **Local + domicílio: área domiciliar no onboarding?** — **B — Não; endereço do negócio agora, área depois.** **Vigente.**
957. **Depois dos dados básicos?** — **A — Perguntar se já usa outro sistema.** **Vigente.**
958. **Opções da pergunta?** — **A — “Sim, quero importar” / “Não, começar do zero”.** **Vigente.**
959. **Quem já usa sistema?** — **B — Importar agora ou fazer depois.** **Vigente.**
960. **Se fizer depois?** — **A — Seguir configuração manual mínima.** **Vigente.**
961. **Começando do zero: primeiro passo?** — **A — Serviço.** **Vigente.**
962. **Primeira tela de serviço?** — **B — Nome + duração + preço/tipo opcional.** **Vigente.**
963. **Recorrência no onboarding?** — **B — Não; depois em Serviços.** **Vigente.**
964. **Depois do primeiro serviço?** — **A — Adicionar outro opcional ou Continuar.** **Vigente.**
965. **Depois dos serviços?** — **A — Dias de atendimento.** **Vigente.**
966. **Depois dos dias?** — **A — Horário-base.** **Vigente.**
967. **Dias diferentes?** — **A — Personalizar por dia.** **Vigente.**
968. **Bloqueios/almoço/antecedência/granularidade no onboarding?** — **B — Não; ficam para depois.** **Vigente.**
969. **Importação trouxe serviço + horário?** — **A — Não repetir etapas.** **Vigente.**
970. **Importou serviços, mas sem horários?** — **A — Ir para configurar horários.** **Vigente.**
971. **Todos serviços importados inválidos?** — **A — Corrigir pelo menos um antes de continuar.** **Vigente.**
972. **Agenda mínima pronta: o que vem?** — **A — Demonstração automática da IA.** **Vigente.**
973. **Formato da demonstração?** — **A — Conversa curta completa em uma tela.** **Vigente.**
974. **Como a demonstração avança?** — **A — Automaticamente com pequenos intervalos.** **Vigente.**
975. **Mostrar ações internas?** — **A — Sim, discretamente.** **Vigente.**
976. **Ações internas no mobile?** — **A — Eventos pequenos inseridos na demonstração.** **Vigente.**
977. **Depois da demonstração?** — **A — Escolher entre três estilos.** **Vigente.**
978. **Trocar estilo mostra o quê?** — **A — Amostra imediata da mesma resposta.** **Vigente.**
979. **Depois do estilo?** — **A — Continuar sem outras configurações avançadas.** **Vigente.**
980. **Próxima etapa?** — **A — Explicação da conexão + possibilidade de pular.** **Vigente.**
981. **CTAs?** — **A — Conectar meu WhatsApp + Fazer isso depois.** **Vigente.**
982. **Se fizer depois?** — **A — Onboarding termina e Home mostra checklist.** **Vigente.**
983. **Se conectar, ordem?** — **A — Explicação → QR/código → conectado → contatos ignorados opcional → teste real.** **Vigente.**
984. **Antes do teste?** — **A — Tela dedicada + Iniciar teste.** **Vigente.**
985. **Durante teste?** — **A — Progresso em tempo real + instrução para observar WhatsApp.** **Vigente.**
986. **Mobile pode abrir WhatsApp?** — **A — Sim quando apropriado.** **Vigente como UX.**
987. **Ao voltar para Atendly?** — **A — Detectar conclusão automaticamente.** **Vigente.**
988. **Tela final ativa?** — **A — Tudo pronto + Ir para o início.** **Vigente.**
989. **Tela final se pulou WhatsApp?** — **A — Comemorar configuração, deixando IA inativa clara.** **Vigente.**
990. **CTAs se pulou?** — **C — Ir para o início principal + Conectar agora secundário.** **Vigente.**
991. **Checklist pós-onboarding?** — **A — Serviço, horários, WhatsApp, teste.** **Vigente.**
992. **Mostrar itens concluídos?** — **A — Sim até ativação.** **Vigente.**
993. **Depois da ativação?** — **A — Checklist desaparece.** **Vigente.**
994. **Progresso em quatro blocos?** — **A — Seu negócio / Sua agenda / Sua IA / WhatsApp.** **Vigente.**
995. **Importação pertence a qual bloco?** — **A — Sua agenda.** **Vigente.**
996. **Demonstração + estilo pertencem a?** — **A — Sua IA.** **Vigente.**
997. **Teste real pertence a?** — **A — WhatsApp.** **Vigente.**
998. **Mostrar menus da área logada durante onboarding?** — **A — Não.** **Vigente.**
999. **Importação posterior usa qual contexto visual?** — **A — Fluxo dentro da área logada, mantendo navegação normal.** **Vigente.**
1000. **Encerrar entrevista e consolidar antes de prototipar?** — **A — Sim.** **Vigente.**

---

# Síntese final da entrevista

A entrevista levou às seguintes mudanças centrais em relação à direção inicial:

1. **Atendly deixou de ser “IA conectável a Agenda Atendly ou Minha Agenda”.** A Agenda Atendly passou a ser obrigatoriamente a agenda oficial.
2. **Minha Agenda virou migração única**, sem sincronização e sem reimportação.
3. **Um negócio utiliza um número de WhatsApp**, que pode ser pessoal.
4. A diferenciação importante passou a ser **IA que identifica atendimento em um WhatsApp real e sai de cena quando o profissional assume**.
5. **Mobile-first tornou-se requisito central**: celular primeiro, depois tablet, notebook e desktop.
6. O onboarding foi organizado em **Seu negócio → Sua agenda → Sua IA → WhatsApp**.
7. Existem dois momentos diferentes de valor: **demonstração automática** e **teste real de ativação**.
8. A IA usa histórico/memória para reduzir perguntas, mas confirma informações que podem alterar um agendamento.
9. Recorrência foi redefinida como **frequência do serviço usada para criar próximos atendimentos**, e não como série infinita complexa.
10. Tudo definido como MVP será concluído antes da validação real; não existe MVP 0.1/0.2.
11. Monetização fica deliberadamente para depois da validação prática.
12. Simplicidade visual não significa interface crua: **ícones, assets, ilustrações, microanimações e feedback visual** fazem parte da direção de design.

---

# Apêndice — Perguntas substituídas antes de resposta individual

As perguntas abaixo também fizeram parte da entrevista. Elas são listadas individualmente para preservar rastreabilidade, embora suas premissas tenham sido substituídas antes de uma resposta final item a item.

## Rodada 11 original — Ativação antes da definição do teste real

- **R11-original-284.** Depois de conectar o WhatsApp, existe algum teste real antes de ativar? — **Não respondida nessa forma; substituída** pelo teste real enviado por número oficial da Atendly.
- **R11-original-285.** O “teste bem-sucedido” significa demonstração, validação técnica ou ambos? — **Substituída.** A ativação atual usa demonstração + teste real ponta a ponta.
- **R11-original-286.** O teste técnico pode enviar mensagem visível no WhatsApp? — **Substituída.** O teste atual envia uma conversa real explicitamente identificada como teste.
- **R11-original-287.** Se conectar mas não validar totalmente envio/recebimento, pode ativar? — **Substituída pela regra vigente:** falha no teste real impede ativação.
- **R11-original-288.** Depois da conexão, IA fica desligada até botão final ou liga automaticamente? — **Substituída:** após teste real bem-sucedido, ativa automaticamente.
- **R11-original-289.** Mostrar resumo do que IA fará antes de ativar? — **Absorvida** pela explicação da conexão e do teste.
- **R11-original-290.** Precisa de botão global de pausar IA? — **Sim, conceito vigente.**
- **R11-original-291.** Pausa global interrompe respostas mas continua recebendo/classificando? — **Recomendação mantida conceitualmente:** pausa automação, mantendo operação da inbox.
- **R11-original-292.** Durante pausa global, continuar detectando intenção comercial? — **Recomendação mantida.**
- **R11-original-293.** Conversas recebidas durante pausa global exibem badge? — **Recomendação mantida como UX possível.**
- **R11-original-294.** Pausa global programada entra no MVP? — **Não; apenas ligar/desligar.**
- **R11-original-295.** Na primeira ativação, IA atua em conversas antigas? — **Não; atuação começa em novas interações.**
- **R11-original-296.** Importar histórico antigo do WhatsApp para contexto? — **Não consolidado como feature obrigatória do produto.**
- **R11-original-297.** Histórico anterior pode ajudar classificação pessoal/comercial? — **Premissa refinada:** classificações e histórico ajudam contexto, respeitando privacidade e Ignorar IA.
- **R11-original-298.** Incentivar lista Ignorar IA antes de ligar? — **Sim; virou etapa opcional antes do teste.**
- **R11-original-299.** Sugerir contatos provavelmente pessoais? — **Não consolidado como obrigação; seleção manual é suficiente no MVP.**
- **R11-original-300.** IA pode inferir parentesco para sugerir contatos ignorados? — **Não consolidado como requisito de UX.**
- **R11-original-301.** Qual status global mostrar? — **Refinado para IA ativa / pausada / instabilidade / configuração incompleta / WhatsApp desconectado.**
- **R11-original-302.** WhatsApp desconecta: IA permanece logicamente habilitada? — **Sim; reconexão automática preserva estado quando possível.**
- **R11-original-303.** Depois de reconectar automaticamente, retomar IA? — **Sim se estava ativa.**
- **R11-original-304.** Mensagens recebidas enquanto desconectado devem ser respondidas retroativamente? — **Não ficou como fluxo principal; prioridade é integridade e contexto atual.**
- **R11-original-305.** Qual atraso ainda permite resposta automática? — **Não consolidado como regra fixa de produto.**
- **R11-original-306.** Quantas mensagens na demonstração automática? — **Fluxo curto e completo; sem número rígido de mensagens na especificação final.**
- **R11-original-307.** Qual cenário demonstrar? — **Usar cenário relevante com dados reais do negócio.**
- **R11-original-308.** Mostrar ações internas durante demonstração? — **Sim.**
- **R11-original-309.** Como terminar demonstração? — **Mostrar valor e seguir para escolha de estilo.**
- **R11-original-310.** Usuário pode repetir demonstração depois? — **Não foi definida como feature recorrente do MVP.**

## Rodada 13 original — Reimportação

- **R13-original-351.** Importação é cópia, migração assistida ou sincronização manual? — **B — Migração assistida. Vigente.**
- **R13-original-352.** Sequência conectar → analisar → preview → confirmar → importar? — **B. Vigente para a importação única.**
- **R13-original-353.** Fase de análise altera dados? — **A — Não. Vigente.**
- **R13-original-354.** Quais categorias mostrar? — **Serviços, clientes, horários, agendamentos e histórico. Vigente.**
- **R13-original-355.** “Histórico” significa tudo disponível ou janela limitada? — **Tudo tecnicamente disponível. Vigente.**
- **R13-original-356.** Se houver muitos anos de histórico, importar todos? — **Sim, se tecnicamente disponível. Vigente.**
- **R13-original-357.** Importar cancelados históricos? — **Sim. Vigente.**
- **R13-original-358.** Importar não compareceu quando disponível? — **Sim. Vigente.**
- **R13-original-359.** Cliente sem telefone? — **Importar. Vigente.**
- **R13-original-360.** Cliente sem nome? — **Importar como cadastro incompleto quando houver identificação suficiente. Vigente.**
- **R13-original-361.** Serviço sem duração? — **Importar como pendência e impedir IA de agendar. Vigente.**
- **R13-original-362.** Serviço sem preço? — **Importar como sem preço informado. Vigente.**
- **R13-original-363.** Histórico ligado a serviço inexistente? — **Preservar histórico com referência apropriada/inativa. Vigente.**
- **R13-original-364.** Agendamento ligado a cliente não encontrado? — **Criar cliente mínimo. Vigente.**
- **R13-original-365.** Como detectar cliente duplicado? — **Telefone normalizado + outros sinais; produto mostra conflito quando ambíguo. Vigente.**
- **R13-original-366.** Mesmo telefone em formatos diferentes? — **Reconhecer como compatível quando nome também faz sentido. Vigente.**
- **R13-original-367.** Mesmo telefone, nomes diferentes? — **Não mesclar silenciosamente. Vigente.**
- **R13-original-368.** Mesmo nome, telefones diferentes? — **Sugerir possível duplicidade, sem merge automático. Vigente.**
- **R13-original-369.** Merge de clientes durante revisão? — **Direção válida para resolver conflitos da única importação.**
- **R13-original-370.** Qual registro vence no merge? — **Permitir resolver divergências relevantes, não definir origem como vencedora absoluta. Vigente.**
- **R13-original-371.** Serviços com mesmo nome são iguais? — **Comparar também dados relevantes. Vigente.**
- **R13-original-372.** Mesmo serviço, preço diferente? — **Conflito. Vigente.**
- **R13-original-373.** Nomes semelhantes de serviço? — **Sugerir correspondência, usuário confirma. Vigente.**
- **R13-original-374.** Como detectar agendamento duplicado? — **Usar sinais determinísticos disponíveis. Vigente como comportamento.**
- **R13-original-375.** Mesmo registro externo mudou na origem em reimportação? — **Descartada**, pois reimportação foi removida.
- **R13-original-376.** Atualizar automaticamente se Atendly nunca alterou registro? — **Descartada.**
- **R13-original-377.** Classificar diferenças de reimportação por origem/Atendly? — **Descartada.**
- **R13-original-378.** Mudou apenas na origem? — **Descartada.**
- **R13-original-379.** Mudou apenas na Atendly? — **Descartada.**
- **R13-original-380.** Mudou nos dois lados? — **Descartada.**
- **R13-original-381.** Registro desapareceu da origem em reimportação? — **Descartada.**
- **R13-original-382.** Cancelado/excluído na origem durante reimportação? — **Descartada.**
- **R13-original-383.** Preview deve resumir novos/existentes/conflitos? — **Sim, por categoria. Vigente.**
- **R13-original-384.** Todos os conflitos precisam ser resolvidos antes de importar? — **Não; válidos podem prosseguir. Vigente.**
- **R13-original-385.** Conflito não resolvido é importado? — **Não; pode ficar fora antes da conclusão. Vigente.**
- **R13-original-386.** Importação é tudo ou nada? — **Não; permite parcial. Vigente.**
- **R13-original-387.** 499/500 importados é falha? — **Não; concluída com pendências. Vigente.**
- **R13-original-388.** Estados visíveis da importação? — **Analisando / aguardando confirmação / importando / concluída / com pendências / falhou. Direção vigente.**
- **R13-original-389.** CTA após parcial? — **Revisar pendências. Vigente.**
- **R13-original-390.** Reprocessar pendências? — **Sim, durante a mesma sessão de importação. Vigente.**
- **R13-original-391.** Quando encerrar uso das credenciais? — **Ao concluir/abandonar a sessão. Vigente em produto.**
- **R13-original-392.** Revisar pendências no dia seguinte exige nova autenticação para buscar novos dados? — **Conceito perde relevância após simplificação; nenhuma reimportação futura.**
- **R13-original-393.** Snapshot técnico para comparar reimportações? — **Descartado como necessidade de produto.**
- **R13-original-394.** Usuário vê detalhes técnicos? — **Não normalmente. Vigente como UX.**
- **R13-original-395.** Mensagem “gerencie agora pela Atendly”? — **Sim. Vigente.**
- **R13-original-396.** Alertar que Minha Agenda não sincroniza? — **Sim. Vigente.**

## Rodada 17 — Perguntas do “MVP menor” rejeitado

- **R17-468.** Qual fluxo mínimo precisaria funcionar para começar a validar? — **Premissa rejeitada:** validação só após MVP completo.
- **R17-469.** Home entra na primeira versão? — **Premissa rejeitada; Home faz parte do MVP completo.**
- **R17-470.** Importação entra desde a primeira versão? — **Premissa rejeitada; importação faz parte do MVP completo.**
- **R17-471.** Quais visualizações de Agenda entram primeiro? — **Premissa rejeitada; UX final definida posteriormente.**
- **R17-472.** Compromissos pessoais entram primeiro? — **Sim no MVP completo.**
- **R17-473.** Bloqueios recorrentes entram primeiro? — **Sim no MVP completo.**
- **R17-474.** Disponibilidade extra excepcional entra primeiro? — **Sim no MVP completo.**
- **R17-475.** Multi-serviço entra primeiro? — **Sim no MVP completo.**
- **R17-476.** Buffers entram primeiro? — **Fazem parte da especificação completa, sem corte de “versão inicial”.**
- **R17-477.** Tipos de preço entram primeiro? — **Sim no MVP completo.**
- **R17-478.** Instruções privadas por serviço entram primeiro? — **Sim no MVP completo, conforme regras de conhecimento.**
- **R17-479.** Perfil completo do cliente entra primeiro? — **MVP completo inclui perfil definido.**
- **R17-480.** Tags entram primeiro? — **Sim no MVP completo.**
- **R17-481.** Preferências inferidas entram primeiro? — **MVP completo inclui memória/preferências conforme definido.**
- **R17-482.** Relações mãe-filho entram primeiro? — **Sim no MVP completo.**
- **R17-483.** Resumo por IA entra primeiro? — **Sim no MVP completo.**
- **R17-484.** Três abas de Conversas entram primeiro? — **Sim.**
- **R17-485.** Classificação automática entra primeiro? — **Sim.**
- **R17-486.** Regra de mensagem ambígua entra primeiro? — **Sim no MVP completo, conforme rodada 9.**
- **R17-487.** Ignorar IA entra primeiro? — **Sim.**
- **R17-488.** Detectar mensagem manual e pausar IA entra primeiro? — **Sim.**
- **R17-489.** Chat Atendly permite responder? — **Sim.**
- **R17-490.** Sugestões da IA no humano entram primeiro? — **Sim no MVP completo.**
- **R17-491.** Áudio entra primeiro? — **Sim.**
- **R17-492.** Imagem gera handoff? — **Sim.**
- **R17-493.** Documentos aparecem no chat? — **Sim.**
- **R17-494.** Lembretes entram primeiro? — **Sim no MVP completo.**
- **R17-495.** Cancelamento/remarcação entram primeiro? — **Sim.**
- **R17-496.** Holds entram primeiro? — **Sim.**
- **R17-497.** Antecedência mínima/máxima configurável entra primeiro? — **Sim no MVP completo.**
- **R17-498.** Granularidade configurável entra primeiro? — **Sim no MVP completo.**
- **R17-499.** Políticas de cancelamento entram primeiro? — **Sim, com default livre.**
- **R17-500.** Qual seria o primeiro marco utilizável? — **Premissa rejeitada; há um único MVP completo antes da validação.**

## Rodada 21A original — Recorrência genérica

- **R21A-original-601.** Frequências semanal/quinzenal/mensal ou flexíveis? — **Substituída:** frequência é configurada por serviço.
- **R21A-original-602.** Quantas ocorrências por padrão sem quantidade? — **Substituída:** IA pergunta quantas.
- **R21A-original-603.** Pedido “próximos 6 meses” cria todas? — **Substituída pelo modelo de quantidade + frequência do serviço.**
- **R21A-original-604.** Manter exatamente mesmo dia/horário? — **Substituída:** busca horários próximos conforme disponibilidade.
- **R21A-original-605.** Se uma ocorrência não tiver disponibilidade? — **Substituída:** preservar as viáveis e apresentar alternativa para a problemática.
- **R21A-original-606.** Se dia ideal estiver ocupado, perguntar horário próximo? — **Absorvida pela regra vigente de busca próxima.**
- **R21A-original-607.** Recorrência precisa de entidade própria? — **Substituída:** depois de criados, agendamentos são independentes; apenas relação suficiente para inteligência de cadência.
- **R21A-original-608.** Editar esta/esta e próximas/série inteira? — **Substituída:** não há série tradicional na UI.
- **R21A-original-609.** IA pode remarcar recorrência inteira? — **Refinada:** pode recalcular próximos agendamentos quando cliente pedir.
- **R21A-original-610.** Cliente viaja em uma ocorrência? — **Refinada:** pode alterar/cancelar ocorrência individual normalmente.
- **R21A-original-611.** Cliente quer parar recorrência? — **Substituída:** agendamentos já criados são independentes; cancelar futuros conforme solicitação.
- **R21A-original-612.** Alterar serviço da série? — **Substituída pelo modelo sem série permanente.**
- **R21A-original-613.** Mudança de preço do serviço altera série? — **Não; agendamentos preservam snapshot. Vigente.**
- **R21A-original-614.** Mudança de duração altera série? — **Não; agendamentos existentes preservam duração. Vigente.**
- **R21A-original-615.** Materializar ocorrências agora ou no futuro? — **Substituída:** IA cria o conjunto solicitado após confirmação.
- **R21A-original-616.** Recorrência respeita janela máxima? — **Sim conceitualmente, ao buscar datas permitidas.**
- **R21A-original-617.** Série se prolonga automaticamente? — **Não como série infinita.**
- **R21A-original-618.** Permitir recorrência sem fim? — **Não como automação infinita; cliente solicita quantidade/conjunto.**
- **R21A-original-619.** Máximo de ocorrências? — **Não consolidado como limite fixo; regras da agenda e pedido do cliente governam.**
- **R21A-original-620.** Recorrência manual segue mesmas regras? — **Não há série tradicional; profissional continua podendo criar/editar agendamentos manualmente com liberdade.**

## Rodada 30 original — UX antes do mobile-first explícito

- **R30-original-901.** Sensação da interface: corporativa, simples/elegante ou minimalista? — **Substituída pela diretriz mobile-first; resposta efetiva: simples, elegante e profissional.**
- **R30-original-902.** Densidade desktop alta/média/baixa? — **Resposta efetiva: telas maiores podem ter mais informação, sem excesso.**
- **R30-original-903.** Densidade mobile? — **Resposta efetiva: uma tarefa por vez e detalhes sob demanda.**
- **R30-original-904.** Navegação desktop sidebar fixa/horizontal/recolhível? — **Refinada posteriormente para sidebar em telas grandes.**
- **R30-original-905.** Sidebar ícone+texto ou só ícones? — **Direção: clareza para leigos; texto quando necessário.**
- **R30-original-906.** Topbar global? — **Sim em telas grandes, com estado e notificações.**
- **R30-original-907.** Status IA na topbar? — **Sim de forma compacta.**
- **R30-original-908.** Quantos itens na bottom nav? — **5, definido na rodada revisada.**
- **R30-original-909.** Ação principal mobile via FAB/botão/contexto? — **Contextual por módulo.**
- **R30-original-910.** Configurações mobile onde? — **Dentro de Mais.**
- **R30-original-911.** Clientes desktop tabela/lista/cards? — **Lista/tabela moderna e compacta.**
- **R30-original-912.** Serviços tabela/cards/lista? — **Lista compacta.**
- **R30-original-913.** Configurações página longa/seções/cards? — **Seções separadas.**
- **R30-original-914.** Labels acima/placeholder/floating? — **Labels claros acima.**
- **R30-original-915.** Quantos campos por linha no desktop? — **1–2 relacionados.**
- **R30-original-916.** Mobile em uma ou duas colunas? — **Uma coluna como padrão.**
- **R30-original-917.** Novo agendamento desktop modal/drawer/página? — **Drawer/tela contextual quando adequado.**
- **R30-original-918.** Novo agendamento mobile modal/bottom sheet/full-screen? — **Full-screen.**
- **R30-original-919.** Detalhe cliente desktop página/drawer/híbrido? — **Consulta rápida + perfil completo conforme contexto.**
- **R30-original-920.** Conversas desktop master-detail? — **Sim, lista/chat/cliente quando houver espaço.**
- **R30-original-921.** Painel cliente em notebook menor? — **Sob demanda.**
- **R30-original-922.** Agenda semanal grade/lista/kanban? — **Grade em desktop.**
- **R30-original-923.** Cores dos eventos por serviço/tipo/status? — **Priorizar tipos de evento, evitando arco-íris.**
- **R30-original-924.** Cancelado permanece na grade? — **Não na visão normal.**
- **R30-original-925.** Hold aparece na agenda? — **Sim, discreto.**
- **R30-original-926.** Mensagens IA/humano visualmente diferentes? — **Autoria discreta, sem personagem/robô.**
- **R30-original-927.** Eventos internos no chat? — **Linha/evento discreto.**
- **R30-original-928.** Pessoal com tema diferente? — **Não; mesmo sistema visual com estado claro.**
- **R30-original-929.** Layout do onboarding? — **Focado e centralizado; mobile sem card apertando conteúdo.**
- **R30-original-930.** Largura onboarding desktop? — **Conteúdo relativamente estreito e focado.**
- **R30-original-931.** Mobile onboarding em card ou página? — **Página direta.**
- **R30-original-932.** CTA principal mobile fixo? — **Quando adequado.**
- **R30-original-933.** Scroll no onboarding? — **Aceitar quando necessário, sem sacrificar legibilidade.**
- **R30-original-934.** Skeletons ou spinners? — **Skeleton para conteúdo; spinner em ação curta.**
- **R30-original-935.** Erro recuperável substitui tela inteira? — **Não; erro contextual com retry.**
- **R30-original-936.** Confirmações destrutivas? — **Modal claro quando realmente destrutivo.**
- **R30-original-937.** Direção estética? — **Neutra/profissional com identidade de marca.**
- **R30-original-938.** Gradientes? — **Pontuais, não dominantes.**
- **R30-original-939.** Arredondamento? — **Moderado.**
- **R30-original-940.** Sombras? — **Sutis; preferir espaço/bordas/superfícies.**
- **R30-original-941.** Acessibilidade pode limitar estética? — **Sim; priorizar usabilidade.**
- **R30-original-942.** Estados podem depender só de cor? — **Não.**
- **R30-original-943.** Navegação por teclado? — **Sim nos componentes principais.**
- **R30-original-944.** Dark mode? — **Futuro; MVP claro.**
- **R30-original-945.** Tom da interface? — **Claro, direto, próximo e profissional.**
- **R30-original-946.** Emojis na interface? — **Pontuais.**
- **R30-original-947.** Termos técnicos na UI? — **Não.**
- **R30-original-948.** Mensagem de erro deve explicar ação? — **Sim.**
