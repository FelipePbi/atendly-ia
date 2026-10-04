# Revisão local — cadastro → onboarding → login → área logada

Referência visual: `docs/design-reference/claude-design/prototype/project/*.dc.html` (servido em `http://localhost:4173`).
Viewports: mobile-360, mobile-390, tablet-768, notebook-1024, desktop-1440.
Cópia versionada e sanitizada de `qa/RELATORIO.md` (local, fora do git): sem nomes, telefones e capturas de clientes reais. As capturas citadas existem só na máquina da revisão. Nada foi corrigido durante a revisão.

Severidade: **ALTA** (contradiz protótipo/regra de forma visível ou quebra fluxo) · **MÉDIA** (divergência clara, não bloqueia) · **BAIXA** (acabamento).

---

# Consolidação final (2026-09-27)

## Resumo

Percurso completo feito localmente, com serviços reais: cadastro → onboarding (WhatsApp real pareado pelo código) → logout/login/recuperação de senha → área logada → conversa real respondida pela IA (OpenAI) → agendamento manual → importação real da Minha Agenda (2.327 registros). Nada do produto foi corrigido; só o ambiente foi ajustado, sempre registrado como "Nota de ambiente".

**~145 achados: 29 ALTA, 54 MÉDIA, 62 BAIXA** (contagem pelas tabelas abaixo).

O produto **funciona de ponta a ponta no caminho principal**: cadastrar, configurar, parear o WhatsApp, receber mensagem, a IA responder com serviço e preço reais, agendar à mão, importar a base da Minha Agenda e ver tudo na agenda. O que impede colocar no ar são quatro grupos de problema:

1. **A IA pode mentir para a cliente final** (A-01): diz "ficou confirmado" sem gravar nada, e a Home ainda conta isso como agendamento feito (H-09). É o achado mais grave da revisão, porque o dano é com o cliente do cliente e ninguém percebe.
2. **Telas centrais quebradas**: Conversas, Clientes e Serviços não têm layout e não aceitam clique (CV-01/CV-02); serviço de 40/45/60 min não salva (SV-01); status do WhatsApp sempre "desconectado" (X-01). O gate de UI não pega nada disso porque só cobre rotas públicas.
3. **Importação da Minha Agenda não fecha sozinha para uma conta real**: formulário técnico demais (IM-01), timeouts de 10s e 30s em operações de 27–31s (IM-03/IM-07), clientes incompletos (IM-06) e disponibilidade somada em vez de substituída (IM-09). Com contornos de ambiente, a importação funcionou.
4. **Regras do vault não cumpridas**: cadastro sem Nome (C-01), sem Boas-vindas (O-01), 2 de 4 tipos de preço (O-26), sem consentimento antes de conectar o WhatsApp (O-40), IA ativável sem teste (S-02) e teste real inalcançável (O-49).

## Achados ALTA, por tema

| Tema | IDs | O que acontece |
|---|---|---|
| **IA e confiança nos dados** | A-01, H-09 | IA afirma confirmação sem `confirm`; métrica conta `prepare` (hold) como agendamento |
| **Telas quebradas na área logada** | CV-01, CV-02, SV-01, X-01, H-02 | Casca sem CSS em Conversas/Clientes/Serviços, sidebar intercepta cliques; duração `min=1 step=5`; bff manda o token cifrado para a Evolution |
| **Importação Minha Agenda** | IM-01, IM-03, IM-06, IM-07, IM-09 | 6 campos técnicos; análise e execução estouram timeout e a tela mente sobre o resultado; clientes sem agendamento se perdem; disponibilidade sobreposta e tela de Disponibilidade escondendo regras |
| **Onboarding e ativação** | O-01, O-04, O-20, O-26, O-40, O-45, O-49, H-03, S-02 | Sem Boas-vindas; segmentos escondidos; importação fora do onboarding; 2 tipos de preço; sem consentimento; QR nunca renovado; "Pular" encerra o onboarding e o teste real some; checklist sem ação; IA ligada por checkbox |
| **Configurações** | S-04, S-06 | Texto da IA não é reexibido (e é apagado ao salvar de novo); sem tela para antecedência, limite, intervalo e cancelamento |
| **Conta** | C-01, L-01 | Cadastro sem Nome; recuperação de senha diz "Senha redefinida" sem mudar nada |
| **Marca e acabamento visível** | G-01, G-05, C-07, O-02 | Símbolo não é o "A que confirma"; favicon antigo; mobile sem painel de marca; botão "Sair" sem estilo |

## Ordem sugerida para virar Goals

1. **A-01 + H-09**: barreira determinística "sem `confirm` bem-sucedido no turno, não existe confirmação", e métrica contando só `Appointment` criado pela IA. Junto, as decisões do usuário sobre a conversa (A-02..A-04).
2. **CV-01/CV-02 + SV-01 + X-01**: restaurar a casca de `conversations-shell`/`directory-shell`, corrigir `step` da duração, decifrar a credencial no `whatsappSummary`. Estender o `validate:ui` para pelo menos uma sessão autenticada, para isso não voltar.
3. **Importação**: só e-mail e senha (decisão do usuário); análise e execução assíncronas com acompanhamento, sem requisição de 30s; ler a lista completa de clientes; substituir a disponibilidade em vez de somar (IM-01, IM-03, IM-04, IM-06, IM-07, IM-09, IM-10).
4. **Ativação da IA com teste** (O-49, H-03, S-02, O-40) e **L-01**.
5. Onboarding conforme vault (C-01, O-01, O-04, O-26, O-45) e Configurações (S-04, S-06, S-07, M-01).
6. Fidelidade visual ao protótipo (marca G-*, Home H-*, Agenda AG-*, Clientes CL-*, Serviços SV-*, Notificações NT-*) e copy técnica (H-08, AG-10, CL-03, SV-05, S-03, S-10).

## Decisões de produto tomadas pelo usuário nesta revisão (registrar no vault)

| Tema | Decisão | Onde está |
|---|---|---|
| Conversa da IA | Não fazer perguntas desnecessárias nem pedir 2–3 confirmações; nunca usar travessão; ao fechar um agendamento, mandar mensagem de encerramento ("te vejo quarta-feira, obrigada, tenha um ótimo dia") | 4b |
| Importação | Usuário informa só e-mail e senha; endereço fixo (`api.minhaagendaapp.com.br`); o sistema faz login, guarda o token e descobre o resto | 4k |
| Importação | A Minha Agenda tem lista completa de clientes; a importação deve trazer a base inteira | 4k, IM-06 |

## Divergências doc × código que pedem decisão antes do Goal

**Resolvidas pelo usuário em 2026-09-27:** O-20 → U-09 (importação nos dois lugares); C-02/C-03 → U-10 (senha única, 8+ com letras e números); O-49 × D-035 → U-11 (teste real no onboarding e em Configurações, IA só liga depois do teste). Ver [DECISIONS](DECISIONS.md) e os Goals 057–069 do [MASTER_PLAN](MASTER_PLAN.md). Registro original:

- **O-20**: o vault põe a importação dentro do onboarding; D-036 a levou para Configurações sem substituir o vault explicitamente.
- **C-02 / C-03**: "Repita a senha" e a regra de senha (só 8+ no backend, protótipo pede letras e números).
- **O-49 × D-035**: D-035 diz que o teste real só existe no onboarding, mas pular uma etapa opcional encerra o onboarding e torna o teste inalcançável.

## Cobertura por tela e viewport

| Tela | 360 | 390 | 768 | 1024 | 1440 | Protótipo comparado |
|---|---|---|---|---|---|---|
| Cadastro (+ erros) | ✓ | ✓ | ✓ | ✓ | ✓ | Login L3 (3 tamanhos) |
| Onboarding negócio / fonte | ✓ | ✓ | ✓ | ✓ | ✓ | Onboarding 1 |
| Onboarding serviço, dias, IA | — | ✓ | — | — | parcial | Onboarding 1 e 3 |
| Onboarding WhatsApp | — | — | — | — | ✓ | Onboarding 3 |
| Login / recuperação | ✓ | ✓ | ✓ | ✓ | ✓ | Login L1–L7 |
| Início | — | ✓ | — | — | ✓ | Home H1–H7 |
| Conversas (lista e chat) | — | ✓ | — | — | ✓ | Conversas-e-Chat |
| Agenda (Dia/Semana/Mês/novo/detalhe) | — | ✓ | ✓ | ✓ | ✓ | Agenda-Desktop A1–A5 |
| Clientes | — | — | — | — | ✓ | Clientes-Desktop CL1–CL7 |
| Serviços | — | — | — | — | ✓ | Servicos-Desktop S1–S4 |
| Notificações | — | ✓ | — | — | ✓ | Notificacoes-Desktop |
| Configurações e subpáginas | — | parcial | — | — | ✓ | Mais-* |
| Mais (mobile) | — | ✓ | — | — | — | — |
| Importação | — | — | — | — | ✓ | — |

Em Conversas, Clientes e Serviços, olhar mais tamanhos não acrescentaria nada enquanto CV-01 existir: a casca quebra igual em todos.

## O que não foi testado

- Se a IA reconhece uma cliente importada quando ela escreve (IM-10): falta mandar mensagem de um número que está na base importada.
- Entrega real de lembretes e confirmação de presença: o envio ficou desligado de propósito (ver abaixo).
- Remarcar, cancelar e séries recorrentes pela IA; assumir conversa e devolver para a IA; conversa Pessoal / "Ignorar na IA".
- Teste real da IA e tela "Tudo pronto": inalcançáveis (O-49).
- Animações da marca (G-07) e `prefers-reduced-motion`.

## Estado do ambiente ao fim (reverter ou manter conscientemente)

| Item | Estado | Ação |
|---|---|---|
| `apps/ai-orchestrator/.env` `NOTIFICATION_DELIVERY_ENABLED` | `false` | **Manter** enquanto houver dados reais da Minha Agenda na base local: religar mandaria 27 lembretes pelo WhatsApp, 26 para clientes reais |
| `apps/bff/.env` `INTERNAL_HTTP_TIMEOUT_MS` | `90000` (default `10000`) | Voltar a `10000` depois, ou manter para reproduzir a importação |
| `apps/bff/.env`, `apps/ai-orchestrator/.env` | ~77 chaves acrescentadas do `.env.example` | Backups em `apps/*/.env.bak-qa` |
| `apps/scheduling-service/.env`, `apps/health-worker/.env`, `apps/frontend/.env` | criados para a revisão | Locais, fora do git |
| `docker-compose.dev.yml` | Postgres do bff em `5555` (porta 5432 ocupada) | Alteração não commitada |
| Coluna `webhook` da instância na Evolution | `host.docker.internal:3000` | Só no banco local |
| Dados de teste | Conta `qa/CONTA-TESTE.md`; serviço "Escova" 41 min; agendamento Cliente Teste 28/09 10:00 | Banco local |
| **Dados reais de clientes** | 263 clientes e 1.797 atendimentos da Minha Agenda no banco local; nomes reais nos screenshots `qa/04l-*`, `qa/04k-*` | **Não commitar `qa/`** com esses screenshots; apagar o banco local quando não precisar mais |

