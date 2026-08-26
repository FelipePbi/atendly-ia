(function () {
  const screen = document.body.dataset.agendaScreen;
  if (!screen) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-${name}"></use></svg>`;

  function sidebar(mode) {
    const sourceLabel = mode === 'external' ? 'Minha Agenda conectada' : 'Agenda Atendly oficial';
    return `
      <aside class="sidebar" aria-label="Navegação da aplicação" data-od-id="agenda-sidebar">
        <div class="sidebar-brand"><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a></div>
        <div class="business-context" aria-label="Negócio atual: Studio Aurora"><span class="avatar" aria-hidden="true">SA</span><span class="business-name"><strong>Studio Aurora</strong><span>${sourceLabel}</span></span></div>
        <div class="wa-status status-line"><span class="status-dot" aria-hidden="true"></span><span>WhatsApp conectado</span></div>
        <nav class="nav" aria-label="Navegação principal">
          <a class="nav-item" href="dashboard-atendly.html">${icon('home')}<span>Início</span></a>
          <a class="nav-item" href="conversations.html">${icon('chat')}<span>Conversas</span></a>
          <a class="nav-item is-active" href="${mode === 'external' ? 'agenda-external.html' : 'agenda-atendly.html'}" aria-current="page">${icon('calendar')}<span>Agenda</span></a>
          <a class="nav-item" href="${mode === 'external' ? 'customers-external.html' : 'customers.html'}">${icon('users')}<span>Clientes</span></a>
          <a class="nav-item" href="${mode === 'external' ? 'services-external.html' : 'services.html'}">${icon('briefcase')}<span>Serviços</span></a>
        </nav>
        <div class="sidebar-bottom">
          <nav class="nav" aria-label="Configurações"><a class="nav-item" href="${mode === 'external' ? 'settings-external.html' : 'settings.html'}">${icon('settings')}<span>Configurações</span></a></nav>
          <div class="dropdown">
            <button class="account-button" type="button" data-toggle="agenda-account-menu" aria-controls="agenda-account-menu" aria-expanded="false"><span class="avatar" aria-hidden="true">FM</span><span class="business-name"><strong>Felipe Martins</strong><span>Conta principal</span></span>${icon('more')}</button>
            <div id="agenda-account-menu" class="menu hidden" data-panel aria-hidden="true"><a class="menu-item" href="settings-account.html">Minha conta</a><span class="menu-item" aria-disabled="true">Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">Sair</a></div>
          </div>
        </div>
      </aside>`;
  }

  function mobileHeader() {
    return `<header class="agenda-mobile-header" data-od-id="agenda-mobile-header"><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a><span class="badge">Studio Aurora</span></header>`;
  }

  function bottomNavigation(mode) {
    return `
      <nav class="agenda-bottom-nav" aria-label="Navegação principal" data-od-id="agenda-mobile-navigation">
        <a class="bottom-nav-item" href="dashboard-atendly.html">${icon('home')}<span>Início</span></a>
        <a class="bottom-nav-item" href="conversations.html">${icon('chat')}<span>Conversas</span></a>
        <a class="bottom-nav-item is-active" href="${mode === 'external' ? 'agenda-external.html' : 'agenda-atendly.html'}" aria-current="page">${icon('calendar')}<span>Agenda</span></a>
        <button class="bottom-nav-item" type="button" data-open="agenda-more-sheet" aria-controls="agenda-more-sheet" aria-haspopup="dialog" aria-expanded="false">${icon('more')}<span>Mais</span></button>
      </nav>`;
  }

  function moreSheet(mode) {
    return `
      <div id="agenda-more-sheet" class="overlay bottom-sheet-wrap hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="agenda-more-title">
        <section class="bottom-sheet"><div class="sheet-handle"></div><div class="modal-header"><div><p class="eyebrow">Navegação</p><h2 id="agenda-more-title">Mais</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><div class="list"><a class="menu-item" href="${mode === 'external' ? 'customers-external.html' : 'customers.html'}">${icon('users')}Clientes</a><a class="menu-item" href="${mode === 'external' ? 'services-external.html' : 'services.html'}">${icon('briefcase')}Serviços</a><a class="menu-item" href="${mode === 'external' ? 'settings-external.html' : 'settings.html'}">${icon('settings')}Configurações</a><span class="menu-item" aria-disabled="true">${icon('help')}Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">${icon('logout')}Sair</a></div></section>
      </div>`;
  }

  function appShell(content, mode = 'atendly') {
    const root = document.getElementById('agenda-root');
    if (!root) return;
    root.innerHTML = `<a class="skip-link" href="#main-content">Ir para o conteúdo</a><div class="agenda-shell app-frame" data-od-id="agenda-${screen}">${sidebar(mode)}<main class="agenda-main" id="main-content">${mobileHeader()}${content}</main>${bottomNavigation(mode)}</div>${moreSheet(mode)}`;
  }

  function sourceStrip(mode) {
    if (mode === 'external') {
      return `<section class="agenda-source-strip" data-od-id="calendar-source"><div class="agenda-source-copy"><span class="agenda-source-icon">${icon('link')}</span><div><strong>Minha Agenda é a fonte oficial</strong><span>A Atendly exibe os dados disponíveis da conexão.</span></div></div><span class="badge">Última atualização · —</span></section>`;
    }
    return `<section class="agenda-source-strip" data-od-id="calendar-source"><div class="agenda-source-copy"><span class="agenda-source-icon">${icon('calendar')}</span><div><strong>Agenda Atendly é a fonte oficial</strong><span>Disponibilidade e alterações são controladas aqui.</span></div></div><span class="badge badge-success"><span class="badge-dot"></span>Operacional</span></section>`;
  }

  const dayButtons = `
    <div class="agenda-date-strip" aria-label="Selecionar dia">
      <button class="agenda-date-button" type="button" data-day="24"><span>SEG</span><strong>24</strong></button>
      <button class="agenda-date-button is-selected" type="button" data-day="25" aria-pressed="true"><span>TER</span><strong>25</strong></button>
      <button class="agenda-date-button" type="button" data-day="26"><span>QUA</span><strong>26</strong></button>
      <button class="agenda-date-button" type="button" data-day="27"><span>QUI</span><strong>27</strong></button>
      <button class="agenda-date-button" type="button" data-day="28"><span>SEX</span><strong>28</strong></button>
      <button class="agenda-date-button" type="button" data-day="29"><span>SÁB</span><strong>29</strong></button>
      <button class="agenda-date-button" type="button" data-day="30"><span>DOM</span><strong>30</strong></button>
    </div>`;

  function appointmentItem(time, name, service, badges, values, id) {
    return `<a class="agenda-item" href="appointment-detail.html" data-filter-item data-filter-values="${values}" data-od-id="appointment-${id}"><time class="agenda-item-time">${time}</time><span class="agenda-item-copy"><strong>${name}</strong><span>${service}</span><span class="agenda-item-signals">${badges}</span></span></a>`;
  }

  function appointmentItemsMarkup(prefix) {
    return `
    ${appointmentItem('09:00', 'Cliente de demonstração', 'Serviço de demonstração · 60 min', '<span class="badge badge-ai">Criado pela IA</span><span class="badge badge-success">Confirmado</span>', 'confirmed ai service-demo', `${prefix}-ai`)}
    ${appointmentItem('11:00', 'Contato de demonstração', 'Serviço de demonstração · 45 min', '<span class="badge">Criado manualmente</span><span class="badge badge-success">Confirmado</span>', 'confirmed manual service-demo', `${prefix}-manual`)}
    <div class="agenda-item is-blocked" data-filter-item data-filter-values="blocked" data-od-id="blocked-time-${prefix}"><time class="agenda-item-time">13:00</time><span class="agenda-item-copy"><strong>Horário bloqueado</strong><span>Intervalo pessoal · exemplo</span><span class="agenda-item-signals"><span class="badge">Bloqueio</span></span></span></div>
    ${appointmentItem('14:30', 'Cliente de demonstração', 'Serviço de demonstração · 60 min', '<span class="badge badge-ai">Criado pela IA</span><span class="badge badge-success">Confirmado</span>', 'confirmed ai service-demo', `${prefix}-second-ai`)}`;
  }

  function externalAppointmentItemsMarkup(prefix) {
    return `
    <div class="agenda-item is-readonly" data-filter-item data-filter-values="confirmed ai service-demo" data-od-id="external-appointment-${prefix}-ai"><time class="agenda-item-time">09:00</time><span class="agenda-item-copy"><strong>Cliente de demonstração</strong><span>Serviço de demonstração · 60 min</span><span class="agenda-item-signals"><span class="badge badge-ai">Criado pela IA</span><span class="badge">Minha Agenda</span></span></span></div>
    <div class="agenda-item is-readonly" data-filter-item data-filter-values="confirmed manual service-demo" data-od-id="external-appointment-${prefix}-manual"><time class="agenda-item-time">11:00</time><span class="agenda-item-copy"><strong>Contato de demonstração</strong><span>Serviço de demonstração · 45 min</span><span class="agenda-item-signals"><span class="badge">Origem externa</span><span class="badge">Minha Agenda</span></span></span></div>`;
  }

  function dayPanel(mode = 'atendly') {
    const items = mode === 'external' ? externalAppointmentItemsMarkup('day') : appointmentItemsMarkup('day');
    return `<section id="agenda-panel-day" class="agenda-calendar agenda-day-panel agenda-panel hidden" role="tabpanel" aria-labelledby="agenda-tab-day" data-agenda-panel="day">${dayButtons}<div class="agenda-day-summary"><span data-selected-day-label>Terça-feira, 25 de agosto</span><strong>${mode === 'external' ? 'Dados da conexão' : '3 agendamentos · 1 bloqueio'}</strong></div><div class="agenda-day-list">${items}<p class="agenda-no-results hidden" data-filter-empty>Nenhum item corresponde a este filtro.</p></div></section>`;
  }

  function listPanel(mode = 'atendly') {
    const items = mode === 'external' ? externalAppointmentItemsMarkup('list') : appointmentItemsMarkup('list');
    const tomorrow = mode === 'external' ? externalAppointmentItemsMarkup('tomorrow') : appointmentItem('10:30', 'Cliente de demonstração', 'Serviço de demonstração · 60 min', '<span class="badge">Criado manualmente</span><span class="badge badge-success">Confirmado</span>', 'confirmed manual service-demo', 'tomorrow');
    return `<section id="agenda-panel-list" class="agenda-calendar agenda-list-panel agenda-panel hidden" role="tabpanel" aria-labelledby="agenda-tab-list" data-agenda-panel="list"><div class="agenda-list-group"><h2 class="agenda-list-heading">Hoje · terça-feira, 25 de agosto</h2><div class="agenda-day-list">${items}</div></div><div class="agenda-list-group"><h2 class="agenda-list-heading">Amanhã · quarta-feira, 26 de agosto</h2><div class="agenda-day-list">${tomorrow}</div></div><p class="agenda-no-results hidden" data-filter-empty>Nenhum item corresponde a este filtro.</p></section>`;
  }

  function weekPanel() {
    const times = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    return `
      <section id="agenda-panel-week" class="agenda-calendar agenda-panel" role="tabpanel" aria-labelledby="agenda-tab-week" data-agenda-panel="week">
        <div class="agenda-week-scroll"><div class="week-board">
          <div class="week-header"><div class="week-header-spacer"></div><div class="week-day-head is-today"><span>TER</span><strong>25</strong></div><div class="week-day-head"><span>QUA</span><strong>26</strong></div><div class="week-day-head"><span>QUI</span><strong>27</strong></div><div class="week-day-head"><span>SEX</span><strong>28</strong></div><div class="week-day-head"><span>SÁB</span><strong>29</strong></div><div class="week-day-head"><span>DOM</span><strong>30</strong></div><div class="week-day-head"><span>SEG</span><strong>31</strong></div></div>
          <div class="week-body"><div class="week-time-axis">${times.map(time => `<div class="week-time">${time}</div>`).join('')}</div><div class="week-days">
            <div class="week-day" data-week-day="25"><a class="week-appointment is-ai" draggable="true" href="appointment-detail.html" style="--start:1;--span:1" data-draggable-appointment data-filter-item data-filter-values="confirmed ai service-demo" data-od-id="week-appointment-tuesday-ai"><span class="appointment-time">09:00</span><strong>Cliente de demonstração</strong><span>IA · Serviço de demonstração</span></a><div class="week-appointment is-blocked" style="--start:5;--span:1" data-filter-item data-filter-values="blocked" data-od-id="week-blocked-time"><span class="appointment-time">13:00</span><strong>Horário bloqueado</strong><span>Intervalo pessoal</span></div><div class="week-drop-target" style="--start:7" data-drop-time="15:00" aria-label="Mover para 15:00"></div></div>
            <div class="week-day"><a class="week-appointment" href="appointment-detail.html" style="--start:2.5;--span:1" data-filter-item data-filter-values="confirmed manual service-demo" data-od-id="week-appointment-wednesday-manual"><span class="appointment-time">10:30</span><strong>Cliente de demonstração</strong><span>Manual · Serviço de demonstração</span></a><div class="week-drop-target" style="--start:4" data-drop-time="12:00" aria-label="Mover para 12:00"></div></div>
            <div class="week-day"><a class="week-appointment is-ai" href="appointment-detail.html" style="--start:6.5;--span:1" data-filter-item data-filter-values="confirmed ai service-demo" data-od-id="week-appointment-thursday-ai"><span class="appointment-time">14:30</span><strong>Contato de demonstração</strong><span>IA · Serviço de demonstração</span></a></div>
            <div class="week-day"><a class="week-appointment" href="appointment-detail.html" style="--start:3;--span:1" data-filter-item data-filter-values="confirmed manual service-demo" data-od-id="week-appointment-friday-manual"><span class="appointment-time">11:00</span><strong>Cliente de demonstração</strong><span>Manual · Serviço de demonstração</span></a></div>
            <div class="week-day"></div><div class="week-day is-closed"></div><div class="week-day is-closed"></div>
          </div></div>
        </div></div>
      </section>`;
  }

  function agendaControls(mode, initial = 'week') {
    const weekTab = mode === 'atendly' ? `<button id="agenda-tab-week" class="tab agenda-tab-week ${initial === 'week' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${initial === 'week'}" aria-controls="agenda-panel-week" data-agenda-tab="week">Semana</button>` : '';
    return `<div class="agenda-command-bar" data-od-id="agenda-controls"><div class="agenda-date-tools"><button class="icon-btn" type="button" data-date-nav="prev" aria-label="Período anterior" data-od-id="previous-period">${icon('chevron-left')}</button><strong class="agenda-date-title" data-date-label>${initial === 'week' ? '25 a 31 de agosto de 2026' : 'Terça-feira, 25 de agosto'}</strong><button class="icon-btn" type="button" data-date-nav="next" aria-label="Próximo período" data-od-id="next-period">${icon('chevron-right')}</button><button class="btn btn-secondary" type="button" data-today data-od-id="go-today">Hoje</button></div><div class="agenda-view-tabs"><div class="tab-list" role="tablist" aria-label="Visualização da agenda"><button id="agenda-tab-day" class="tab ${initial === 'day' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${initial === 'day'}" aria-controls="agenda-panel-day" data-agenda-tab="day">Dia</button>${weekTab}<button id="agenda-tab-list" class="tab" type="button" role="tab" aria-selected="false" aria-controls="agenda-panel-list" data-agenda-tab="list">Lista</button></div></div></div>`;
  }

  function filters() {
    return `<div class="agenda-filters" aria-label="Filtros da agenda"><button class="agenda-filter is-active" type="button" aria-pressed="true" data-agenda-filter="all">Todos</button><button class="agenda-filter" type="button" aria-pressed="false" data-agenda-filter="confirmed">Confirmados</button><button class="agenda-filter" type="button" aria-pressed="false" data-agenda-filter="ai">Criados pela IA</button><button class="agenda-filter" type="button" aria-pressed="false" data-agenda-filter="service-demo">Serviço de demonstração</button></div>`;
  }

  function demoNote() {
    return `<div class="alert alert-info agenda-demo-note" role="note">${icon('info')}<div><p class="alert-title">Conteúdo demonstrativo</p><p class="alert-text">Os horários abaixo validam a interface e não representam compromissos reais.</p></div></div>`;
  }

  function nextAppointment(mode) {
    const content = `<span class="agenda-next-icon">${icon('clock')}</span><span class="agenda-next-copy"><span>Próximo atendimento</span><strong>Hoje · 09:00</strong><small>Cliente de demonstração · Serviço de demonstração</small></span><span class="badge ${mode === 'external' ? '' : 'badge-ai'}">${mode === 'external' ? 'Minha Agenda' : 'Criado pela IA'}</span>`;
    return mode === 'external'
      ? `<section class="agenda-next is-readonly" aria-label="Próximo atendimento recebido do Minha Agenda" data-od-id="next-appointment-external">${content}</section>`
      : `<a class="agenda-next" href="appointment-detail.html" aria-label="Abrir próximo atendimento de hoje às 09:00" data-od-id="next-appointment">${content}${icon('chevron-right')}</a>`;
  }

  function periodEmpty() {
    return `<section class="agenda-state-surface hidden" data-other-period><div class="empty-state"><div class="state-icon">${icon('calendar')}</div><h2>Nenhum item neste período</h2><p>Os exemplos deste protótipo estão concentrados na semana atual.</p><button class="btn btn-primary" type="button" data-return-today>Voltar para hoje</button></div></section>`;
  }

  function renderAgendaAtendly() {
    appShell(`<div class="agenda-page"><header class="agenda-page-header" data-od-id="agenda-header"><div><h1 data-od-id="agenda-title">Agenda</h1><p>Organize compromissos, disponibilidade e bloqueios em uma única visão.</p></div><div class="agenda-page-actions"><a class="btn btn-secondary" href="agenda-block-time.html" aria-label="Bloquear horário" data-od-id="block-time-action">${icon('lock')}<span>Bloquear horário</span></a><a class="btn btn-primary" href="appointment-new.html" aria-label="Novo agendamento" data-od-id="new-appointment-action">${icon('plus')}<span>Novo agendamento</span></a></div></header>${sourceStrip('atendly')}${demoNote()}${nextAppointment('atendly')}${agendaControls('atendly', 'week')}${filters()}<div data-current-period>${weekPanel()}${dayPanel()}${listPanel()}</div>${periodEmpty()}</div>
      <div id="move-appointment-dialog" class="overlay hidden" role="alertdialog" aria-modal="true" aria-hidden="true" aria-labelledby="move-title" aria-describedby="move-description"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Reagendar</p><h2 id="move-title">Mover para <span data-drop-label>15:00</span>?</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p id="move-description" class="small muted">O horário atual permanece reservado até a alteração ser concluída. Esta ação afeta apenas o exemplo.</p><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Manter horário atual</button><button class="btn btn-primary" type="button" data-confirm-drop>Confirmar novo horário</button></div></section></div>`, 'atendly');
  }

  function renderAgendaExternal(state) {
    const banner = state === 'error'
      ? `<div class="alert alert-error agenda-demo-note" role="alert">${icon('alert')}<div><p class="alert-title">Não foi possível consultar o Minha Agenda</p><p class="alert-text">Os horários podem estar desatualizados. Confirme no Minha Agenda antes de orientar um cliente.</p></div><button class="btn btn-secondary" type="button" data-retry-external>Tentar novamente</button></div>`
      : state === 'conflict'
        ? `<div class="banner banner-warning agenda-demo-note" role="alert">${icon('alert')}<div><p class="banner-title">Há um conflito de sincronização</p><p class="banner-text">Dois compromissos externos ocupam o mesmo horário. Revise a fonte oficial antes de fazer alterações.</p></div><button class="btn btn-secondary" type="button" data-external-action>Revisar no Minha Agenda</button></div>`
        : demoNote();
    const title = state === 'error' ? 'Agenda indisponível' : state === 'conflict' ? 'Agenda com conflito' : 'Agenda';
    const main = state === 'error' ? `<div class="agenda-readonly-list" aria-label="Últimos dados disponíveis"><div class="agenda-day-summary"><span>Últimos dados recebidos</span><strong>Atualização não informada</strong></div><div class="agenda-day-list">${externalAppointmentItemsMarkup('error')}</div><div class="agenda-readonly-footer"><span>Somente leitura enquanto a conexão estiver indisponível.</span><button class="btn btn-secondary" type="button" data-external-action>Editar no Minha Agenda</button></div></div>` : `<div data-current-period>${dayPanel('external')}${listPanel('external')}</div>${periodEmpty()}`;
    appShell(`<div class="agenda-page"><header class="agenda-page-header" data-od-id="external-agenda-header"><div><h1 data-od-id="external-agenda-title">${title}</h1><p>Consulte os compromissos recebidos da sua fonte oficial.</p></div><div class="agenda-page-actions"><button class="btn btn-primary" type="button" data-external-action aria-label="Editar no Minha Agenda" data-od-id="external-edit-action">${icon('external')}<span>Editar no Minha Agenda</span></button></div></header>${sourceStrip('external')}${banner}${state === 'error' ? '' : nextAppointment('external')}${state === 'error' ? '' : agendaControls('external', 'day')}${state === 'error' ? '' : filters()}${main}<p class="sr-only" role="status" aria-live="polite" data-external-status></p></div>`, 'external');
  }

  function flowHeader(title, description, backHref, badge = 'Agenda Atendly') {
    return `<header class="agenda-flow-header" data-od-id="agenda-flow-header"><a class="icon-btn" href="${backHref}" aria-label="Voltar" data-od-id="agenda-flow-back">${icon('chevron-left')}</a><div><h1 data-od-id="agenda-flow-title">${title}</h1><p>${description}</p></div><span class="badge badge-success">${badge}</span></header>`;
  }

  function summaryRow(label, value, valueId = '') {
    return `<div class="agenda-summary-row"><span>${label}</span><strong${valueId ? ` data-summary-${valueId}` : ''}>${value}</strong></div>`;
  }

  function renderNewAppointment() {
    appShell(`<div class="agenda-flow-page">${flowHeader('Novo agendamento', 'Crie um compromisso manual na fonte oficial.', 'agenda-atendly.html')}<div class="alert alert-info agenda-demo-note" role="note">${icon('shield')}<div><p class="alert-title">Confirmação segura</p><p class="alert-text">O horário será validado novamente antes do registro na Agenda Atendly.</p></div></div><div class="agenda-flow-layout" data-flow-content><form class="agenda-form-card" data-new-appointment><h2>Dados do agendamento</h2><div class="agenda-form-grid"><label class="field is-wide"><span class="label">Cliente</span><select class="input select" name="client" required data-client-select><option value="">Selecione um cliente</option><option value="demo">Cliente de demonstração</option><option value="new">Cadastrar novo cliente</option></select></label><div class="agenda-form-grid is-wide hidden" data-new-client-fields><label class="field"><span class="label">Nome</span><input class="input" name="newName" autocomplete="name"></label><label class="field"><span class="label">Telefone</span><input class="input" name="newPhone" type="tel" autocomplete="tel" placeholder="(00) 00000-0000"></label></div><label class="field is-wide"><span class="label">Serviço</span><select class="input select" name="service" required data-service-select><option value="">Selecione um serviço</option><option value="demo">Serviço de demonstração · 60 min</option></select><span class="field-help">Somente serviços ativos podem gerar novos agendamentos.</span></label><label class="field"><span class="label">Data</span><input class="input" name="date" type="date" required data-appointment-date></label><fieldset class="field is-wide" data-time-field disabled><legend class="label">Horário disponível</legend><div class="agenda-time-options"><label class="agenda-time-option"><input type="radio" name="time" value="09:00" required disabled><span>09:00</span></label><label class="agenda-time-option"><input type="radio" name="time" value="10:30" disabled><span>10:30</span></label><label class="agenda-time-option"><input type="radio" name="time" value="14:00" disabled><span>14:00</span></label></div><span class="field-help">Escolha o serviço para consultar os horários do exemplo.</span></fieldset><label class="field is-wide"><span class="label">Observação <span class="muted">(opcional)</span></span><textarea class="input" name="notes" maxlength="240"></textarea></label></div><div class="agenda-form-status hidden" role="alert" data-form-error></div><div class="agenda-form-footer"><a class="btn btn-secondary" href="agenda-atendly.html">Cancelar</a><button class="btn btn-primary" type="submit" data-submit-new>Criar agendamento</button></div></form><aside class="agenda-summary-card" aria-label="Resumo antes de confirmar"><h2>Resumo</h2><div class="agenda-summary-list">${summaryRow('Cliente', 'Escolha um cliente', 'client')}${summaryRow('Serviço', 'Escolha um serviço', 'service')}${summaryRow('Data', 'Escolha uma data', 'date')}${summaryRow('Horário', 'Escolha um horário', 'time')}${summaryRow('Valor registrado', 'Não informado')}</div><p class="field-help">Este resumo será revisado antes da confirmação.</p></aside></div><div class="agenda-success-panel hidden" data-flow-success role="status"><div class="state-icon">${icon('check')}</div><h2>Agendamento registrado no exemplo</h2><p>A disponibilidade foi validada novamente antes da confirmação na Agenda Atendly.</p><a class="btn btn-primary" href="appointment-detail.html">Ver agendamento</a></div></div>`, 'atendly');
  }

  function renderAppointmentDetail() {
    appShell(`<div class="agenda-flow-page">${flowHeader('Detalhe do agendamento', 'Informações registradas na fonte oficial.', 'agenda-atendly.html')} ${demoNote()}<section class="agenda-detail-hero"><div><span class="badge badge-success"><span class="badge-dot"></span>Confirmado · exemplo</span><h2 class="agenda-detail-date">Quarta-feira, 26 de agosto · 10:30</h2><p class="agenda-detail-service">Serviço de demonstração · 60 min</p></div><div class="agenda-detail-actions"><a class="btn btn-primary" href="appointment-reschedule.html">Reagendar</a><a class="btn btn-secondary" href="conversation-ai-active.html">Abrir conversa</a></div></section><div class="agenda-detail-grid"><section class="agenda-detail-section"><h2>Resumo</h2><div class="agenda-summary-list">${summaryRow('Cliente', 'Cliente de demonstração')}${summaryRow('Telefone', '(11) 99999-1234')}${summaryRow('Serviço', 'Serviço de demonstração')}${summaryRow('Duração', '60 min')}${summaryRow('Preço registrado', 'Não informado')}${summaryRow('Origem', 'Criado pela IA · exemplo')}${summaryRow('Observações', 'Nenhuma observação')}</div><div class="agenda-danger-zone"><p>O cancelamento preserva o histórico e só libera o horário após conclusão.</p><a class="btn btn-danger" href="appointment-cancel.html">Cancelar agendamento</a></div></section><aside class="agenda-detail-section"><h2>Histórico</h2><div class="agenda-history"><div class="agenda-history-item"><strong>Agendamento confirmado</strong><span>Registro concluído na Agenda Atendly · exemplo</span></div><div class="agenda-history-item"><strong>Criado pela IA</strong><span>Origem identificada para auditoria · exemplo</span></div></div></aside></div></div>`, 'atendly');
  }

  function renderReschedule() {
    appShell(`<div class="agenda-flow-page">${flowHeader('Reagendar atendimento', 'Escolha um novo horário sem liberar o atual antes da conclusão.', 'appointment-detail.html')}<div class="alert alert-info agenda-demo-note" role="status">${icon('shield')}<div><p class="alert-title">O horário atual permanece reservado</p><p class="alert-text">Se a alteração falhar, o agendamento original continua válido.</p></div></div><div class="agenda-flow-layout" data-flow-content><form class="agenda-form-card" data-reschedule-form><h2>Novo horário</h2><div class="agenda-current-slot"><span>Horário atual</span><strong>Quarta-feira, 26 de agosto · 10:30–11:30</strong></div><div class="agenda-form-grid"><label class="field is-wide"><span class="label">Nova data</span><input class="input" type="date" name="date" required data-reschedule-date></label><fieldset class="field is-wide"><legend class="label">Novo horário disponível</legend><div class="agenda-time-options"><label class="agenda-time-option"><input type="radio" name="time" value="09:00" required><span>09:00</span></label><label class="agenda-time-option"><input type="radio" name="time" value="13:30"><span>13:30</span></label><label class="agenda-time-option"><input type="radio" name="time" value="15:00"><span>15:00</span></label></div></fieldset></div><p class="field-help">Este protótipo não presume envio automático de mensagem ao cliente.</p><div class="agenda-form-status hidden" role="alert" data-form-error></div><div class="agenda-form-footer"><a class="btn btn-secondary" href="appointment-detail.html">Manter horário atual</a><button class="btn btn-primary" type="button" data-open-reschedule>Revisar alteração</button></div></form><aside class="agenda-summary-card"><h2>O que muda</h2><div class="agenda-summary-list">${summaryRow('Cliente', 'Cliente de demonstração')}${summaryRow('Serviço', 'Serviço de demonstração')}${summaryRow('Horário atual', '26 ago · 10:30')}${summaryRow('Novo horário', 'Selecione data e horário', 'reschedule')}</div></aside></div><div class="agenda-success-panel hidden" data-flow-success role="status"><div class="state-icon">${icon('check')}</div><h2>Horário alterado no exemplo</h2><p>O novo horário foi confirmado antes da liberação do anterior.</p><a class="btn btn-primary" href="appointment-detail.html">Voltar ao agendamento</a></div></div><div id="reschedule-confirm-dialog" class="overlay hidden" role="alertdialog" aria-modal="true" aria-hidden="true" aria-labelledby="reschedule-confirm-title" aria-describedby="reschedule-confirm-description"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Revisar alteração</p><h2 id="reschedule-confirm-title">Confirmar novo horário?</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p id="reschedule-confirm-description" class="small muted">O horário anterior só será liberado depois que o novo registro for concluído.</p><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Voltar e revisar</button><button class="btn btn-primary" type="button" data-confirm-reschedule>Reagendar atendimento</button></div></section></div>`, 'atendly');
  }

  function renderCancel() {
    appShell(`<div class="agenda-flow-page">${flowHeader('Cancelar agendamento', 'Revise o compromisso antes de cancelar.', 'appointment-detail.html')}<div class="agenda-flow-layout" data-flow-content><form class="agenda-form-card" data-cancel-form><h2>Confirmação</h2><div class="agenda-current-slot"><span>Agendamento</span><strong>Quarta-feira, 26 de agosto · 10:30</strong><span>Cliente de demonstração · Serviço de demonstração</span></div><label class="field"><span class="label">Motivo <span class="muted">(opcional)</span></span><select class="input select" name="reason"><option value="">Não informar</option><option>Pedido do cliente</option><option>Imprevisto do negócio</option><option>Outro motivo</option></select></label><div class="alert alert-info" role="note">${icon('info')}<div><p class="alert-title">Notificação ao cliente</p><p class="alert-text">Este protótipo não presume envio automático. Confirme pelo canal habitual quando necessário.</p></div></div><div class="agenda-form-footer"><a class="btn btn-secondary" href="appointment-detail.html">Manter agendamento</a><button class="btn btn-danger" type="button" data-open="cancel-confirm-dialog" aria-controls="cancel-confirm-dialog" aria-haspopup="dialog">Cancelar agendamento</button></div></form><aside class="agenda-summary-card"><h2>Após o cancelamento</h2><div class="agenda-summary-list">${summaryRow('Status', 'Cancelado')}${summaryRow('Disponibilidade', 'Liberada após sucesso')}${summaryRow('Histórico', 'Preservado')}${summaryRow('Cliente', 'Sem notificação presumida')}</div></aside></div><div class="agenda-success-panel hidden" data-flow-success role="status"><div class="state-icon">${icon('check')}</div><h2>Agendamento cancelado no exemplo</h2><p>O histórico foi preservado e o horário foi liberado somente após a conclusão.</p><a class="btn btn-primary" href="agenda-atendly.html">Voltar para a agenda</a></div></div><div id="cancel-confirm-dialog" class="overlay hidden" role="alertdialog" aria-modal="true" aria-hidden="true" aria-labelledby="cancel-confirm-title" aria-describedby="cancel-confirm-description"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Ação destrutiva</p><h2 id="cancel-confirm-title">Cancelar este agendamento?</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p id="cancel-confirm-description" class="small muted">O compromisso ficará cancelado no histórico e deixará de ocupar o horário somente após a operação ser concluída.</p><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Manter agendamento</button><button class="btn btn-danger" type="button" data-confirm-cancel>Cancelar agendamento</button></div></section></div>`, 'atendly');
  }

  function renderBlockTime() {
    appShell(`<div class="agenda-flow-page">
      ${flowHeader('Bloquear horário', 'Reserve um período indisponível na Agenda Atendly.', 'agenda-atendly.html')}
      <div class="alert alert-info agenda-demo-note" role="note" data-od-id="block-conflict-note">${icon('info')}<div><p class="alert-title">Conflitos são verificados antes de salvar</p><p class="alert-text">Um bloqueio nunca será aplicado silenciosamente sobre um agendamento existente.</p></div></div>
      <div class="agenda-flow-layout" data-flow-content>
        <form class="agenda-form-card agenda-block-form" data-block-form data-od-id="block-time-form">
          <h2 data-od-id="block-time-form-title">Defina o período</h2>
          <p class="agenda-form-intro">Escolha uma data e um intervalo contínuo para impedir novos agendamentos.</p>
          <div class="agenda-form-grid">
            <label class="field is-wide"><span class="label">Data do bloqueio</span><input class="input" type="date" name="date" required data-block-date data-od-id="block-date"></label>
            <label class="field"><span class="label">Início</span><input class="input" type="time" name="start" value="13:00" required aria-describedby="block-form-error" data-od-id="block-start-time"></label>
            <label class="field"><span class="label">Término</span><input class="input" type="time" name="end" value="14:00" required aria-describedby="block-form-error" data-od-id="block-end-time"></label>
            <label class="field is-wide"><span class="label">Motivo <span class="muted">(opcional)</span></span><input class="input" name="reason" maxlength="80" placeholder="Ex.: intervalo pessoal" data-block-reason data-od-id="block-reason"></label>
          </div>
          <div id="block-form-error" class="agenda-form-status hidden" role="alert" aria-live="assertive" data-form-error></div>
          <div class="agenda-form-footer"><a class="btn btn-secondary" href="agenda-atendly.html">Cancelar</a><button class="btn btn-primary" type="submit" data-submit-block data-od-id="save-block-time">Bloquear horário</button></div>
        </form>
        <aside class="agenda-summary-card agenda-block-summary" aria-label="Resumo do bloqueio" data-od-id="block-time-summary">
          <h2>Antes de salvar</h2>
          <div class="agenda-summary-list">${summaryRow('Data', '26 de agosto', 'block-date')}${summaryRow('Período', '13:00–14:00', 'block-time')}${summaryRow('Motivo', 'Não informado', 'block-reason')}${summaryRow('Fonte oficial', 'Agenda Atendly')}</div>
          <p class="agenda-summary-note">O bloqueio vale somente para este período e não altera compromissos existentes.</p>
        </aside>
      </div>
      <div class="agenda-success-panel hidden" data-flow-success role="status" data-od-id="block-time-success"><div class="state-icon">${icon('check')}</div><h2>Horário bloqueado no exemplo</h2><p>O período foi verificado e não contém agendamentos conflitantes.</p><a class="btn btn-primary" href="agenda-atendly.html">Voltar para a agenda</a></div>
    </div>`, 'atendly');
  }

  function renderEmpty() {
    appShell(`<div class="agenda-page"><header class="agenda-page-header"><div><h1>Agenda</h1><p>Consulte compromissos e disponibilidade.</p></div></header>${sourceStrip('atendly')}<section class="agenda-state-surface"><div class="empty-state"><div class="state-icon">${icon('calendar')}</div><h2>Ainda não há agendamentos</h2><p>Agendamentos criados manualmente ou pela Atendly aparecerão aqui.</p><div class="agenda-state-actions"><a class="btn btn-primary" href="appointment-new.html">Criar agendamento</a><a class="btn btn-secondary" href="agenda-block-time.html">Bloquear horário</a></div></div></section></div>`, 'atendly');
  }

  function renderLoading() {
    appShell(`<div class="agenda-page"><header class="agenda-page-header"><div><h1>Agenda</h1><p>Carregando compromissos e disponibilidade.</p></div></header>${sourceStrip('atendly')}<section class="agenda-loading-shell" aria-busy="true" aria-label="Carregando agenda"><div class="agenda-loading-header"><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span></div><div class="agenda-loading-grid"><div class="agenda-loading-column"><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span></div><div class="agenda-loading-column"><span class="skeleton agenda-loading-block"></span><span class="skeleton agenda-loading-block"></span></div><div class="agenda-loading-column"><span class="skeleton agenda-loading-block"></span></div><div class="agenda-loading-column"><span class="skeleton agenda-loading-block"></span><span class="skeleton agenda-loading-block"></span></div><div class="agenda-loading-column"><span class="skeleton agenda-loading-block"></span></div></div></section></div>`, 'atendly');
  }

  const renderers = {
    'atendly': renderAgendaAtendly,
    'external': () => renderAgendaExternal('default'),
    'external-error': () => renderAgendaExternal('error'),
    'external-conflict': () => renderAgendaExternal('conflict'),
    'empty': renderEmpty,
    'loading': renderLoading,
    'new': renderNewAppointment,
    'detail': renderAppointmentDetail,
    'reschedule': renderReschedule,
    'cancel': renderCancel,
    'block': renderBlockTime
  };

  (renderers[screen] || renderAgendaAtendly)();
  $('[data-flow-success]')?.setAttribute('aria-hidden', 'true');

  function showToast(message) {
    if (window.AtendlyUI?.showToast) window.AtendlyUI.showToast(message);
    else {
      const status = $('[data-external-status]');
      if (status) status.textContent = message;
    }
  }

  function setAgendaView(view) {
    $$('[data-agenda-tab]').forEach(tab => {
      const selected = tab.dataset.agendaTab === view;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    $$('[data-agenda-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.agendaPanel !== view));
  }

  $$('[data-agenda-tab]').forEach(tab => tab.addEventListener('click', () => setAgendaView(tab.dataset.agendaTab)));
  const selectedAgendaTab = $('[data-agenda-tab].is-active');
  if (selectedAgendaTab) setAgendaView(selectedAgendaTab.dataset.agendaTab);
  if (window.matchMedia('(max-width: 1099px)').matches && $('[data-agenda-tab="week"]')) setAgendaView('day');

  $$('.agenda-date-button').forEach(button => button.addEventListener('click', () => {
    $$('.agenda-date-button').forEach(item => {
      const selected = item === button;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    const label = $('[data-selected-day-label]');
    if (label) label.textContent = button.dataset.day === '25' ? 'Terça-feira, 25 de agosto' : `${button.textContent.trim()} de agosto · exemplo`;
  }));

  let periodOffset = 0;
  function paintPeriod() {
    const current = $('[data-current-period]');
    const other = $('[data-other-period]');
    if (current) current.classList.toggle('hidden', periodOffset !== 0);
    if (other) other.classList.toggle('hidden', periodOffset === 0);
    const label = $('[data-date-label]');
    if (label) label.textContent = periodOffset === 0 ? ($('[data-agenda-tab="week"]') ? '25 a 31 de agosto de 2026' : 'Terça-feira, 25 de agosto') : periodOffset < 0 ? 'Período anterior · exemplo' : 'Próximo período · exemplo';
  }
  $$('[data-date-nav]').forEach(button => button.addEventListener('click', () => { periodOffset += button.dataset.dateNav === 'prev' ? -1 : 1; paintPeriod(); }));
  $$('[data-today], [data-return-today]').forEach(button => button.addEventListener('click', () => { periodOffset = 0; paintPeriod(); }));

  $$('[data-agenda-filter]').forEach(button => button.addEventListener('click', () => {
    $$('[data-agenda-filter]').forEach(item => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    const filter = button.dataset.agendaFilter;
    $$('[data-filter-item]').forEach(item => item.classList.toggle('hidden', filter !== 'all' && !(item.dataset.filterValues || '').split(' ').includes(filter)));
    $$('[data-agenda-panel]').forEach(panel => {
      const empty = $('[data-filter-empty]', panel);
      if (empty) empty.classList.toggle('hidden', $$('[data-filter-item]:not(.hidden)', panel).length !== 0);
    });
  }));

  const dragItem = $('[data-draggable-appointment]');
  if (dragItem) {
    dragItem.addEventListener('dragstart', event => { event.dataTransfer.effectAllowed = 'move'; $$('.week-drop-target').forEach(target => target.classList.add('is-ready')); });
    dragItem.addEventListener('dragend', () => $$('.week-drop-target').forEach(target => target.classList.remove('is-ready')));
    $$('.week-drop-target').forEach(target => {
      target.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
      target.addEventListener('drop', event => {
        event.preventDefault();
        const dialog = $('#move-appointment-dialog');
        const label = $('[data-drop-label]');
        if (label) label.textContent = target.dataset.dropTime;
        if (dialog) { dialog.classList.remove('hidden'); dialog.setAttribute('aria-hidden', 'false'); document.body.classList.add('has-overlay'); $('[data-confirm-drop]', dialog)?.focus(); }
      });
    });
    $('[data-confirm-drop]')?.addEventListener('click', event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Validando';
      window.setTimeout(() => {
        const dialog = $('#move-appointment-dialog');
        dialog?.classList.add('hidden');
        dialog?.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('has-overlay');
        button.disabled = false;
        button.textContent = 'Confirmar novo horário';
        showToast('Horário atualizado no exemplo após validação.');
      }, 700);
    });
  }

  const clientSelect = $('[data-client-select]');
  clientSelect?.addEventListener('change', () => {
    $('[data-new-client-fields]')?.classList.toggle('hidden', clientSelect.value !== 'new');
    $$('[data-new-client-fields] input').forEach(input => input.required = clientSelect.value === 'new');
    const summary = $('[data-summary-client]');
    if (summary) summary.textContent = clientSelect.value === 'demo' ? 'Cliente de demonstração' : clientSelect.value === 'new' ? 'Novo cliente' : 'Escolha um cliente';
  });

  const serviceSelect = $('[data-service-select]');
  serviceSelect?.addEventListener('change', () => {
    const enabled = serviceSelect.value === 'demo';
    const timeField = $('[data-time-field]');
    if (timeField) timeField.disabled = !enabled;
    $$('[name="time"]').forEach(input => input.disabled = !enabled);
    const summary = $('[data-summary-service]');
    if (summary) summary.textContent = enabled ? 'Serviço de demonstração · 60 min' : 'Escolha um serviço';
  });

  function isoDateOffset(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }
  $$('[data-appointment-date], [data-reschedule-date], [data-block-date]').forEach((input, index) => {
    input.min = isoDateOffset(0);
    input.value = isoDateOffset(index === 1 ? 2 : 1);
    input.dispatchEvent(new Event('change'));
  });

  $('[data-appointment-date]')?.addEventListener('change', event => { const summary = $('[data-summary-date]'); if (summary) summary.textContent = event.target.value ? new Date(`${event.target.value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : 'Escolha uma data'; });
  $('[data-appointment-date]')?.dispatchEvent(new Event('change'));
  $('[data-block-date]')?.addEventListener('change', event => { const summary = $('[data-summary-block-date]'); if (summary) summary.textContent = event.target.value ? new Date(`${event.target.value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : 'Escolha uma data'; });
  $('[data-block-date]')?.dispatchEvent(new Event('change'));
  $('[data-reschedule-date]')?.addEventListener('change', () => {
    const selectedTime = $('[data-reschedule-form] input[name="time"]:checked');
    const summary = $('[data-summary-reschedule]');
    if (selectedTime && summary) summary.textContent = `${new Date(`${$('[data-reschedule-date]').value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · ${selectedTime.value}`;
  });
  $$('[name="time"]').forEach(input => input.addEventListener('change', () => { const summary = $('[data-summary-time]'); if (summary) summary.textContent = input.value; const reschedule = $('[data-summary-reschedule]'); if (reschedule && $('[data-reschedule-date]')) reschedule.textContent = `${new Date(`${$('[data-reschedule-date]').value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · ${input.value}`; }));

  $('[data-new-appointment]')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = $('[data-submit-new]', form);
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Validando horário';
    window.setTimeout(revealSuccess, 850);
  });

  function openOverlay(id, returnFocus) {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel._returnFocus = returnFocus;
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-overlay');
    $('button', panel)?.focus();
  }

  function revealSuccess() {
    $('[data-flow-content]')?.classList.add('hidden');
    const success = $('[data-flow-success]');
    if (success) {
      success.classList.remove('hidden');
      success.setAttribute('aria-hidden', 'false');
      success.tabIndex = -1;
      success.focus();
    }
  }

  $('[data-open-reschedule]')?.addEventListener('click', event => {
    event.stopPropagation();
    const form = $('[data-reschedule-form]');
    if (!form.reportValidity()) return;
    openOverlay('reschedule-confirm-dialog', event.currentTarget);
  });

  $('[data-confirm-reschedule]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Reagendando';
    window.setTimeout(() => { const dialog = $('#reschedule-confirm-dialog'); dialog?.classList.add('hidden'); dialog?.setAttribute('aria-hidden', 'true'); document.body.classList.remove('has-overlay'); revealSuccess(); }, 850);
  });

  $('[data-confirm-cancel]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Cancelando';
    window.setTimeout(() => { const dialog = $('#cancel-confirm-dialog'); dialog?.classList.add('hidden'); dialog?.setAttribute('aria-hidden', 'true'); document.body.classList.remove('has-overlay'); revealSuccess(); }, 850);
  });

  const blockForm = $('[data-block-form]');
  function minutes(value) { const parts = value.split(':').map(Number); return parts[0] * 60 + parts[1]; }
  blockForm?.addEventListener('input', event => {
    const start = blockForm.elements.start.value;
    const end = blockForm.elements.end.value;
    const timeSummary = $('[data-summary-block-time]');
    if (timeSummary) timeSummary.textContent = start && end ? `${start}–${end}` : 'Escolha o período';
    const reasonSummary = $('[data-summary-block-reason]');
    if (reasonSummary) reasonSummary.textContent = blockForm.elements.reason.value.trim() || 'Não informado';
    if (event.target.name === 'start' || event.target.name === 'end') {
      const error = $('[data-form-error]', blockForm);
      error?.classList.add('hidden');
      [blockForm.elements.start, blockForm.elements.end].forEach(input => input.removeAttribute('aria-invalid'));
    }
  });
  blockForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!blockForm.reportValidity()) return;
    const start = minutes(blockForm.elements.start.value);
    const end = minutes(blockForm.elements.end.value);
    const error = $('[data-form-error]', blockForm);
    if (end <= start) {
      error.textContent = 'O término precisa ser posterior ao início.';
      error.className = 'agenda-form-status agenda-inline-error';
      blockForm.elements.end.setAttribute('aria-invalid', 'true');
      blockForm.elements.end.focus();
      return;
    }
    if (start < 660 && end > 600) {
      error.textContent = 'Existe um agendamento de demonstração entre 10:00 e 11:00. Escolha outro período.';
      error.className = 'agenda-form-status agenda-inline-error';
      blockForm.elements.start.setAttribute('aria-invalid', 'true');
      blockForm.elements.end.setAttribute('aria-invalid', 'true');
      blockForm.elements.start.focus();
      return;
    }
    error.classList.add('hidden');
    const button = $('[data-submit-block]', blockForm);
    button.disabled = true;
    blockForm.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Verificando disponibilidade';
    window.setTimeout(revealSuccess, 800);
  });

  $$('[data-external-action]').forEach(button => button.addEventListener('click', () => showToast('A edição deve ser feita no Minha Agenda.')));
  $('[data-retry-external]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Tentando';
    window.setTimeout(() => { button.disabled = false; button.textContent = 'Tentar novamente'; showToast('A conexão continua indisponível no exemplo.'); }, 800);
  });
})();
