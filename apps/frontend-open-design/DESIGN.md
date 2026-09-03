# DESIGN.md — Atendly Design System

## 1. Direção

Atendly deve parecer um **SaaS premium e acessível para profissionais autônomos**: elegante, prático, calmo e confiável.

Sensação desejada:

- organizado;
- moderno;
- leve;
- profissional;
- humano sem ser infantil;
- sofisticado sem ser enterprise.

## 2. Princípio mobile-first

O design nasce no mobile.

Prioridade:

**Mobile → Tablet → Notebook → Desktop**

No mobile:

- foco em uma tarefa por vez;
- pouco ruído;
- uma coluna;
- ação principal evidente;
- detalhes sob demanda.

Telas maiores podem adicionar contexto, nunca preencher espaço por obrigação.

## 3. Simplicidade com acabamento

Não produzir telas compostas apenas por texto, input e botão sem tratamento visual.

Usar com propósito:

- iconografia;
- assets/ilustrações pontuais;
- microanimações;
- transições;
- skeletons;
- feedback de estado;
- empty states bem compostos;
- hierarquia tipográfica forte.

Evitar:

- excesso de cards;
- glassmorphism;
- neon;
- grandes gradientes brilhantes;
- sombras pesadas;
- mascotes/robôs;
- dashboards saturados;
- aparência de template admin genérico.

## 4. Conceito de marca — Conversation Flow

A identidade pode representar, de forma sutil:

`Mensagem → entendimento → disponibilidade → agendamento → resultado`

Recursos visuais possíveis:

- pontos conectados;
- linhas curtas;
- caminhos suaves;
- transições mensagem → agenda;
- indicadores de etapa;
- motion discreto.

## 5. Cores

Preservar a base visual atual salvo decisão de redesign específica.

### Marca

```text
brand.green.vivid      #00C98B
brand.green.accessible #007A57
brand.navy             #0B1727
brand.violet           #7C5CFC
brand.coral            #FF7A59
```

### Neutros

```text
neutral.0    #FFFFFF
neutral.25   #FCFDFC
neutral.50   #F7F9F8
neutral.100  #F0F3F2
neutral.200  #E2E8E5
neutral.300  #CBD5D1
neutral.400  #98A6A1
neutral.500  #6B7873
neutral.600  #4A5752
neutral.700  #35423D
neutral.800  #202D29
neutral.900  #111B18
```

### Semânticas

```text
success.50   #ECFDF6
success.600  #087A55
warning.50   #FFF8E7
warning.600  #9A6700
danger.50    #FFF1F0
danger.600   #C9362B
info.50      #F2F0FF
info.600     #6747E8
```

### Uso

- verde acessível: CTA primário e seleção;
- verde vívido: marca/detalhes não textuais;
- navy: headings e áreas de marca;
- violeta: IA/automação;
- coral: atenção humana sem caráter destrutivo;
- vermelho semântico: erro/destruição.

Não depender apenas de cor para estado.

## 6. Superfícies

```text
background.app      #F7F9F8
surface.primary     #FFFFFF
surface.secondary   #FCFDFC
surface.interactive #F0F3F2
border.default      #E2E8E5
border.strong       #CBD5D1
```

Preferir bordas, superfícies e espaço a sombras fortes.

## 7. Tipografia

Fonte principal: Inter.

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Escala de referência:

```text
Display       36/44 700
H1            30/38 700
H2            24/32 700
H3            20/28 650
Title         18/26 650
Body          16/24 400
Body strong   16/24 600
Small         14/20 400
Small strong  14/20 600
Caption       12/16 500
Metric        28/34 700
```

Mobile:

```text
H1 26/34
H2 22/30
H3 18/26
Body 16/24
```

Texto operacional não deve ser reduzido apenas para caber mais informação.

## 8. Espaçamento e densidade

- mobile: respiro suficiente e hierarquia clara;
- desktop: densidade média, sem cards gigantes;
- agrupar informação relacionada;
- evitar longas páginas de configuração quando puder dividir por objetivo.

## 9. Cantos e elevação

- arredondamento moderado;
- elevação mínima;
- consistência acima de criatividade local.

## 10. Navegação

### Mobile

Bottom nav:

`Início | Conversas | Agenda | Clientes | Mais`

### Desktop

Sidebar com texto + ícone, priorizando clareza.

## 11. Componentes

### Buttons

- um CTA primário por contexto;
- secundários menos proeminentes;
- ações destrutivas claramente diferenciadas.

### Inputs

- labels visíveis;
- erro próximo ao campo;
- altura adequada para toque;
- teclado mobile não cobre CTA/campo ativo.

### Cards

Somente quando houver agrupamento semântico real.

### Badges/status

Estados importantes usam texto/ícone, não apenas cor.

### Drawers / modals / screens

- mobile: formulários complexos em tela cheia;
- bottom sheet para ações curtas;
- desktop pode usar drawer quando preservar contexto ajudar.

## 12. Agenda

Tipos visuais principais:

- atendimento;
- compromisso pessoal;
- bloqueio.

Status pode usar badge/ícone sem colorir cada serviço de forma diferente.

Hold: `Em confirmação` com tratamento discreto.

## 13. Conversas

Mensagens de IA e humano não precisam de temas completamente distintos; autoria pode ser indicada discretamente.

Eventos internos usam componente próprio.

Não criar avatar robô para a IA.

## 14. Onboarding

Deve parecer guiado, leve e trabalhado.

Use:

- ícones por bloco;
- transições curtas;
- progressão clara;
- demonstração viva;
- animações de conexão/teste;
- tela de sucesso com acabamento.

## 15. Acessibilidade

- contraste AA como referência mínima;
- touch targets confortáveis;
- foco visível;
- estado não depende apenas de cor;
- texto e ícone quando ação não for óbvia;
- respeitar redução de movimento quando aplicável.

## 16. Tema

MVP: tema claro.

## 17. Copy visual

A interface é clara, direta, próxima e profissional.

Não antropomorfizar excessivamente a IA. Na plataforma, usar `IA`.