---

## Global — Marca / logo (aparece em todas as telas)

Autoridade: `Marca.dc.html` ("Marca v4 · o A que confirma"). O product vault não decide nada sobre marca.

| # | Achado | Protótipo | App hoje | Sev. |
|---|---|---|---|---|
| G-01 | Símbolo diferente | "A que confirma": A em 3 traços de linha, perna direita interrompida por um check que escapa pela direita. Grade 64, traço 6, pontas arredondadas | `.brand-mark` desenhado em CSS (`apps/frontend/src/shared/styles/avenly.css:164`): quadrado 28px raio 9px com 2 pontos + barra diagonal — não é um A | ALTA |
| G-02 | Símbolo dentro de caixa preenchida em todo lugar | No produto o símbolo aparece solto (sidebar, onboarding, painel de login); caixa preenchida só no ícone do app/favicon | Sempre dentro de quadrado preenchido | MÉDIA |
| G-03 | Duas cores no símbolo | "Nunca duas cores no símbolo" | Caixa papel + pontos petróleo (auth) / navy + accent-vivid (resto) | MÉDIA |
| G-04 | Wordmark em fonte errada | Literata semibold, tracking −2% | Hanken Grotesk 700 (tracking −2% ok) | MÉDIA |
| G-05 | Favicon é o logo antigo | Ícone petróleo com o A v4 em papel | `public/brand/atendly-favicon-32x32.png` = A dentro de balão, gradiente verde, estrela — exatamente o que as regras de uso proíbem (gradiente, balão, duas cores). É o material de `assets/uploads/`, que o README do design diz não ser fonte vigente | ALTA |
| G-06 | Assets mortos | — | `public/brand/atendly-logo-horizontal.png` e `atendly-logo-icon.png` não são referenciados em `src/` (só o favicon é usado, em `src/app/layout.tsx:11`) | BAIXA |
| G-07 | Assinatura animada ausente | Na entrada sem sessão, o A se desenha (820 ms, uma vez por sessão); com sessão, só o check na sidebar (420 ms). Ver `Movimento` | Não observada (a conferir nas próximas telas) | — |

---

## Fase 1 — `/cadastro` (Criar conta)

Protótipos: `Login.dc.html` (L3 Criar conta), `Login-Tablet.dc.html`, `Login-Desktop.dc.html`.

Tokens conferidos por estilo computado e **batendo** com o protótipo: botão Petróleo `#0F5F63` raio 14px, campo raio 14px, linha forte `#D6CEC2`, superfície `#FFFDFA`, papel `#F7F4EF`, título em Literata.

| # | Achado | Protótipo | App hoje | Sev. |
|---|---|---|---|---|
| C-01 | Falta campo **Nome** — **viola o vault** | Nome · E-mail · Senha. Vault: `03-UX-UI/04-Especificacao-das-Telas.md:22-28` (cadastro = nome, e-mail, senha, aceite, CTA) e `04-Referencia/99-Perguntas-e-Respostas.md:550` (Q468 "Nome + e-mail + senha. Vigente.") | E-mail · Senha · Repita a senha | ALTA |
| C-02 | Campo extra **Repita a nova senha** — **não previsto no vault** | Uma senha só, com olho. Vault não lista confirmação | Duas senhas; o contrato exige `confirmPassword` (`apps/bff/src/modules/auth/routes.ts:38`), então remover é mudança de UI **e** de API | MÉDIA |
| C-03 | Ajuda da senha promete regra diferente | "Mínimo de 8 caracteres, com letras e números" | "Use pelo menos 8 caracteres." — o backend só exige `min(8)` (`routes.ts:37`), sem letras+números. App é coerente com o backend; protótipo pede regra mais forte. Decisão de produto | BAIXA |
| C-04 | Consentimento duplicado | Só o checkbox "Li e concordo com os Termos de Uso e declaro que li a Política de Privacidade" | Checkbox **e** parágrafo passivo "Ao criar sua conta, você concorda com os Termos…" logo abaixo do botão — dois mecanismos de aceite, o passivo contradiz a exigência do checkbox | MÉDIA |
| C-05 | Subtítulo do card diferente | "Configure o negócio e conecte seu WhatsApp em poucos minutos." | "Use seus dados de acesso. Informações do negócio vêm na próxima etapa." | BAIXA |
| C-06 | Botão sem seta | "Criar conta →" | "Criar conta" | BAIXA |
| C-07 | Mobile: sem painel de marca | Faixa Petróleo no topo com símbolo, "Seu atendimento começa com uma boa conversa." e texto de apoio; card sobe como sheet (raio 24px no topo) | Barra fina escura só com o logo; formulário direto no papel, sem tagline | ALTA |
| C-08 | Painel de marca na cor errada | Petróleo `#0F5F63` | Tinta `#221E1A` | MÉDIA |
| C-09 | Tablet: composição diferente | Retrato e paisagem: fundo Petróleo cheio com card centralizado (paisagem: marca à esquerda, card à direita, ambos sobre petróleo) | Mesmo split do desktop: painel escuro à esquerda + formulário em papel à direita | MÉDIA |
| C-10 | Desktop: conteúdo do painel diferente | Painel Petróleo com tagline + **mock de conversa no WhatsApp** (Studio Camila Reis, troca de mensagens); card compacto centralizado verticalmente | Painel Tinta com "Menos tempo respondendo. Mais tempo atendendo." + motivo de linhas; formulário ocupa a coluna inteira | MÉDIA |

### Estados de erro (mobile-390)


| # | Achado | Protótipo | App hoje | Sev. |
|---|---|---|---|---|
| C-11 | Validação usa tooltip nativo do navegador | Erro inline do design system: borda vermelha no campo + texto `#B3392E` abaixo ("Erro no campo, sem modal") | Campo vazio, e-mail sem `@`, senha < 8 e termos desmarcados mostram o balão nativo do Chrome ("Preencha este campo.", "Inclua um '@'…", "Aumente este texto…", "Marque esta caixa…"). Um erro por vez, fora da identidade visual, e o balão cobre o texto de ajuda da senha | MÉDIA |
| C-12 | Validação inconsistente entre casos | — | Só "senhas divergentes" usa o erro inline do design system ("As senhas precisam ser iguais.", borda vermelha) — e só depois de ir ao servidor (`400` em `/v1/auth/register`); os outros quatro casos usam o nativo | BAIXA |

### Caminho feliz

Cadastro válido (conta em `qa/CONTA-TESTE.md`) → redireciona para `/onboarding`. Console limpo.

Console: só `401` em `/api/bff/v1/auth/session` ao abrir sem sessão — esperado.

---

## Fase 2 — Onboarding

Vault (`03-UX-UI/04-Especificacao-das-Telas.md:41-70`) lista 28 etapas: Boas-vindas → Segmento + nome → Modalidade → Endereço condicional → Sistema atual → Importar agora/depois → origem → Minha Agenda (explicação, credenciais, análise, preview, conflitos, progresso, resultado) → Primeiro serviço → Serviços adicionais → Dias → Horários → Demonstração da IA → Estilo da IA → Explicação WhatsApp → QR desktop / código mobile → Contatos ignorados → Teste → Sucesso / Conclusão sem WhatsApp.
Protótipos: `Onboarding-1-Negocio-e-Agenda{,-Tablet,-Desktop}.dc.html`, `Onboarding-2-Importacao…`, `Onboarding-3-IA-e-WhatsApp…`.

### 2a — `/onboarding/dados-do-negocio`


| # | Achado | Protótipo / vault | App hoje | Sev. |
|---|---|---|---|---|
| O-01 | **Não existe tela de Boas-vindas** — viola o vault | Tela 0: marca, composição animada (mensagem → resposta da IA → horário na agenda, sem carrossel), "Configure sua Avenly em poucos passos.", "Começar", "Seu progresso fica salvo a cada etapa." | Cadastro cai direto em "Conte um pouco sobre seu negócio" | ALTA |
| O-02 | Botão **"Sair" sem estilo** em todos os viewports | — | `.onboarding-exit` renderiza com estilo padrão do navegador: fundo `#F0F0F0`, borda `1.6px outset` preta, raio 0 | ALTA |
| O-03 | Nome acessível do "Sair" duplicado | — | Texto "Sair" + `::after { content: "Sair" }` (`avenly.css:3158`) → leitor de tela anuncia "SairSair" | MÉDIA |
| O-04 | **Segmentos escondidos**, inclusive no desktop | Chips quebram linha; os 8 sempre visíveis | `.chip-row` com `overflow-x: auto` e `nowrap`, sem barra nem fade. Mobile: 5 de 8 fora da tela; tablet e desktop 1440: "Personal trainer" e "Outro" fora. No desktop com mouse é praticamente inalcançável | ALTA |
| O-05 | Modalidade na mesma tela | Tela própria "Onde você atende?" ("Pode escolher mais de uma opção."). Vault lista como etapa separada | Nome + segmento + modalidade numa tela só | MÉDIA |
| O-06 | Ordem e texto dos campos | Segmento **primeiro**; depois "Como seus clientes conhecem você?" + ajuda "Pode ser seu nome ou o nome do seu negócio." | "Nome do negócio" primeiro, sem ajuda; depois segmento | MÉDIA |
| O-07 | Cards de modalidade sem ícone nem indicador | Ícone à esquerda (pino, casa, monitor), círculo de seleção à direita; selecionado ganha fundo tonal + ✓ | Só título em Literata + descrição; nenhum indicador visual de múltipla escolha | MÉDIA |
| O-08 | Cópia da modalidade | "A domicílio · Você vai até o cliente" | "Domicílio · Atendimento no endereço do cliente" | BAIXA |
| O-09 | Título | "Vamos começar pelo seu negócio" (eyebrow "SEU NEGÓCIO") | "Conte um pouco sobre seu negócio" (eyebrow "VAMOS COMEÇAR") | BAIXA |
| O-10 | Sem "Voltar" | Chevron ‹ no topo (cinza na primeira etapa) | Não há voltar | MÉDIA |
| O-11 | Progresso | Mobile: barra **segmentada** por etapa. Desktop: **trilho lateral "Configuração inicial"** com os 4 capítulos numerados (Seu negócio / Sua agenda / Sua IA / WhatsApp) | Barra única contínua em todos os viewports; nenhum trilho de capítulos | MÉDIA |
| O-12 | CTA no desktop | "Continuar" na largura da coluna do formulário, ancorado embaixo | Botão curto (~180px) alinhado à esquerda logo após o conteúdo | BAIXA |
| O-13 | Chip selecionado com estilo diferente | Fundo tonal + borda petróleo + ✓ | Preenchido Tinta (preto) com texto branco, sem ✓ | BAIXA |
| O-14 | **Seleção do segmento invisível para leitor de tela** | — | Chips são `<button>` sem `aria-pressed`/`aria-checked`; seleção só pela classe `is-active`. Contraria `apps/frontend/AGENTS.md` ("Estado nunca só por cor — afirme o atributo") | MÉDIA |
| O-15 | Endereço como campo livre na mesma tela | Tela própria (1.3) com CEP (preenche bairro e cidade), "Rua e número", "Complemento"; vault: "Endereço condicional" como etapa | Um único campo "Endereço do seu espaço" que aparece abaixo das modalidades | MÉDIA |
| O-16 | Validação nativa | Erro inline | "Continuar" vazio → balão nativo "Preencha este campo." (mesmo padrão de C-11) | MÉDIA |

Funcional ok: "Outro" abre campo curto (bate com o protótipo); "Local próprio" revela endereço; card de modalidade selecionado ganha fundo tonal + borda petróleo; "Continuar" leva a `/onboarding/fonte-da-agenda`.

Correção a O-03: o "SairSair" só acontece no mobile (o `::after` está dentro de media query); no desktop o nome é "Sair".

### 2b — "Sua agenda": `/onboarding/fonte-da-agenda` → `/agenda-atendly-confirmar` → `/agenda-atendly-metodo`


Protótipo 2.1–2.2: "Você já usa algum sistema para organizar seus clientes e agendamentos?" com dois cards que **são** a ação ("Sim, quero importar" / "Não, começar do zero", sem "Continuar"); depois "Quer importar agora?" com diagrama Minha Agenda → uma vez → Avenly, "Importar agora" (principal) e "Fazer depois" ("Se fizer depois, a importação fica em Mais › Importação").

| # | Achado | Protótipo / vault | App hoje | Sev. |
|---|---|---|---|---|
| O-17 | Duas telas sem decisão antes da pergunta real | Não existem | "Onde seus agendamentos serão controlados?" com **um único card** ("Agenda Avenly") que precisa ser clicado para continuar; depois "A Agenda Avenly cuidará dos seus horários" (confirmação). Dois cliques sem escolha, e o enquadramento "fonte oficial" remete à troca de fonte que o Goal027 aposentou | MÉDIA |
| O-18 | Fuso horário exibido como identificador técnico | Copy não técnica (`apps/frontend/AGENTS.md`) | "Fuso horário: America/Sao_Paulo" na confirmação, sem opção de alterar | BAIXA |
| O-19 | Escolha com padrão pré-marcado | Nenhuma opção pré-selecionada; importar é a ação principal | "Começar do zero" já vem marcado | BAIXA |
| O-20 | **Importação fora do onboarding** — divergência doc × código | Vault (`04-Especificacao-das-Telas.md:47-56`): Importar agora/depois, origem, explicação, credenciais, análise, preview, conflitos, progresso, resultado — dentro do onboarding. Protótipo: `Onboarding-2-Importacao*` | Escolher "Importar do Minha Agenda" só mostra aviso "A importação acontece depois, em Configurações → Agenda" e segue para o primeiro serviço. D-036 colocou a UI de importação em Configurações, mas **nenhuma decisão retira explicitamente** a importação do onboarding nem registra substituição do vault. Precisa de decisão | ALTA |
| O-21 | Caminho do "depois" diferente | "Mais › Importação" | "Configurações → Agenda" | BAIXA |
| O-22 | ✓ de seleção sobrepõe o título | — | Em 390px o ✓ do card "Importar do Minha Agenda" cobre o fim da palavra "Agenda" | BAIXA |
| O-23 | "Voltar" inconsistente | Chevron ‹ no topo em todas as etapas | Botão "Voltar" embaixo a partir da 2ª tela; a 1ª não tem | BAIXA |

### 2c — Primeiro serviço: `/servico-nome` → `/servico-duracao` → `/servico-preco`


| # | Achado | Protótipo / vault | App hoje | Sev. |
|---|---|---|---|---|
| O-24 | Serviço fatiado em 3 telas | Uma tela "Qual é o seu primeiro serviço?" com nome, duração e preço + "Salvar serviço" | Três telas (nome → duração → preço) | BAIXA |
| O-25 | Duração sem stepper nem passo de 5 min | Stepper −/+ em passos de 5 min, atalhos 30/60/90 | `input type=number` (min 5, max 1440, sem `step`); aceita 7 min | BAIXA |
| O-26 | **Só 2 dos 4 tipos de preço** — viola o vault | Vault Q44 (vigente): fixo, a partir de, sob consulta e sem preço. Protótipo: segmentado Fixo / A partir de / Sob consulta / Sem preço, "Preço (opcional)". O backend já suporta os quatro (`FIXED`, `STARTING_AT`, `ON_REQUEST`, `NOT_INFORMED`, `scheduling-service/prisma/migrations/20260908171000_goal007_catalog_constraints/migration.sql:31-36`) | Checkbox "Sob consulta" + valor. Não há "A partir de" nem "Sem preço"; o valor é **obrigatório** — vault Q780 ("Sem preço informado", vigente) fica inalcançável no onboarding | ALTA |
| O-27 | Moeda em `type=number` | "R$ 90,00" com máscara | Campo numérico com setas de spinner, sem "R$", sem vírgula decimal | BAIXA |

| O-28 | **Não existe "Serviços adicionais"** — vault lista a etapa | Protótipo 2.4 "Seus serviços": lista compacta com editar e "+ adicionar outro serviço"; vault: "Serviços adicionais opcional" | Do preço vai direto para os dias | MÉDIA |

### 2d — Disponibilidade: `/dias-de-atendimento` → `/horarios` → `/agenda-atendly-pronta`


| # | Achado | Protótipo / vault | App hoje | Sev. |
|---|---|---|---|---|
| O-29 | Seleção de dias muito longa | 7 pílulas numa linha (Seg→Dom) + resumo "Segunda a sábado · 6 dias por semana" | 7 cards de ~130px com espaço vazio (≈1.300px de rolagem no mobile); sem resumo | MÉDIA |
| O-30 | Semana começa no domingo | Seg → Dom | Dom → Sáb | BAIXA |
| O-31 | **Sem horário diferente por dia** | 2.6 "Personalizar dias diferentes" → 2.7 "Horários por dia" (toque para ajustar um dia; "Copiar sábado para outros dias") | Só um intervalo Início/Fim para todos os dias | MÉDIA |
| O-32 | Horário sem a forma do protótipo | Horas grandes em Literata + barra de 0–24h mostrando o intervalo | Dois `input type=time` nativos | BAIXA |
| O-33 | Erro de horário não marca o campo | Borda vermelha no campo | Só o aviso abaixo ("O horário final deve ser posterior ao horário inicial.") | BAIXA |
| O-34 | Texto de desenvolvimento vazado | — | "O restante da ativação continua em uma próxima etapa do produto." na tela "Sua Agenda Avenly está pronta" | MÉDIA |
| O-35 | Resumo incompleto | — | Mostra serviço, duração e "fonte oficial"; omite preço, dias e horário que acabaram de ser escolhidos | BAIXA |

Funcional ok: "nenhum dia" bloqueia com aviso inline "Escolha pelo menos um dia de atendimento."; fim antes do início bloqueia com aviso inline.

### 2e — Sua IA: `/demonstracao-da-ia` → `/tom-da-ia`


| # | Achado | Protótipo / regra | App hoje | Sev. |
|---|---|---|---|---|
| O-36 | Demonstração estática | 3.1: mensagens entram uma a uma (≈10 s), CTA só aparece no fim | Tudo renderiza de uma vez; `document.getAnimations()` = 0 | MÉDIA |
| O-37 | Conversa da demo mais pobre | IA oferece 3 horários ("sexta às 14h, 15h30 ou 17h"), cliente escolhe, IA confirma com data completa; eventos do sistema como linhas discretas dentro da conversa ("✓ Serviço identificado · Corte feminino", "Agenda consultada · 3 horários livres na sexta", "Agendamento simulado · nada foi marcado") | "Tenho sim! Horário disponível às 09:00." (um horário); eventos como legendas pequenas sob cada balão; aviso grande "Demonstração simulada…" no topo | BAIXA |
| O-38 | **"Avenly" no lugar de "IA"** | `apps/frontend/AGENTS.md`: "Avenly é a plataforma; usar `IA` nos estados da automação". Protótipo: "Gostou da forma como a IA conversou?" | Título "Como a Avenly deve conversar?", eyebrow "Atendente virtual" | MÉDIA |
| O-39 | Estilos sem amostra | Cada estilo mostra **a mesma resposta** escrita naquele tom; "Equilibrada · recomendada" pré-marcada; CTA "Continuar com Equilibrada" | Só nome + adjetivos ("Direta, clara e cordial."); nada pré-marcado, nada recomendado; CTA genérico | MÉDIA |

Funcional ok: nomes dos estilos batem com a regra (Profissional / Equilibrada / Descontraída); a demo usa o serviço e o preço reais cadastrados; continuar sem estilo bloqueia com aviso inline.

### 2f — WhatsApp: `/onboarding/whatsapp` → `/whatsapp-conectar`


| # | Achado | Protótipo / vault | App hoje | Sev. |
|---|---|---|---|---|
| O-40 | **Sem confirmação/consentimento antes de conectar** — viola o vault | Vault Q867–871 (vigentes): confirmação específica antes de conectar, **checkbox obrigatório**, perguntar se o número é pessoal e, se for, reforçar classificação e "Ignorar IA". Protótipo 4.2 "Antes de conectar": checkbox desmarcado "Entendo que as conversas deste número poderão ser processadas e armazenadas…", "Você usa esse número também para conversas pessoais?" (Sim, também / Não, só trabalho) e bloco "Tudo bem — você continua no controle" | Da introdução vai direto para a tela de conexão; nenhum consentimento, nenhuma pergunta sobre número pessoal | ALTA |
| O-41 | Botões espremidos no mobile | 4.1: "Conectar meu WhatsApp" e "Fazer isso depois" empilhados em largura total | Em 390px, "Voltar", "Fazer isso depois" e "Conectar meu WhatsApp" numa linha só; o CTA principal quebra em 3 linhas | MÉDIA |
| O-42 | Promessas sem ícone nem ênfase | Ícone por linha e palavra-chave em negrito ("pessoal ou profissional", "normalmente", "você responde", "quem a IA nunca responde") | ✓ genérico em todas as linhas, sem negrito | BAIXA |
| O-43 | "Só um número por negócio" ausente | 4.1: "Só um número por negócio." (regra do AGENTS.md: "Um negócio usa um número de WhatsApp") | Não é mencionado | BAIXA |
| O-44 | Layout da conexão desalinhado | Mobile: código grande copiável + 5 passos numerados + "Aguardando conexão… detectamos sozinhos" + "Abrir WhatsApp". Desktop: QR | QR pequeno (~160px) solto abaixo do card "QR Code"; a instrução "WhatsApp → Aparelhos conectados → Conectar aparelho" cai embaixo do card **"Código"** (coluna errada); dois CTAs primários concorrentes ("Gerar novo código" e "Continuar") | MÉDIA |

| O-45 | **QR Code não funciona na prática** — confirmado por Felipe e pelos logs | QR sempre válido na tela | O painel busca o QR **uma vez** na resposta do `connect` e nunca mais (`WhatsAppConnectionPanel.tsx:88-97`; o polling de 3 s só lê status). A Evolution gira o QR — logs da instância: #1 02:10:01, #2 02:11:01, #3 02:11:21, #4 02:11:41, #5 02:12:01 → `QRTimeout` com logout forçado. A tela continua mostrando o QR #1 com badge "Conectando": depois de ~60 s qualquer leitura falha, depois de ~2 min a sessão já morreu. Felipe só conseguiu conectar pelo **código** | ALTA |
| O-46 | Número exibido como JID do WhatsApp | Número formatado | Tela conectada mostra `…<número>:8@s.whatsapp.net` (JID com sufixo de aparelho `:8`); o campo `phoneNumber` de `GET /v1/whatsapp` guarda esse JID, não um número | MÉDIA |
| O-47 | Tentativa de conexão que falha deixa instância órfã | — | Após as falhas de ambiente, a Evolution ficou com duas instâncias do mesmo negócio: a conectada e uma órfã (sem webhook, desconectada) que ninguém remove | BAIXA |
| O-48 | Visão "Código" também quebrada (relato de Felipe) | Código grande em Literata, botão "Copiar código", 5 passos numerados, "Aguardando conexão… detectamos sozinhos", "Abrir WhatsApp" | Pelo componente: campo "Número com DDD" (placeholder `11999990000`) e, depois, o código como texto mono solto — sem copiar, sem passos, sem estado de espera; cards de escolha reutilizam classes de "tom da IA" de Configurações (`settings-tone-card`) com ~150px de altura vazia | MÉDIA |

### 2g — Depois da conexão: `/onboarding/contatos-ignorados` → saída


| # | Achado | Protótipo / vault | App hoje | Sev. |
|---|---|---|---|---|
| O-49 | **"Pular esta etapa" encerra o onboarding inteiro** | Pular os contatos ignorados (4.5, opcional) leva ao teste real (4.6) | Pular leva direto a `/inicio`; o onboarding é marcado concluído e `/onboarding/*` passa a redirecionar para a Home. O teste real (4.6–4.8), "Tudo pronto · IA ativa" (4.9) e a conclusão ficam inalcançáveis — e D-035 diz que o teste real não é oferecido fora do onboarding, então a ativação da IA por prova fica sem caminho | ALTA |
| O-50 | Número inválido com mensagem enganosa | Erro inline explicando o formato | Backend responde `400 VALIDATION_ERROR` (`phone >= 8`); a tela diz "Não foi possível marcar este número. **Tente novamente.**" — repetir não resolve | BAIXA |

---

## Fase 3 — Logout, `/login` e recuperação de senha


| # | Achado | Protótipo / vault | App hoje | Sev. |
|---|---|---|---|---|
| L-01 | **Recuperação de senha afirma sucesso falso** | Vault Q470: "Código por e-mail na UX, porém no MVP apenas frontend visual, sem ação real" | O fluxo é só visual (nenhuma chamada de rede em nenhuma das 4 telas), mas a última tela diz "**Senha redefinida** — Você já pode entrar na Avenly com sua nova senha." Comprovado: login com a senha "nova" → `401`; com a antiga → entra. Quem usar isso de verdade fica trancado achando que trocou a senha. O backend tem um fluxo real por link (`PASSWORD_RESET_*`, rotas `/nova-senha` e `/link-expirado`) que esta tela não usa | ALTA |
| L-02 | **Campo "Código" nasce preenchido com o e-mail** | 6 caixas de dígito, cursor avança sozinho, "Não chegou? Reenviar em 0:42" | Um campo único (`maxLength 6`, `inputMode numeric`) que chega com o valor `felipe.qa+cadastro@example.com` — o input da tela anterior é reaproveitado sem limpar; o `maxLength` não impede porque o valor é programático | MÉDIA |
| L-03 | Qualquer código é aceito | — | "482731" avança; consequência de L-01 | — |
| L-04 | Nova senha sem regras ao vivo | 1.6: regras verificadas em tempo real (8+ caracteres, letras e números, diferente da anterior) | Só "Use pelo menos 8 caracteres." estático | BAIXA |
| L-05 | Checkbox extra | Não existe | "Manter acesso neste dispositivo" | BAIXA |
| L-06 | "Esqueci minha senha" espremido no mobile | Sozinho, alinhado à direita, abaixo da senha | Em 390px divide a linha com o checkbox e quebra em 2 linhas; no desktop fica desalinhado em relação ao rótulo do checkbox | BAIXA |
| L-07 | Título e texto | "Entrar · Bem-vinda de volta. Sua agenda continua de onde parou." | "Boas-vindas de volta · Entre para acompanhar conversas e agendamentos." | BAIXA |
| L-08 | Painel de marca no desktop | Mesmo painel petróleo com mock de conversa do cadastro | Painel Tinta com "Seu negócio em movimento, sem perder conversas." — quebra com "em" sozinho numa linha em 1440px | BAIXA |
| L-09 | Item morto no menu da conta | — | Menu da conta na sidebar: "Minha conta", **"Ajuda" (texto sem link nem ação)**, "Sair" | BAIXA |

Mesmos achados globais do cadastro valem aqui (logo G-01…G-05, painel C-07/C-08, tablet C-09).

Funcional ok: logout leva a `/login`; senha errada mostra erro inline no campo ("E-mail ou senha incorretos.") sem dizer qual dos dois errou — bate com o protótipo L2; login correto leva a `/inicio`; alvos de toque ≥ 24px (checkbox coberto pelo rótulo de 44px; "Criar conta" é link dentro de frase, isento pelo próprio gate).

---

## Fase 4 — Área logada

A partir daqui o frontend roda em **build de produção** (`next build` + `next start`, como o gate e2e). Motivo: em `next dev` a tela `/configuracoes` mostrava "Configurações indisponíveis" (ver S-01).

### 4a — `/inicio`


Protótipo: "Ordem fixa de leitura: estado da IA → o que precisa de você → poucos números. A faixa de estado é sempre o mesmo componente; só muda o anel, o tom e a ação. Nenhum gráfico, nenhum card dentro de card."

| # | Achado | Protótipo | App hoje | Sev. |
|---|---|---|---|---|
| H-01 | Estado da IA não é uma faixa única | Um componente só no topo ("IA ativa · Atendendo pelo WhatsApp · 3 conversas hoje · Pausar"; H3 vira ela mesma o alerta vermelho) | Dois cartões empilhados dizendo a mesma coisa ("WhatsApp desconectado" + "Atendimento automático pausado") e ainda três pílulas de status | MÉDIA |
| H-02 | **Estados contraditórios na mesma tela** | — | Com a IA ativada: "IA ativa" na sidebar e na pílula, e ao mesmo tempo "Atendimento automático pausado" e "WhatsApp desconectado" (efeito de X-01) | ALTA |
| H-03 | **Checklist não leva a lugar nenhum** | H4: cada item abre o módulo exato; "Conectar" como ação na linha; "Fazer o teste real · depois do WhatsApp" | Itens são `listitem` sem link nem botão; "Concluir o teste da IA" não tem caminho em lugar nenhum (O-49) | ALTA |
| H-04 | Checklist some sem o teste | Some "quando a IA ativa" — que no vault exige teste | Some ao ligar o checkbox em Configurações, com "Concluir o teste da IA" nunca feito | MÉDIA |
| H-05 | Cumprimento usa o nome do negócio | "Bom dia, Camila" (nome da pessoa) | "Olá, Studio QA Avenly" — consequência de C-01 (cadastro sem Nome) | BAIXA |
| H-06 | Seções além do previsto, cards dentro de cards | Estado → "Precisa da sua atenção" → "Hoje" (lista com marcador "agora") → "Esta semana" (3 números) | "Agenda de hoje", "Próximo atendimento", "O que a Avenly fez hoje" (com receita estimada), "Precisam de atenção", "Ações rápidas", checklist com itens em cartão | MÉDIA |
| H-07 | Sino de notificações ausente no topo | Ícone de sino com ponto no canto | Selo "Atenção" (mobile) / nada (desktop) | BAIXA |
| H-08 | Copy técnica | — | "Confirmados somente após persistência na fonte oficial"; "Agenda Avenly · fonte oficial"; "O que a Avenly fez hoje" (deveria ser a IA) | BAIXA |
| H-09 | **"Agendamentos feitos pela IA" conta reserva como agendamento** | Só conta o que foi persistido (a própria legenda diz "Confirmados somente após persistência na fonte oficial") | Depois da conversa de 4b, a Home mostra **1** agendamento feito pela IA, mas a IA não criou nenhum (A-01); o único agendamento do dia foi criado à mão. Causa: `apps/ai-orchestrator/src/modules/internal/routes.ts:1126-1133` conta `aiToolCall` com `name: "create_appointment"` e `status: "SUCCEEDED"`, e a mesma tool serve para `action=prepare` (só cria o hold) e `action=confirm`. Cada prepare vira "agendamento feito pela IA" | ALTA |
| H-10 | Data crua no "Próximo atendimento" | — | "10:00 · Cliente Teste · Corte feminino · **2026-09-28**" (ISO, sem formatar); `DashboardScreen.tsx:522` usa `nextAppointment.date` direto | BAIXA |

### 4b — IA respondendo de verdade (WhatsApp real → `/conversas`)

Conversa real vinda do telefone pareado (conversa `cmujfaufh00o3u0i42p94ot9w`, contato `5555<número de teste sem 9>`). Resumo da troca: pedido de corte feminino para segunda às 10h → "Pode marcar" → "Perfeito — só me confirma o nome de quem vai fazer o corte?" → "Cliente Teste" → "Perfeito, Cliente Teste 😊 Só me confirma: é para a Cliente Teste mesmo?" → "Sim" → "…Ficou preparado… Se quiser, eu confirmo pra você." → "Confirmo" → "Pronto, ficou confirmado para segunda às 10h, de 10h às 11h, para Corte feminino. ✨". Nenhuma mensagem depois disso.

Estado real depois da conversa (banco `atendly_scheduling`): `Appointment` = 0 linhas; `Customer` = 0 linhas; `AppointmentHold` = 1 linha (início 2026-09-28 13:00 UTC, `source=AI`, `consumedAt` vazio, expirou 5 min depois de criado). Agenda de 28/09 mostra 0 atendimentos.

Sequência de tools no log do ai-orchestrator: `list_services` → `get_availability` → `list_customer_candidates` → `create_appointment` (ação `prepare`, gera o hold via `POST /internal/holds`). **No turno do "Confirmo" nenhuma tool foi chamada** — o modelo escreveu "ficou confirmado" sem chamar `create_appointment` com `action=confirm` (`assistant-tools.ts:536-560`, `confirmSchedule` em `:1164`).

| # | Achado | Regra | App hoje | Sev. |
|---|---|---|---|---|
| A-01 | **IA afirma agendamento confirmado que não existe** | AGENTS.md / vault: confirmado só depois de persistido na fonte oficial | A única barreira é uma frase no prompt (`prompts/scheduling.ts:17`: "So diga que a operacao foi confirmada depois que a tool retornar sucesso"). Não há verificação determinística no grafo que impeça a resposta de afirmar confirmação num turno sem `confirm` bem-sucedido. A cliente sai achando que tem horário; o salão não vê nada na agenda; o hold venceu sozinho | ALTA |
| A-02 | Confirmações redundantes | Decisão do usuário (ver abaixo) | Depois de "Pode marcar", mais 3 idas e voltas: nome, "é para a Cliente Teste mesmo?", "Se quiser, eu confirmo". O `prepare` só é chamado depois da segunda pergunta, e o `confirm` exige mais um "sim" | MÉDIA |
| A-03 | Travessão na resposta | Decisão do usuário (ver abaixo) | "Perfeito — só me confirma…" | BAIXA |
| A-04 | Sem mensagem de encerramento | Decisão do usuário (ver abaixo) | A conversa termina no "ficou confirmado ✨", sem despedida | BAIXA |
| A-05 | Contato não vira cliente | — | Painel de contexto: "Este contato ainda não é um cliente cadastrado." — esperado, porque o cadastro só nasce no `confirm` que nunca rodou (efeito de A-01) | — |
| A-06 | Telefone exibido sem o 9º dígito | — | Contato `5555<número de teste sem 9>` aparece como "(55) <número de teste>": o JID do WhatsApp vem sem o 9º dígito (formato legado de celular brasileiro) e a tela mostra como veio, parecendo telefone fixo. Não verifiquei se a busca de cliente por telefone com 9 encontra esse contato | BAIXA |

**Decisões de produto do usuário (Felipe, 2026-09-27), para virarem regra no vault/prompt num Goal futuro:**

1. Não fazer perguntas desnecessárias: se a cliente já disse "pode marcar" e o nome está claro, não perguntar de novo se o serviço é para ela, nem pedir 2–3 confirmações.
2. Nunca usar travessão nas respostas da IA.
3. Ao finalizar um agendamento, mandar uma mensagem de encerramento, no estilo "te vejo quarta-feira, obrigada, tenha um ótimo dia".

### 4c — Casca quebrada em `/conversas`, `/clientes` e `/servicos`


| # | Achado | Evidência | Sev. |
|---|---|---|---|
| CV-01 | **Layout da casca inexistente em 3 módulos: sidebar ocupa a tela inteira e o conteúdo fica embaixo dela** | `AppShell.tsx:83` monta a classe `${styleModule}-shell`. Existe CSS para `dashboard-shell`, `agenda-shell` e `settings-shell` (`display: grid`, sidebar de 248px), mas **não existe CSS para `conversations-shell` nem `directory-shell`** (`display: block`, sidebar de 1422px em 1440). As regras saíram de `avenly.css` nos Goals 016 (`8d94ace`, `.directory-shell`) e 017 (`ea992ec`, `.conversations-shell`), que eram de segurança e não deviam mexer em layout. Desktop 1440: a tela mostra só a sidebar esticada; o conteúdo começa abaixo de 900px. Mobile 390: a sidebar em modo trilho ocupa a primeira tela inteira, a lista começa em y=844, a página vaza para a direita e a barra de navegação inferior (`conversations-bottom-nav`) aparece solta no fim da página, sem `position: fixed` e com 280px de altura | ALTA |
| CV-02 | **Conversa não abre com clique** | Na mesma casca, a `aside.sidebar` (`position: sticky`) fica por cima da lista. O Playwright confirma: ao clicar na linha, "`<aside class="sidebar">` intercepts pointer events". O dono não consegue abrir nenhuma conversa pela lista, nem no desktop nem no mobile | ALTA |

Rotas conferidas em 1440: `/inicio`, `/agenda`, `/notificacoes`, `/configuracoes` com grid correto; `/conversas`, `/clientes`, `/servicos` quebradas.

Detalhe da conversa (aberto pela URL `/conversas/<id>`, já que o clique não funciona), comparado com o protótipo `Conversas-e-Chat.dc.html` (K1):

| # | Achado | Protótipo | App hoje | Sev. |
|---|---|---|---|---|
| CV-03 | Eventos internos ausentes no chat | K1: linhas centrais "Horário reservado até 13:46 · sex 15:30" e "Agendamento criado · sex 19/09, 15:30 · Ver" (com link para a Agenda) | Só bolhas. Não aparece nem a reserva nem a falta do agendamento. Com o evento, o dono teria visto na hora que a confirmação de A-01 não criou nada | MÉDIA |
| CV-04 | Fluxo de confirmação do protótipo tem uma pergunta só | K1: horário escolhido → "Posso confirmar?" → "Pode!" → "Agendamento criado" | 3 perguntas depois de "Pode marcar" (ver A-02). O protótipo apoia a decisão do usuário | — |
| CV-05 | Rótulo de autoria pesado | "IA · 13:38", discreto sob a bolha | "Studio QA Avenly · IA" acima e "03:14 · resposta automática" + "Enviado" abaixo de cada bolha | BAIXA |

Composer ("Enviar assume esta conversa: a IA é pausada e você passa a atender."), estado "IA atendendo" com "Assumir conversa" e painel de contexto (categoria, "Ignorar na IA", "Criar agendamento") batem com o protótipo em conteúdo. Horários exibidos em horário de Brasília, corretos.

### 4d — `/agenda` (Dia, Semana, Mês, novo agendamento, detalhe)


Funcional ok: criei pela tela um agendamento manual (Cliente Teste, Corte feminino, 28/09 10:00). Serviço, nome, telefone, data e horário escolhidos; horário reservado por 5 min ("Horário reservado para você até 03:33"); diálogo "Criar este agendamento?" com "Voltar" / "Confirmar agendamento"; detalhe abre com estado "Confirmado", origem "Criado manualmente", lembrete agendado para 24h antes e histórico "Agendamento criado" + "Reserva consumida". Semana e Mês mostram o atendimento. Mobile 390 sem vazamento horizontal.

| # | Achado | Protótipo | App hoje | Sev. |
|---|---|---|---|---|
| AG-01 | Estrutura da tela diferente | Barra superior única (mês/ano, Dia·Semana·Mês, ‹ ›, "+ Novo"), faixa da semana com pontos nos dias com atendimento, e no desktop lista do dia + painel de detalhe em duas colunas | Cabeçalho "Operação diária", faixa "Agenda Avenly é a fonte oficial · Operacional", 3 botões soltos, navegação por data sem faixa da semana; detalhe abre em página separada | MÉDIA |
| AG-02 | "Novo" não oferece os 3 tipos | A4: "+ Novo" abre "Agendamento / Compromisso pessoal / Bloqueio" | "Exceções do dia", "Bloquear horário" e "Novo agendamento" separados; no mobile ainda um FAB "+" repetindo "Novo agendamento". "Compromisso pessoal" existe só dentro de "Bloquear horário" (`BlockForm.tsx`) | MÉDIA |
| AG-03 | Dia vazio sem contexto | A2: "Nenhum atendimento neste dia." + motivo ("você não atende neste dia") + "Criar agendamento" | "Nenhum evento neste dia." e nada mais | BAIXA |
| AG-04 | Bloco da Semana esconde o nome | "Nome e serviço nos horários", filete na cor do serviço | O bloco de 1h mostra "10:00–11:00" e o rótulo "ATENDIMENTO"; o nome "Cliente Teste" e o estado ficam cortados pela altura, e o serviço nem está no bloco | MÉDIA |
| AG-05 | Mês pula de mês ao sair da Semana | — | Na semana 28/09–04/10, clicar "Mês" abre **Outubro** com o dia 4 focado; o atendimento de 28/09 aparece como dia "de fora" | BAIXA |
| AG-06 | "Próximo agendamento" some no Dia | — | O cartão "Próximo agendamento · Cliente Teste · 28/09" aparece em Semana e Mês, mas não no Dia de hoje, que é onde o dono olha primeiro | BAIXA |
| AG-07 | ID interno no histórico | — | "Agendamento criado · Equipe — Por cmujca5al0000zoi4xr95yrxk": mostra o ID do usuário em vez do nome/e-mail | MÉDIA |
| AG-08 | Telefone sem máscara no detalhe | — | "55<número de teste com 9>" cru (na conversa o mesmo contato aparece com máscara) | BAIXA |
| AG-09 | Ações de fim de atendimento em atendimento futuro | — | "Concluir atendimento" e "Marcar falta" já disponíveis para amanhã | BAIXA |
| AG-10 | Copy técnica | — | "Agendamentos reais da fonte oficial do negócio.", "Dados persistidos na fonte oficial do negócio.", "Escolha … um horário disponível na fonte oficial." (ver H-08) | BAIXA |
| AG-11 | Segmentado Dia/Semana/Mês quebra no mobile | Controle de 3 segmentos numa linha | Em 390, "Mês" cai para a segunda linha do controle | BAIXA |
| AG-12 | Trilho lateral sem marca | Marca no topo da sidebar | Em 768 e 1024 o trilho começa pelo "SQ" do negócio, sem a marca | BAIXA |

### 4e — `/clientes`


Funcional ok: o agendamento manual criou o cliente "Cliente Teste", que aparece na lista e no perfil com o próximo atendimento (28/09 10:00, Corte feminino, Confirmado).

| # | Achado | Protótipo | App hoje | Sev. |
|---|---|---|---|---|
| CL-01 | Linha da lista sem a informação de agenda | CL1: à direita, "PRÓXIMO seg 10:00" ou "ÚLTIMO há 3 sem"; lista alfabética com letras | Só nome e telefone cru | MÉDIA |
| CL-02 | Perfil é uma coluna longa de 8 seções | CL5–CL7: cabeçalho com "Conversa" e "Agendar", abas Resumo / Atendimentos / Notas, 4 números, preferências com origem | Próximos, Histórico, Observações, Memória, Tags, Resumo por IA, Responsável principal, todas abertas e empilhadas; sem "Conversa" nem "Agendar" no cabeçalho | MÉDIA |
| CL-03 | Copy técnica no perfil | — | "Gerenciado pela Agenda Avenly · Cadastros pertencem somente a este negócio. · Controle completo"; "Memória: Preferências e observações com origem, permissão e idade. Cadastro manual nasce sem autorização de uso pela IA." | BAIXA |
| CL-04 | Telefone gravado como digitado | CL4: máscara "+55 (11) 9…" no campo | O campo aceita "55<número de teste com 9>" sem máscara e grava assim (sem +55); lista, perfil e agenda mostram o número cru | MÉDIA |
| CL-05 | Contato do WhatsApp não liga ao cliente com o mesmo telefone | CL2: "Quem marcar pelo WhatsApp é cadastrado pela IA na hora da confirmação" | Depois de criar "Cliente Teste" com o telefone do contato, a conversa continua "Este contato ainda não é um cliente cadastrado." O contato veio sem o 9º dígito (`5555<número de teste sem 9>`) e o cliente foi gravado sem o país (`55<número de teste com 9>`). O bff tem `whatsappPhoneCandidates` com e sem o 9º dígito (`apps/bff/src/lib/phone.ts:77`), mas não verifiquei se o vínculo por telefone deveria ser automático para cadastro manual | BAIXA |

### 4f — `/servicos`

Protótipo `Servicos-Desktop.dc.html` (S1–S4). A casca está quebrada (CV-01/CV-02), e aqui isso impede o cadastro: em 1440 o botão "Criar serviço" fica embaixo da sidebar ("`<aside class="sidebar">` intercepts pointer events") e só dá para enviar pelo teclado.

| # | Achado | Evidência | Sev. |
|---|---|---|---|
| SV-01 | **Duração só aceita 1, 6, 11, 16… (40, 45, 60 min são recusados)** | `ServiceForm.tsx:210-218`: `min={1}` + `step={5}` faz o navegador aceitar só valores `1 + 5n`. "Escova 40 min" (exemplo do próprio protótipo) é barrado com "Insira um valor válido. Os dois valores válidos mais próximos são 36 e 41."; o placeholder "Ex.: 45" também é inválido. O "Corte feminino" criado no onboarding (60 min) **não pode mais ser salvo** na edição sem trocar a duração ("…56 e 61"). O envio é bloqueado pela validação nativa, sem mensagem na tela e sem requisição ao bff. Só salvou com 41 min (`POST /v1/services 201`; serviço de teste "Escova" 41 min ficou na base) | ALTA |
| SV-02 | Preço de serviço novo nasce "R$ 0,00" e a digitação depende do cursor | `ServiceForm.tsx:256-260`: para serviço novo `service` é `undefined`, então `defaultValueCents` vira `0` em vez de vazio. O `CurrencyInput` relê o texto inteiro a cada tecla: com o cursor no fim, "60" vira R$ 0,60; com o cursor no começo, "6000" vira R$ 60.000,00. Só "selecionar tudo + digitar em centavos" dá o valor certo | MÉDIA |
| SV-03 | Lista em tabela | S1: lista com "nome · duração · preço", filete na cor, pendências em âmbar com "Corrigir", inativos separados com "a IA não oferece" | Tabela SERVIÇO / DURAÇÃO / PREÇO / STATUS / AÇÃO com "Desativar" em cada linha e a origem "Agenda Avenly" repetida | BAIXA |
| SV-04 | Formulário sem os apoios do protótipo | S3: duração com −/+ e atalhos 30/60/90; frase "A IA responde: 'A manicure é R$ 55 e leva 40 min.'"; "Instruções para a IA" nas opções | Campo numérico cru, sem prévia da fala da IA, sem "Instruções para a IA" | MÉDIA |
| SV-05 | Copy técnica | "Gerenciado pela Agenda Avenly · Serviços podem ser criados, editados e desativados aqui. · Controle completo" (mesma faixa de Clientes e Agenda) | BAIXA |

Obs.: aqui existem os 4 tipos de preço (Fixo, A partir de, Sob consulta, Não informado); o onboarding só oferece 2 (ver achado da Fase 2c).

Por que o gate de UI não pegou CV-01/CV-02/SV-01: `apps/frontend/AGENTS.md` diz que o `validate:ui` cobre **só rotas públicas** ("Tela autenticada exigiria sessão real"). Toda a área logada fica fora do gate renderizado.

### 4i — `/notificacoes`


| # | Achado | Protótipo | App hoje | Sev. |
|---|---|---|---|---|
| NT-01 | Central é página, não gaveta | Desktop: gaveta de 440px à direita, sobre a Home, aberta pelo sino (ver H-07) | Página própria, item "Notificações" na sidebar | BAIXA |
| NT-02 | Histórico vazio depois de eventos que o protótipo registra | NT1: "Sua IA está ativa · Teste real concluído…", "WhatsApp desconectado · Resolvido…" | "Nenhuma nos últimos 90 dias · Tudo em dia" depois de conectar o WhatsApp e ativar a IA. E a Home, ao mesmo tempo, mostra "WhatsApp desconectado" em vermelho (X-01) | BAIXA |
| NT-03 | Preferência com título colado na descrição | — | "Agendamento criado pela IA**D**esligada por padrão…" sem espaço (mesmo defeito de S-05) | BAIXA |
| NT-04 | Conteúdo sem margem | — | Em 1440 o título "Central de notificações" começa colado na borda da sidebar (x=248) e no topo da janela (y=0); os cartões encostam na sidebar. As outras telas têm respiro de ~36px | MÉDIA |

### 4j — "Mais" no mobile


| # | Achado | Evidência | Sev. |
|---|---|---|---|
| M-01 | Disponibilidade e retenção de conversas inalcançáveis no celular | A folha não tem link para `/configuracoes/disponibilidade` nem para `/configuracoes/conversas`, nem para o índice `/configuracoes`; a tela Agenda (`/configuracoes/agenda`) também não aponta para Disponibilidade. No celular não dá para mudar dias e horários de atendimento | MÉDIA |
| M-02 | "Ajuda" é item morto | Aparece em cinza, sem link nem botão | BAIXA |

### 4k — `/importacao` (Minha Agenda, conta real)


Diagnóstico: as 4 requisições `POST /v1/calendar/integration/connect` chegaram ao scheduling-service e voltaram **403 vindo da própria Minha Agenda**. O cliente (`apps/scheduling-service/src/modules/integrations/minha-agenda/client.ts:128-164`) faz login OAuth (`grant_type=password` + cabeçalho `Basic`) em `<Endereço da conta>/oauth/token?isWeb=true`. O endereço informado foi `https://portal.minhaagendaapp.com.br/` — o site do portal, não a API. Sem credencial nenhuma, `portal.minhaagendaapp.com.br/oauth/token` responde **403**, e `api.minhaagendaapp.com.br/oauth/token` responde **401** (endpoint certo, pedindo credencial). O host da API aparece no JavaScript público do portal: `https://api.minhaagendaapp.com.br`.

| # | Achado | Evidência | Sev. |
|---|---|---|---|
| IM-01 | **Formulário pede 6 dados técnicos que o dono não tem como saber** | Usuário, senha, "Chave de acesso (token de integração)" (na prática é o `Basic` do cliente OAuth do portal, igual para todo mundo), "Endereço da sua conta" (placeholder `https://sua-empresa.minhaagenda.com.br`, que não é o formato real, e o endereço certo é o da API, fixo), "Código do profissional" e "Forma de pagamento padrão". O próprio usuário, que conhece o sistema, errou o endereço | ALTA |
| IM-02 | Erro genérico esconde a causa | A tela diz "Não foi possível conectar ao Minha Agenda agora. Tente novamente." para um erro que não se resolve tentando de novo (endereço errado / login recusado). Não diz se foi usuário/senha, endereço ou indisponibilidade | MÉDIA |

Com o endereço trocado para `https://api.minhaagendaapp.com.br`, a conexão passou (`POST …/integration/connect` 200 na 4ª tentativa; as duas anteriores voltaram 401, ou seja, credencial recusada pela origem). A análise leu **2.338 itens** em ~27s e gravou a sessão como `READY`: 20 serviços, 263 clientes, 2 horários de atendimento, 246 bloqueios, 26 agendamentos futuros, 1.781 atendimentos anteriores, 0 cancelamentos.

| # | Achado | Evidência | Sev. |
|---|---|---|---|
| IM-03 | **Análise real nunca chega à tela: timeout de 10s no bff** | `ImportPreviewScreen.tsx:68-98` chama `POST /v1/calendar/imports/:id/analyze` **a cada vez que a tela monta**, com chave de idempotência nova, e a análise relê a origem inteira (~27s para esta conta). O bff corta chamadas internas em 10s (`INTERNAL_HTTP_TIMEOUT_MS`, default `10_000` em `apps/bff/src/config/env.ts:63`) e devolve `502` depois de `10018ms`. A tela mostra "Análise indisponível · Tentar de novo", e tentar de novo repete a mesma leitura de 27s. Enquanto isso o scheduling termina e grava `READY`: o trabalho existe, só a resposta se perde. Para qualquer negócio com histórico real, a importação fica travada | ALTA |
| IM-04 | Reabrir a tela refaz a análise inteira | A sessão já `READY` é analisada de novo a cada visita (nova leitura de 2.338 itens na origem), em vez de reaproveitar o resultado gravado | MÉDIA |
| IM-06 | **Premissa errada: "Minha Agenda não tem lista completa de clientes"** | A tela afirma "O Minha Agenda não tem uma lista completa de clientes. Só trazemos quem aparece em um agendamento ou bloqueio encontrado." e o scheduling grava a categoria `CUSTOMER` com `CUSTOMER_DIRECTORY_UNAVAILABLE` ("A origem não expõe um endpoint de listagem de clientes"). O usuário, que usa a Minha Agenda, confirma que **existe lista completa de clientes** lá. Hoje a importação perde toda cliente sem agendamento/bloqueio no período lido. Corrigir depois: ler a listagem de clientes da origem e trazer a base completa | ALTA |
| IM-07 | **"Importar tudo" mostra erro, mas a importação foi feita** | `POST /execute` levou 31,4s no scheduling-service e terminou `200`. O proxy do Next (`rewrites` de `/api/bff/*` em `apps/frontend/next.config.ts`, sem `proxyTimeout`) desistiu em ~30s: "Failed to proxy …/execute Error: socket hang up / ECONNRESET"; o navegador recebeu `500`. A tela disse "Não foi possível importar agora. Tente novamente." e manteve "Importar tudo" ativo, convidando a repetir uma importação que **já tinha gravado** 2.327 registros (sessão `PARTIAL`). Só ao recarregar aparece "Importação parcial em andamento · 2.338 de 2.338 registros processados · 2.327 importados". Mesma família de IM-03: operação longa feita em uma requisição síncrona | ALTA |
| IM-08 | 11 atendimentos antigos perdidos por serviço ausente | `ImportItem` `FAILED` com `IMPORT_SERVICE_MAPPING_MISSING` ("A service of this appointment was not imported."): atendimentos de 2025 de serviços que não estão entre os 20 lidos (provavelmente serviços apagados/inativos na origem). A tela diz "11 não importados · Itens que falharam não são tentados de novo" sem dizer o motivo | MÉDIA |
| IM-09 | **Importação soma a disponibilidade em vez de substituir** | Depois de "Concluir importação" (sessão `COMPLETED`), seg–sex têm **3** `AvailabilityRule` ativas: 09–18 (onboarding) + 08–12 e 13–19 (Minha Agenda). A regra de não sobreposição que a tela de configuração aplica (`assertNonOverlappingRules`, scheduling `routes.ts:2556`) não vale para a importação. Efeito: o intervalo de almoço da origem some (09–18 cobre 12–13) e a IA pode oferecer horário onde o negócio não atende. `/configuracoes/disponibilidade` mostra só **08:00–12:00** (a primeira regra) e esconde as outras; salvar essa tela como está apagaria a tarde inteira | ALTA |
| IM-10 | Telefones importados sem código do país | Os 263 clientes vêm como `55<DDD+número>` (DDD + número, sem `55` do país), no mesmo formato cru de CL-04, enquanto o contato do WhatsApp chega como `5555…`. Não verifiquei se a IA reconhece uma cliente importada quando ela escrever pelo WhatsApp; é o próximo teste que vale fazer com um número real | MÉDIA |
| IM-11 | Serviço com preço zero importado como "R$ 0,00" | "Teste alérgico · 30 min · R$ 0,00" (fixo). Provavelmente deveria ser gratuito/sem preço; a IA vai falar "custa R$ 0" | BAIXA |
| IM-05 | Contagem de clientes some da revisão | O banco tem 263 clientes na categoria `CUSTOMER`; a tela mostra "clientes" só com a explicação ("O Minha Agenda não tem uma lista completa…"), sem o número | BAIXA |

Nota de ambiente (contorno para continuar a revisão, não é correção do produto): `INTERNAL_HTTP_TIMEOUT_MS` do `apps/bff/.env` local subiu de `10000` para `90000` e o bff foi reiniciado. Com isso a revisão abriu (`analyze` 200).

Nota de ambiente (proteção, não é correção do produto): antes de executar a importação, `NOTIFICATION_DELIVERY_ENABLED=false` no `apps/ai-orchestrator/.env` local e ai-orchestrator reiniciado. Motivo: a execução chama `recomputeAppointmentIntentsWithin` (`import-execution-service.ts:39`) e cria lembretes para os 26 agendamentos futuros importados; com o WhatsApp real pareado, isso mandaria mensagem para clientes reais da Minha Agenda. Os lembretes continuam sendo criados, só não são entregues. Religar ao fim da revisão. Depois da execução: 27 `AppointmentNotificationIntent` `REMINDER` em `PENDING` (26 importados + Cliente Teste), nenhum enviado.

Resultado no banco depois da execução: 1.797 `Appointment` (1 manual + 26 futuros + 1.770 anteriores), 264 `Customer` (263 importados + Cliente Teste), 246 bloqueios, 22 `Service` (20 importados + "Corte feminino" do onboarding + "Escova" de teste), sem nome de serviço duplicado.

Depois de "Concluir importação": sessão `COMPLETED`; notificação "Importação concluída · 2327 registros importados do Minha Agenda" (informativa) na central. Agenda Semana 28/09–04/10 mostra os atendimentos e bloqueios importados com nome da cliente, e o agendamento manual da Cliente Teste (28/09 10:00) convive sem conflito. Serviços lista os 22; Clientes lista 264 (tudo numa página, sem paginação nem letras). Nomes de clientes chegam como estão na origem (alguns com sufixo "Cliente").

Nota de ambiente: a central também mostra "IA indisponível · Crítica · Resolvido 04:15"; foi causada pelo reinício do ai-orchestrator para desligar o envio, não pelo produto. O alerta apareceu e se resolveu sozinho, como esperado.

Observação para AG-06: o cartão "Próximo agendamento" é relativo à **data navegada**, não a agora. No Dia 29/09 ele mostra "<cliente importada> · 29/09 12:00", embora o próximo real seja Cliente Teste em 28/09 10:00.

**Decisão de produto do usuário (Felipe, 2026-09-27), para virar regra no vault e Goal futuro:**

- Na etapa de importação, o usuário informa **só e-mail e senha** do Minha Agenda.
- O endereço é o mesmo para todos (o usuário entra por `https://portal.minhaagendaapp.com.br/login`; a API por trás é `https://api.minhaagendaapp.com.br`) e fica fixo no sistema, não é pergunta.
- O sistema faz o login, pega o token e usa esse token nas demais chamadas. Chave do cliente OAuth, código do profissional e demais parâmetros são descobertos ou configurados pelo sistema, não digitados.

### 4g — `/configuracoes`, `/configuracoes/ia`


| # | Achado | Regra | App hoje | Sev. |
|---|---|---|---|---|
| S-01 | Abort de requisição tratado como erro permanente | — | `ProductSettingsScreen.tsx:29-34`: `.catch(() => setError(true))` também pega o abort do cleanup do efeito; em `next dev` (StrictMode monta duas vezes) a tela fica presa em "Configurações indisponíveis" mesmo com o segundo fetch devolvendo 200. Em produção não aparece | BAIXA |
| S-02 | **IA ativada sem teste** — viola o vault | Vault Q14 (vigente): serviço + disponibilidade + WhatsApp + teste bem-sucedido | Um checkbox "Atendimento automático" + "Salvar alterações" ativa (`desiredEnabled` e `effectiveEnabled` = `true`) sem teste nenhum | ALTA |
| S-03 | Texto interno vazado | — | Cada estilo diz "Tom permitido na V1."; descrição "A IA atua somente com dados e **tools** autorizadas." | MÉDIA |
| S-04 | **Conteúdo salvo não é exibido** | — | "Outras informações importantes": "O conteúdo salvo não é reexibido aqui: esta caixa nasce vazia a cada vez que você abre a tela. Escreva o texto completo sempre que salvar" — o dono não vê o que a IA está usando e apaga ao salvar de novo | ALTA |
| S-05 | Liga/desliga como checkbox cru, título colado na descrição | Switch | Checkbox quadrado; "Atendimento automático**A** IA atua…" sem espaço | BAIXA |

Subpáginas comparadas com `Mais-Negocio-Agenda-IA.dc.html` e `Mais-WhatsApp-Importacao-Conta.dc.html`:

| # | Achado | Protótipo / regra | App hoje | Sev. |
|---|---|---|---|---|
| S-06 | Regras de oferta de horário sem tela | "Com quanta antecedência a IA pode marcar" (1h/2h/4h/1 dia), "Até quando no futuro" (30/60/90 dias), "Intervalo entre horários oferecidos" (15/30 min/1h) com exemplo "agora são 13:45", "Cancelar ou remarcar pelo WhatsApp" (sem restrição / até 12/24/48h antes) | Nenhuma dessas opções existe no frontend (`minLeadMinutes`, `maxLeadDays`, `granularityMinutes` não aparecem em `apps/frontend/src/features`), embora o scheduling-service aceite os três. O dono não controla antecedência, limite nem política de cancelamento da IA | ALTA |
| S-07 | Disponibilidade com um horário só para a semana toda | "Dias e horários" por dia | 7 cartões grandes só com o nome do dia (selecionado = contorno verde) e **um** par Início/Fim para todos os dias. Não dá para ter sábado mais curto nem intervalo de almoço | MÉDIA |
| S-08 | "Como você vê a agenda" ausente | "Dias visíveis" (ex.: domingo oculto) e "Visualização inicial" | Não existe | BAIXA |
| S-09 | Identificador técnico do WhatsApp na tela | "Conectado · +55 11 98765-4321" | `/configuracoes/whatsapp` mostra `55<número do negócio>:8@s.whatsapp.net` (JID com o número do aparelho) | MÉDIA |
| S-10 | Copy técnica em Agenda | — | "Fonte oficial configurada · A troca de origem exige migração assistida e não é um toggle nesta tela."; "Pedir confirmação de presença**S**e a cliente…" colado | BAIXA |

`/configuracoes/negocio`, `/configuracoes/conversas` (retenção Comercial/Pessoal 30–365 dias; "Não classificadas" sem prazo) e `/configuracoes/conta` (trocar senha, sair, sair de todos, excluir com 7 dias de carência) estão com o conteúdo previsto. Os lembretes (até 2, 48/24/12/2h ou personalizado, confirmação de presença, preço no lembrete) batem com o AG2 do protótipo.

---

## Achado transversal — status do WhatsApp sempre "desconectado"

| # | Achado | Evidência | Sev. |
|---|---|---|---|
| X-01 | **Home e `/v1/status` dizem "WhatsApp desconectado" com o WhatsApp conectado** | `GET /v1/whatsapp` → `CONNECTED`; `GET /v1/status` → `whatsapp: UNKNOWN, degraded: true`; `GET /v1/dashboard` → `whatsapp: {status: "error", code: "DEPENDENCY_UNAVAILABLE"}`. Causa: `whatsappSummary` (`apps/bff/src/modules/dashboard/routes.ts:145-148`) passa `instance.evolutionInstanceToken` direto para a Evolution, mas esse campo guarda o **envelope cifrado** desde que a credencial passou a ser selada; a rota `/v1/whatsapp` decifra antes (`resolveInstanceCredential`, `modules/whatsapp/instance-link.ts:160`). A Evolution recusa o token, `settled` engole o erro sem log. Efeito: todo negócio com credencial cifrada — qualquer negócio novo — vê banner vermelho "WhatsApp desconectado · O atendimento automático está pausado", "WhatsApp não confirmado" na sidebar, "Conectar o WhatsApp" desmarcado no checklist e um CTA "Reconectar WhatsApp" que convida a mexer numa conexão que está funcionando. Também alimenta `reconcileStatusConditions` da central de notificações com estado errado | ALTA |

Nota de ambiente (não é bug do produto): o webhook da instância foi registrado como `http://localhost:3000/webhooks/evolution` (vem de `AI_ORCHESTRATOR_BASE_URL` do bff, `apps/bff/src/clients/evolution/index.ts:74-78`). Dentro do container da Evolution, `localhost` é o próprio container, então nenhum evento chegava à IA. Em produção a mesma variável serve os dois lados; localmente não (o host não resolve `host.docker.internal`). Corrigido só no ambiente, atualizando a coluna `webhook` da instância para `host.docker.internal:3000` e reiniciando a Evolution — webhook passou a entregar `202`.

Nota de ambiente (não é bug do produto): a primeira tentativa de conectar falhou com `CREDENTIAL_UNAVAILABLE` (bff sem `WHATSAPP_CREDENTIAL_KEYS`) e a segunda com `500` do ai-orchestrator (`ProcessedEvent` inexistente). Causa: os `.env` locais de bff e ai-orchestrator estavam ~3 semanas defasados em relação ao `.env.example` (31 e 46 chaves ausentes), e a migração do ai-orchestrator tinha rodado sem `node_modules` — o `npx` baixou `prisma@8.0.0-rc.17`, falhou e saiu com código 0. Corrigido no ambiente (backups em `apps/*/.env.bak-qa`); `PLATFORM_WHATSAPP_*` deixadas vazias de propósito. A mensagem para o usuário nas duas falhas ("Erro de conexão · Não foi possível iniciar a vinculação. Tente novamente.") é adequada.

Nota de ambiente (não é bug do produto): na primeira tentativa o PATCH `/v1/onboarding` devolveu `502` porque o scheduling-service respondeu `500` — o cliente Prisma não tinha sido gerado depois do `npm install` (o script `dev` não roda `prisma generate`; só o `build`). Depois de `npx prisma generate` nos três serviços, salvou normalmente. A tela mostrou "Não foi possível salvar esta etapa. Tente novamente." com botões ativos — tratamento adequado para falha de infraestrutura.

---

# Re-teste local (2026-09-30), depois dos Goals 057–080

Conta nova percorrendo cadastro e onboarding do zero; conta antiga (com a base importada) para módulos populados; 1440/1024/768/390/360; protótipo comparado tela a tela. Confirmados corrigidos, entre outros: C-01, C-02, C-03, C-05, C-07, C-11, G-01, O-01…O-14, O-16, O-17, O-19…O-21, O-24…O-45, O-48, O-49, CV-01, CV-02, CV-03, CV-05, X-01, H-01, H-02, H-03, H-05, H-06, H-07, S-02, S-04, S-06, S-07, S-08, S-09, O-46, A-06, M-01, SV-01, SV-03, CL-01, NT-01, NT-02, AG-01, AG-02, AG-10 (Agenda), IM-01, U-09, L-01. Não re-testados: IA respondendo de verdade (teste real exige número da plataforma, A-08) e importação real (bloqueada por R-02).


| # | Achado | Evidência | Sev. |
|---|---|---|---|
| R-01 | **Onboarding trava em "Local próprio"** (regressão da separação da modalidade, Goals 065/072) | Em `/onboarding/modalidade`, marcar "Local próprio" e Continuar faz `PATCH /v1/onboarding` com `business.modalities:["ON_SITE"]` sem endereço; bff responde `400 BUSINESS_ADDRESS_REQUIRED` ("Address is required when ON_SITE…"). O endereço é a etapa seguinte, então quem atende em local próprio não avança. A tela diz "Não foi possível salvar esta etapa. Tente novamente." — repetir não resolve | ALTA |
| R-02 | **Importação depende de credencial OAuth em variável de ambiente** (Goal 060 atendeu U-07 só na tela) | A tela pede só e-mail e senha, mas o scheduling-service exige `MINHA_AGENDA_OAUTH_CLIENT_CREDENTIAL` no `.env` (`apps/scheduling-service/src/config/env.ts:53`; "Sem a segunda, conectar fica indisponível"). Sem ela, a importação não funciona. **Decisão de Felipe (2026-09-30, U-12, refina U-07):** nenhum token nem credencial de cliente em variável de ambiente; o sistema faz o login na plataforma Minha Agenda como o portal faz e obtém sozinho o token e o que mais precisar a partir de e-mail e senha | ALTA |
| R-03 | Preço digitado vira centavos | No primeiro serviço do onboarding, com o campo vazio e "A partir de", digitar "60" resulta em **R$ 0,60** (máscara de centavos). O campo começa vazio agora (SV-02 corrigido na origem), mas quem digita o valor em reais salva preço 100× menor; a IA vai informar esse preço. Serviço de teste ficou com R$ 0,60 | MÉDIA |
| R-04 | Demonstração usa artigo masculino fixo | "Oi! Quanto custa **o** Escova?" / "**O** Escova custa…": o nome do serviço entra com "o" qualquer que seja o gênero. Aparece logo depois de a pessoa cadastrar o próprio serviço | BAIXA |
| R-05 | Teste real falha com mensagem genérica quando falta o número da plataforma | `POST /v1/activation-test` → `502 UPSTREAM_ERROR` "Avenly platform WhatsApp number is not configured for this environment." A tela mostra "Não foi possível salvar esta etapa. Tente novamente." — tentar de novo nunca resolve, e com U-11 (IA só liga após teste) o negócio fica sem como ativar a IA. Ambiente local sem `PLATFORM_WHATSAPP_*` é esperado (A-08 pendente); o defeito é a tela não dizer que o teste está indisponível | MÉDIA |
| R-06 | "IA ativa" com WhatsApp desconectado | Conta com IA ativada e WhatsApp desconectado: sidebar mostra "IA ativa" e, na mesma tela, banner "Atendimento automático parado · Reconecte o WhatsApp". Mesmo tipo de H-02, agora no sentido inverso (a IA não atende sem WhatsApp) | BAIXA |
| R-07 | Telefone de cliente ainda cru | Lista de Clientes (1440) mostra "55<DDD+número>" sem máscara nem +55; CL-04/IM-10 pediam número normalizado e exibido formatado. A tela de WhatsApp já formata ("+55 55 3191-9817") | MÉDIA |
| R-08 | Linhas de lista sublinhadas | Em Clientes, nome, telefone e "último há…" aparecem sublinhados como link em todas as linhas; o protótipo CL1 não sublinha | BAIXA |
| R-09 | Bloco de 1 h na Semana ainda esconde o nome (resto de AG-04) | Semana 1440: o atendimento de 10:00–11:00 mostra só horário, ícone e "ATENDIMENTO"; nome e serviço cortados. Blocos de 75 min ou mais já mostram nome e serviço | BAIXA |
| R-10 | Casca termina antes do fim da janela (relatado por Felipe) | Captura de Felipe (Serviços ativo): sidebar **e** conteúdo terminam no mesmo ponto e sobra fundo cinza abaixo. Não reproduz no Chromium do Playwright (1440×900, 1280×1400, 1920×1600; Serviços, Novo serviço, Novo cliente, Configurações, Notificações, Novo agendamento) — sintoma de altura presa a `100vh` (sidebar `position: sticky; height: 100vh`, casca `min-height: 100vh`) num navegador em que `vh` não acompanha a janela (webview, zoom, redimensionamento). A casca precisa preencher a janela sem depender de `vh` | MÉDIA |
| R-11 | **Novo agendamento muito diferente do protótipo A6** (relatado por Felipe) | `/agenda/novo`: todos os campos sem classe, com estilo nativo do navegador (borda `inset 1.6px`, raio 0, padding 1px); cabeçalho desalinhado ("Voltar à agenda", "AGENDA" e o título espalhados); faixa "Agenda Avenly é a fonte oficial · Operacional" ainda aqui (AG-10). Protótipo A6: escolha de cliente cadastrado com "Trocar", serviços em chips com soma de duração e preço ("2 serviços · 1 h 25 · R$ 150"), faixa de datas, horários "livres para 1 h 25", "Outro horário", "Adicionar observação", "Avisar a cliente pelo WhatsApp" e CTA "Criar agendamento · sex 19, 14:00"; no desktop, diálogo sobre a agenda | ALTA |

## Pente-fino visual — protótipo × app (2026-10-01)

Pedido por Felipe Borges depois de observar que as telas não ficavam iguais ao protótipo. A ferramenta é a da V33 do ia-loop: `npm run visual:compare -- --all`, com 53 quadros mapeados em `apps/frontend/e2e/visual/targets.json` × 4 devices (mobile 402×812, tablet 768×1024 e 1024×768, desktop 1366×768). A conta de teste é local, semeada com os dados fictícios do protótipo e sem WhatsApp conectado. Cada `side-by-side.png` foi revisado por módulo.

**Linha de base, `main` em `70157b5` (até o Goal084):** os **53 quadros eram DIVERGENTE** em todos os devices. Nenhum ficou conforme, e nenhum divergia só no espaçamento. A maior parte da diferença vinha de quatro cascas comuns:

1. **Navegação da área logada.**
   - Mobile: barra global "Avenly + negócio" que o protótipo não tem. As telas empurradas mantinham a barra de abas, em vez de barra própria e CTA no rodapé.
   - Tablet: rail lateral de ícones no lugar da barra inferior de abas.
   - Desktop: sidebar com outra estrutura, outros ícones e outro rodapé.
2. **Lista e detalhe no tablet landscape e no desktop.** Clientes, Serviços, Configurações e os fluxos da Agenda abriam como páginas soltas de largura cheia, com "‹ Voltar", eyebrow, H1 grande e subtítulo. O protótipo mostra a lista à esquerda e o detalhe à direita.
3. **Onboarding.** Divergiam:
   - o cabeçalho de progresso;
   - o stepper, com os estados invertidos;
   - o painel bege;
   - o CTA ancorado no rodapé;
   - a tipografia do título.
4. **Telas de acesso.** Divergiam:
   - o hero e o cartão no mobile;
   - o selo;
   - a tipografia;
   - os ícones nos campos;
   - o painel bege.

**Depois dos Goals 086 e 087**, com `main` em `a74d882`:

- O L1 (`/login`) ficou igual ao protótipo, com diff de 1,0% a 4,8%.
- L3, L4 e L5 melhoraram porque compartilham a casca: o diff caiu entre 7 e 37 pontos.
- A barra de abas do mobile e a sidebar do desktop seguem o protótipo (Goal087).
- Os demais quadros continuam DIVERGENTE.
- O H1 só pode ser comparado de fato com uma conta que tenha WhatsApp conectado. A conta de teste mostra o estado do H3.

| Módulo | Quadros divergentes |
| --- | --- |
| Acesso | L3, L4, L5, L8, L9 |
| Onboarding | 0, 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.I1, 3.1, 3.2, 4.1, 4.2 (o app junta consentimento e conexão), 4.6 |
| Início | H3 (Goal085); o H1 depende de uma conta com WhatsApp |
| Agenda | A1 (no desktop, o app abre em Semana), A5, A6, A8, A9, A10, A11, S1 (editar serviço) |
| Clientes | CL1, CL4, CL5, CL6, CL7 |
| Serviços | S1, S3, S4 |
| Conversas e notificações | C1, C5, NT1 |
| Configurações | M1, N1, AG1, AG3 (sem tela própria no app), IA1, W1, I1, I2, R1, C1 |

**Fora da varredura**, porque a conta de teste não alcança o estado ou porque não há rota: L2, L6, L7, 2.7, 2.I2–2.I10, 4.3–4.5, 4.7–4.10, H2, H4–H7, A2–A4, A7, A12, S1b, CL2, CL3, CL8–CL10, S2, S5–S9, C2–C4, K1–K6, NT2, NT3, N2, N3, AG2, W2, W3, R2 e C2.

**Divergências já declaradas em decisão.** Não contam como defeito enquanto não houver decisão nova:

- a saudação neutra no login (Goal068);
- "Avisar a cliente pelo WhatsApp" fora de Novo agendamento (D-098, item 5);
- a recuperação de senha por link, não por código (L5);
- a visão padrão da Agenda no tablet e no desktop: o `AGENTS.md` do frontend permite Semana, e o A1 e o AG1 do protótipo mostram Dia. Quem decide é o Goal da Agenda.

As correções estão planejadas como Goals 088 a 097 no [MASTER_PLAN](MASTER_PLAN.md) (v113). Cada um declara `Quadros do protótipo:`.
