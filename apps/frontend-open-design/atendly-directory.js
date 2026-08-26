(function () {
  const screen = document.body.dataset.directoryScreen;
  if (!screen) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-${name}"></use></svg>`;
  const mode = document.body.dataset.calendarMode === 'external' || screen.includes('external') ? 'external' : 'atendly';
  const area = screen.startsWith('service') ? 'services' : 'customers';

  function sidebar() {
    const sourceLabel = mode === 'external' ? 'Minha Agenda conectada' : 'Agenda Atendly oficial';
    return `<aside class="sidebar" aria-label="Navegação da aplicação" data-od-id="directory-sidebar">
      <div class="sidebar-brand"><a class="brand" href="index.html" aria-label="Atendly — visão geral"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a></div>
      <div class="business-context" aria-label="Negócio atual: Studio Aurora"><span class="avatar" aria-hidden="true">SA</span><span class="business-name"><strong>Studio Aurora</strong><span>${sourceLabel}</span></span></div>
      <div class="wa-status status-line" aria-label="WhatsApp conectado"><span class="status-dot" aria-hidden="true"></span><span>WhatsApp conectado</span></div>
      <nav class="nav" aria-label="Navegação principal">
        <a class="nav-item" href="dashboard-atendly.html" aria-label="Início">${icon('home')}<span>Início</span></a>
        <a class="nav-item" href="conversations.html" aria-label="Conversas">${icon('chat')}<span>Conversas</span></a>
        <a class="nav-item" href="${mode === 'external' ? 'agenda-external.html' : 'agenda-atendly.html'}" aria-label="Agenda">${icon('calendar')}<span>Agenda</span></a>
        <a class="nav-item ${area === 'customers' ? 'is-active' : ''}" href="${mode === 'external' ? 'customers-external.html' : 'customers.html'}" aria-label="Clientes" ${area === 'customers' ? 'aria-current="page"' : ''}>${icon('users')}<span>Clientes</span></a>
        <a class="nav-item ${area === 'services' ? 'is-active' : ''}" href="${mode === 'external' ? 'services-external.html' : 'services.html'}" aria-label="Serviços" ${area === 'services' ? 'aria-current="page"' : ''}>${icon('briefcase')}<span>Serviços</span></a>
      </nav>
      <div class="sidebar-bottom"><nav class="nav" aria-label="Configurações"><a class="nav-item" href="${mode === 'external' ? 'settings-external.html' : 'settings.html'}">${icon('settings')}<span>Configurações</span></a></nav><div class="dropdown"><button class="account-button" type="button" data-toggle="directory-account-menu" aria-label="Abrir menu da conta de Felipe Martins" aria-controls="directory-account-menu" aria-expanded="false"><span class="avatar" aria-hidden="true">FM</span><span class="business-name"><strong>Felipe Martins</strong><span>Conta principal</span></span>${icon('more')}</button><div id="directory-account-menu" class="menu hidden" data-panel aria-hidden="true"><a class="menu-item" href="settings-account.html">Minha conta</a><span class="menu-item directory-disabled-item" aria-disabled="true">Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">Sair</a></div></div></div>
    </aside>`;
  }

  function mobileHeader() {
    return `<header class="directory-mobile-header" data-od-id="directory-mobile-header"><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a><span class="badge">Studio Aurora</span></header>`;
  }

  function bottomNavigation() {
    return `<nav class="directory-bottom-nav" aria-label="Navegação principal" data-od-id="directory-mobile-navigation">
      <a class="bottom-nav-item" href="dashboard-atendly.html" data-od-id="directory-nav-home">${icon('home')}<span>Início</span></a>
      <a class="bottom-nav-item" href="conversations.html" data-od-id="directory-nav-conversations">${icon('chat')}<span>Conversas</span></a>
      <a class="bottom-nav-item" href="${mode === 'external' ? 'agenda-external.html' : 'agenda-atendly.html'}" data-od-id="directory-nav-agenda">${icon('calendar')}<span>Agenda</span></a>
      <button class="bottom-nav-item is-active" type="button" data-open="directory-more-sheet" aria-controls="directory-more-sheet" aria-haspopup="dialog" aria-expanded="false" aria-current="page" data-od-id="directory-nav-more">${icon('more')}<span>Mais</span></button>
    </nav>`;
  }

  function moreSheet() {
    return `<div id="directory-more-sheet" class="overlay bottom-sheet-wrap hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="directory-more-title"><section class="bottom-sheet"><div class="sheet-handle"></div><div class="modal-header"><div><p class="eyebrow">Navegação</p><h2 id="directory-more-title">Mais</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><div class="list"><a class="menu-item ${area === 'customers' ? 'is-active' : ''}" href="${mode === 'external' ? 'customers-external.html' : 'customers.html'}">${icon('users')}Clientes</a><a class="menu-item ${area === 'services' ? 'is-active' : ''}" href="${mode === 'external' ? 'services-external.html' : 'services.html'}">${icon('briefcase')}Serviços</a><a class="menu-item" href="${mode === 'external' ? 'settings-external.html' : 'settings.html'}">${icon('settings')}Configurações</a><span class="menu-item directory-disabled-item" aria-disabled="true">${icon('help')}Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">${icon('logout')}Sair</a></div></section></div>`;
  }

  function shell(content) {
    const root = document.getElementById('directory-root');
    root.innerHTML = `<a class="directory-skip-link" href="#main-content">Ir para o conteúdo</a><div class="directory-shell app-frame" data-od-id="directory-${screen}">${sidebar()}<main class="directory-main" id="main-content">${mobileHeader()}${content}</main>${bottomNavigation()}</div>${moreSheet()}`;
  }

  function sourceStrip(kind) {
    if (mode === 'external') return `<section class="directory-source-strip" data-od-id="data-source"><div class="directory-source-copy"><span class="directory-source-icon" aria-hidden="true">${icon('link')}</span><div><strong>Dados sincronizados com Minha Agenda</strong><span>${kind === 'services' ? 'Os serviços são editados na fonte oficial.' : 'Nome e telefone são controlados na fonte oficial; observações são locais.'}</span></div></div><span class="badge">Atualização não informada</span></section>`;
    return `<section class="directory-source-strip" data-od-id="data-source"><div class="directory-source-copy"><span class="directory-source-icon" aria-hidden="true">${icon(kind === 'services' ? 'briefcase' : 'users')}</span><div><strong>Gerenciado pela Agenda Atendly</strong><span>${kind === 'services' ? 'Serviços podem ser criados, editados e desativados aqui.' : 'Cadastros e observações pertencem a este negócio.'}</span></div></div><span class="badge badge-success"><span class="badge-dot" aria-hidden="true"></span>Controle completo</span></section>`;
  }

  function demoNote() {
    return `<div class="alert alert-info directory-demo-note" data-od-id="demo-data-notice">${icon('info')}<div><p class="alert-title">Conteúdo demonstrativo</p><p class="alert-text">Nomes, datas e valores abaixo existem apenas para apresentar a interface.</p></div></div>`;
  }

  const customerData = [
    { id: 'primary', initials: 'C1', name: 'Cliente demonstrativo 01', phone: '(11) 99999-1234', last: 'Hoje, 09:18', next: '25 ago · 14:30', count: '6', filter: 'upcoming' },
    { id: 'unnamed', initials: '?', name: 'Contato sem nome', phone: '(11) 98888-4321', last: 'Hoje, 08:42', next: 'Sem próximo horário', count: '1', filter: 'no-upcoming' },
    { id: 'returning', initials: 'C2', name: 'Cliente demonstrativo 02', phone: '(11) 97777-6543', last: 'Ontem, 17:05', next: '28 ago · 10:00', count: '3', filter: 'upcoming' },
    { id: 'inactive', initials: 'C3', name: 'Cliente demonstrativo 03', phone: '(11) 96666-7890', last: '12 ago, 11:20', next: 'Sem próximo horário', count: '2', filter: 'no-upcoming' }
  ];

  const serviceData = [
    { id: 'fixed', name: 'Serviço de demonstração', duration: '60 min', price: 'R$ 120,00', status: 'Ativo', active: true },
    { id: 'consult', name: 'Serviço sob consulta', duration: '45 min', price: 'Sob consulta', status: 'Ativo', active: true },
    { id: 'inactive', name: 'Serviço inativo de exemplo', duration: '30 min', price: 'R$ 80,00', status: 'Inativo', active: false }
  ];

  function customerRow(customer) {
    const href = mode === 'external' ? 'customer-detail-external.html' : 'customer-detail.html';
    return `<a class="directory-row customer-grid" href="${href}" data-directory-row data-filter="${customer.filter}" data-search="${customer.name} ${customer.phone}" data-od-id="customer-row-${customer.id}"><span class="directory-row-main"><span class="avatar" aria-hidden="true">${customer.initials}</span><span class="directory-row-copy"><strong>${customer.name}</strong><span>${customer.phone}</span>${mode === 'external' ? '<span class="badge">Minha Agenda</span>' : ''}</span></span><span class="directory-cell"><span class="directory-cell-label">Último contato</span>${customer.last}</span><span class="directory-cell"><span class="directory-cell-label">Próximo agendamento</span><strong>${customer.next}</strong></span><span class="directory-cell"><span class="directory-cell-label">Agendamentos</span>${customer.count}</span><span class="directory-row-action" aria-hidden="true">${icon('chevron-right')}</span></a>`;
  }

  function serviceRow(service) {
    const origin = mode === 'external' ? '<span class="badge">Minha Agenda</span>' : '<span class="badge">Agenda Atendly</span>';
    const status = service.active ? '<span class="badge badge-success"><span class="badge-dot" aria-hidden="true"></span>Ativo</span>' : '<span class="badge"><span class="badge-dot" aria-hidden="true"></span>Inativo</span>';
    const action = mode === 'external' ? `<span class="directory-row-action" aria-hidden="true">${icon('external')}</span>` : `<a class="icon-btn directory-row-action" href="service-edit.html" aria-label="Editar ${service.name}">${icon('chevron-right')}</a>`;
    return `<div class="directory-row service-grid" data-directory-row data-filter="${service.active ? 'active' : 'inactive'}" data-search="${service.name}" data-od-id="service-row-${service.id}"><span class="directory-row-main"><span class="directory-source-icon" aria-hidden="true">${icon('briefcase')}</span><span class="directory-row-copy"><strong>${service.name}</strong><span>${origin}</span></span></span><span class="directory-cell"><span class="directory-cell-label">Duração</span>${service.duration}</span><span class="directory-cell"><span class="directory-cell-label">Preço</span><strong>${service.price}</strong></span><span class="directory-cell"><span class="directory-cell-label">Status</span>${status}</span><span class="directory-cell"><span class="directory-cell-label">Ação</span>${mode === 'external' ? '<button class="btn btn-tertiary" type="button" data-external-action>Editar no Minha Agenda</button>' : (service.active ? '<button class="btn btn-tertiary" type="button" data-service-toggle data-service-name="' + service.name + '">Desativar</button>' : '<button class="btn btn-tertiary" type="button" data-service-toggle data-service-name="' + service.name + '">Ativar</button>')}</span>${action}</div>`;
  }

  function listPage(kind) {
    const isCustomers = kind === 'customers';
    const title = isCustomers ? 'Clientes' : 'Serviços';
    const description = isCustomers ? 'Informações úteis para continuar atendimentos e acompanhar agendamentos.' : 'Organize o que pode ser agendado, com duração, preço e estado claros.';
    const action = mode === 'external' ? '' : `<a class="btn btn-primary" href="${isCustomers ? 'customer-new.html' : 'service-new.html'}" aria-label="${isCustomers ? 'Novo cliente' : 'Novo serviço'}" data-od-id="create-${isCustomers ? 'customer' : 'service'}">${icon('plus')}<span>${isCustomers ? 'Novo cliente' : 'Novo serviço'}</span></a>`;
    const filters = isCustomers ? [['all','Todos'],['upcoming','Com agendamento'],['no-upcoming','Sem próximo horário']] : [['all','Todos'],['active','Ativos'],['inactive','Inativos']];
    const rows = (isCustomers ? customerData.map(customerRow) : serviceData.map(serviceRow)).join('');
    const head = isCustomers ? '<span>Cliente</span><span>Último contato</span><span>Próximo agendamento</span><span>Agendamentos</span><span></span>' : '<span>Serviço</span><span>Duração</span><span>Preço</span><span>Status</span><span>Ação</span><span></span>';
    return `<section class="directory-page" data-od-id="${kind}-page"><header class="directory-page-header" data-od-id="${kind}-header"><div><h1 data-od-id="${kind}-title">${title}</h1><p>${description}</p></div><div class="directory-page-actions">${action}</div></header>${sourceStrip(kind)}${demoNote()}<section class="directory-toolbar" aria-label="Busca e filtros" data-od-id="${kind}-toolbar"><div class="directory-search"><label class="sr-only" for="directory-search">${isCustomers ? 'Buscar por nome ou telefone' : 'Buscar serviço por nome'}</label>${icon('search')}<input class="input" id="directory-search" type="search" placeholder="${isCustomers ? 'Buscar por nome ou telefone' : 'Buscar serviço'}" autocomplete="off" data-directory-search data-od-id="${kind}-search"></div><div class="directory-filters" aria-label="Filtrar ${title.toLocaleLowerCase('pt-BR')}">${filters.map(([value,label], i) => `<button class="directory-filter ${i === 0 ? 'is-active' : ''}" type="button" aria-pressed="${i === 0}" data-directory-filter="${value}" data-od-id="${kind}-filter-${value}">${label}</button>`).join('')}</div></section><section class="directory-list-surface" aria-labelledby="directory-list-title" data-od-id="${kind}-list"><div class="directory-list-meta"><strong id="directory-list-title">${isCustomers ? 'Recentes' : 'Serviços cadastrados'}</strong><span aria-live="polite" data-visible-count></span></div><div class="directory-grid-head ${isCustomers ? 'customer-grid' : 'service-grid'}" aria-hidden="true">${head}</div><div data-directory-rows>${rows}</div><p class="directory-no-results hidden" data-no-results>Nenhum item corresponde à busca e ao filtro selecionado.</p></section><div class="directory-external-feedback hidden" role="status" data-external-feedback></div></section>`;
  }

  function statePage(kind, state) {
    const isCustomers = kind === 'customers';
    const title = isCustomers ? 'Clientes' : 'Serviços';
    const header = `<header class="directory-page-header" data-od-id="${kind}-state-header"><div><h1 data-od-id="${kind}-state-title">${title}</h1><p>${isCustomers ? 'Informações úteis para continuar atendimentos e acompanhar agendamentos.' : 'Organize o que pode ser agendado, com duração, preço e estado claros.'}</p></div></header>`;
    if (state === 'loading') return `<section class="directory-page" aria-busy="true" data-od-id="${kind}-loading">${header}${sourceStrip(kind)}<span class="sr-only">Carregando ${title.toLocaleLowerCase('pt-BR')}</span><div class="directory-loading-shell">${[1,2,3,4,5].map(() => '<div class="directory-loading-row"><span class="skeleton directory-loading-avatar"></span><span class="directory-loading-copy"><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-line"></span></span><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span></div>').join('')}</div></section>`;
    const isError = state === 'error';
    const emptyTitle = isCustomers ? 'Seus clientes aparecerão aqui' : (mode === 'external' ? 'Nenhum serviço sincronizado' : 'Cadastre seu primeiro serviço');
    const emptyCopy = isCustomers ? 'Depois do primeiro contato, cadastro ou importação, você encontrará cada cliente nesta lista.' : (mode === 'external' ? 'A Atendly ainda não recebeu serviços da fonte oficial. Verifique a conexão antes de ativar agendamentos.' : 'A IA só oferece serviços ativos com nome, duração e preço ou valor sob consulta.');
    const action = isError ? `<button class="btn btn-primary" type="button" data-retry data-od-id="retry-${kind}">Carregar novamente</button>` : (isCustomers ? (mode === 'external' ? '<a class="btn btn-secondary" href="conversations.html" data-od-id="empty-customers-conversations">Ver conversas</a>' : '<a class="btn btn-primary" href="customer-new.html" data-od-id="empty-customers-create">Cadastrar cliente</a>') : (mode === 'external' ? '<button class="btn btn-primary" type="button" data-external-action data-od-id="empty-services-sync">Verificar sincronização</button>' : '<a class="btn btn-primary" href="service-new.html" data-od-id="empty-services-create">Cadastrar primeiro serviço</a>'));
    return `<section class="directory-page" data-od-id="${kind}-${state}">${header}${sourceStrip(kind)}<div class="directory-state-surface"><div class="${isError ? 'error-state' : 'empty-state'}"><span class="state-icon">${icon(isError ? 'alert' : (isCustomers ? 'users' : 'briefcase'))}</span><h2>${isError ? `Não foi possível carregar ${title.toLocaleLowerCase('pt-BR')}` : emptyTitle}</h2><p>${isError ? (mode === 'external' ? 'Os dados podem estar desatualizados. Verifique a conexão antes de tomar decisões com base nesta lista.' : 'A lista não foi atualizada. Tente novamente; nenhum cadastro foi alterado.') : emptyCopy}</p><div class="directory-state-actions">${action}</div><div class="directory-retry-status" role="status" aria-live="polite" data-retry-status></div><div class="directory-external-feedback hidden" role="status" data-external-feedback></div></div></div></section>`;
  }

  function customerDetail() {
    const external = mode === 'external';
    return `<section class="directory-page" data-od-id="customer-detail-page"><header class="directory-page-header"><div><a class="btn btn-tertiary" href="${external ? 'customers-external.html' : 'customers.html'}" data-od-id="customer-detail-back">${icon('chevron-left')}Voltar para clientes</a></div></header>${sourceStrip('customers')}${demoNote()}<section class="directory-detail-hero" data-od-id="customer-summary"><div class="directory-detail-identity"><span class="avatar" aria-hidden="true">C1</span><div><h1 data-od-id="customer-detail-title">Cliente demonstrativo 01</h1><p class="directory-detail-phone">(11) 99999-1234</p><div class="directory-detail-signals"><span class="badge">${external ? 'Minha Agenda' : 'Agenda Atendly'}</span><span class="badge badge-success">Próximo horário agendado</span></div></div></div><div class="directory-detail-actions"><a class="btn btn-primary" href="conversation-ai-active.html" data-od-id="customer-open-conversation">${icon('chat')}Abrir conversa</a>${external ? '<button class="btn btn-secondary" type="button" data-external-action data-od-id="customer-edit-origin">' + icon('external') + 'Editar na origem</button>' : '<button class="btn btn-secondary" type="button" data-open="customer-edit-dialog" data-od-id="customer-edit">' + icon('user') + 'Editar cadastro</button>'}</div></section><div class="directory-detail-grid"><div><section class="directory-section" data-od-id="customer-appointments"><div class="directory-section-header"><div><h2>Agendamentos</h2><p>Próximo horário e histórico deste negócio.</p></div></div><div class="directory-appointment" data-od-id="customer-appointment-upcoming"><time>25 AGO<br>14:30</time><span class="directory-appointment-copy"><strong>Serviço de demonstração</strong><span>60 min · conteúdo demonstrativo</span></span><span class="badge badge-success">Confirmado</span></div><div class="directory-appointment" data-od-id="customer-appointment-previous"><time>12 AGO<br>10:00</time><span class="directory-appointment-copy"><strong>Serviço sob consulta</strong><span>Atendimento anterior · exemplo</span></span><span class="badge">Concluído no exemplo</span></div></section><section class="directory-section" data-od-id="customer-conversation-history"><div class="directory-section-header"><div><h2>Histórico relacionado</h2><p>Conversas e alterações visíveis somente neste negócio.</p></div></div><div class="directory-timeline"><div class="directory-timeline-item"><strong>Conversa atendida pela IA</strong><span>Hoje, 09:18 · exemplo</span></div><div class="directory-timeline-item"><strong>Agendamento criado</strong><span>Ontem, 16:42 · exemplo</span></div><div class="directory-timeline-item"><strong>Primeiro contato recebido</strong><span>12 de agosto · exemplo</span></div></div></section></div><aside><section class="directory-section" data-od-id="customer-notes"><div class="directory-section-header"><div><h2>Observações locais</h2><p>Uso interno. Nada aqui é enviado automaticamente ao cliente.</p></div></div><form class="directory-note-form" data-note-form><label class="label" for="customer-notes">Observações</label><textarea class="input" id="customer-notes" maxlength="500">Prefere atendimento no período da tarde. Conteúdo demonstrativo.</textarea><div class="directory-form-status" role="status" aria-live="polite" data-note-status></div><div class="directory-note-actions"><button class="btn btn-secondary" type="submit" data-od-id="save-customer-notes">Salvar observações</button></div></form></section><section class="directory-section" data-od-id="customer-source"><div class="directory-section-header"><div><h2>Origem dos dados</h2></div></div><div class="directory-readonly-field"><span>Cadastro</span><strong>${external ? 'Minha Agenda' : 'Agenda Atendly'}</strong></div><div class="directory-readonly-field"><span>Última sincronização</span><strong>${external ? 'Não informada' : 'Não se aplica'}</strong></div><div class="directory-external-feedback hidden" role="status" data-external-feedback></div></section></aside></div>${external ? '' : customerEditDialog()}</section>`;
  }

  function customerEditDialog() {
    return `<div id="customer-edit-dialog" class="overlay hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="customer-edit-title"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Agenda Atendly</p><h2 id="customer-edit-title">Editar cadastro</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><form data-customer-edit-form><div class="field directory-dialog-field"><label class="label" for="edit-customer-name">Nome</label><input class="input" id="edit-customer-name" value="Cliente demonstrativo 01" required maxlength="120"></div><div class="field directory-dialog-field"><label class="label" for="edit-customer-phone">Telefone</label><input class="input" id="edit-customer-phone" type="tel" inputmode="tel" autocomplete="tel" value="(11) 99999-1234" required></div><div class="directory-inline-error hidden" role="alert" data-customer-error></div><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit" data-od-id="customer-edit-save">Salvar cadastro</button></div></form></section></div>`;
  }

  function customerForm() {
    return `<section class="directory-page is-form-page" data-od-id="customer-new-page"><header class="directory-page-header"><div><a class="btn btn-tertiary" href="customers.html" data-od-id="customer-new-back">${icon('chevron-left')}Voltar</a><h1 data-od-id="customer-new-title">Novo cliente</h1><p>Cadastre apenas os dados necessários para identificar e atender.</p></div></header>${sourceStrip('customers')}<form class="directory-form-card" data-customer-form data-od-id="customer-new-form"><h2>Dados do cliente</h2><div class="directory-form-grid"><div class="field"><label class="label" for="customer-name">Nome</label><input class="input" id="customer-name" autocomplete="name" required maxlength="120"><span class="field-help">Use o nome que ajuda você a reconhecer este cliente.</span></div><div class="field"><label class="label" for="customer-phone">Telefone</label><input class="input" id="customer-phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(00) 00000-0000" required><span class="field-help">O telefone identifica o cliente apenas neste negócio.</span></div><div class="field is-wide"><label class="label" for="customer-new-notes">Observações locais <span class="muted">(opcional)</span></label><textarea class="input" id="customer-new-notes" maxlength="500"></textarea><span class="field-help">Uso interno. Não será enviado automaticamente ao cliente.</span></div></div><div class="directory-inline-error hidden" role="alert" data-customer-error></div><div class="directory-form-footer"><a class="btn btn-secondary" href="customers.html">Cancelar</a><button class="btn btn-primary" type="submit" data-od-id="submit-customer">Criar cliente</button></div></form></section>`;
  }

  function serviceForm(isEdit) {
    const title = isEdit ? 'Editar serviço' : 'Novo serviço';
    return `<section class="directory-page is-form-page" data-od-id="service-${isEdit ? 'edit' : 'new'}-page"><header class="directory-page-header"><div><a class="btn btn-tertiary" href="services.html" data-od-id="service-form-back">${icon('chevron-left')}Voltar</a><h1 data-od-id="service-form-title">${title}</h1><p>Defina o que a IA pode oferecer ao criar novos agendamentos.</p></div></header>${sourceStrip('services')}<form class="directory-form-card" data-service-form data-editing="${isEdit}" data-od-id="service-form"><h2>Informações do serviço</h2><div class="directory-form-grid"><div class="field is-wide"><label class="label" for="service-name">Nome do serviço</label><input class="input" id="service-name" value="${isEdit ? 'Serviço de demonstração' : ''}" required maxlength="80"></div><div class="field is-wide"><label class="label" for="service-description">Descrição curta <span class="muted">(opcional)</span></label><textarea class="input" id="service-description" maxlength="180">${isEdit ? 'Descrição demonstrativa usada para explicar o atendimento.' : ''}</textarea></div><div class="field"><label class="label" for="service-duration">Duração</label><select class="select" id="service-duration" required><option value="">Selecione</option><option>30 minutos</option><option>45 minutos</option><option ${isEdit ? 'selected' : ''}>60 minutos</option><option>90 minutos</option></select><span class="field-help">Alterações não modificam silenciosamente agendamentos existentes.</span></div><fieldset class="directory-fieldset"><legend>Valor</legend><div class="directory-segmented"><label><input type="radio" name="price-mode" value="fixed" checked><span>Preço fixo</span></label><label><input type="radio" name="price-mode" value="consult"><span>Sob consulta</span></label></div></fieldset><div class="field" data-price-field><label class="label" for="service-price">Preço</label><input class="input" id="service-price" inputmode="decimal" placeholder="R$ 0,00" value="${isEdit ? 'R$ 120,00' : ''}" required><span class="field-help">Uma alteração vale para novos agendamentos; o histórico é preservado.</span></div><label class="check"><input type="checkbox" id="service-active" checked><span class="check-box"></span><span><strong>Serviço ativo</strong><span class="field-help">Serviços inativos não são oferecidos pela IA para novos agendamentos.</span></span></label><div class="directory-form-note is-wide">Antes de salvar alterações de duração ou desativar um serviço, confirme eventuais impactos nos agendamentos futuros.</div></div><div class="directory-inline-error hidden" role="alert" data-service-error></div><div class="directory-form-footer"><a class="btn btn-secondary" href="services.html">Cancelar</a><button class="btn btn-primary" type="submit" data-od-id="submit-service">${isEdit ? 'Salvar alterações' : 'Criar serviço'}</button></div></form></section>`;
  }

  let content = '';
  if (screen === 'customers') content = listPage('customers');
  else if (screen === 'customers-external') content = listPage('customers');
  else if (screen === 'customers-empty') content = statePage('customers', 'empty');
  else if (screen === 'customers-loading') content = statePage('customers', 'loading');
  else if (screen === 'customers-error') content = statePage('customers', 'error');
  else if (screen === 'customer-detail' || screen === 'customer-detail-external') content = customerDetail();
  else if (screen === 'customer-new') content = customerForm();
  else if (screen === 'services') content = listPage('services');
  else if (screen === 'services-external') content = listPage('services');
  else if (screen === 'services-empty' || screen === 'services-external-empty') content = statePage('services', 'empty');
  else if (screen === 'services-loading') content = statePage('services', 'loading');
  else if (screen === 'services-error') content = statePage('services', 'error');
  else if (screen === 'service-new') content = serviceForm(false);
  else if (screen === 'service-edit') content = serviceForm(true);
  shell(content);

  let activeFilter = 'all';
  function applyFilters() {
    const query = ($('[data-directory-search]')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const rows = $$('[data-directory-row]');
    let count = 0;
    rows.forEach(row => {
      const matchesSearch = !query || (row.dataset.search || '').toLocaleLowerCase('pt-BR').includes(query);
      const matchesFilter = activeFilter === 'all' || row.dataset.filter === activeFilter;
      row.classList.toggle('hidden', !(matchesSearch && matchesFilter));
      if (matchesSearch && matchesFilter) count += 1;
    });
    $('[data-no-results]')?.classList.toggle('hidden', count !== 0);
    const status = $('[data-visible-count]');
    if (status) status.textContent = `${count} ${area === 'customers' ? (count === 1 ? 'cliente' : 'clientes') : (count === 1 ? 'serviço' : 'serviços')} no exemplo`;
  }
  $('[data-directory-search]')?.addEventListener('input', applyFilters);
  $$('[data-directory-filter]').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.directoryFilter;
    $$('[data-directory-filter]').forEach(item => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    applyFilters();
  }));
  applyFilters();

  $$('[data-external-action]').forEach(button => {
    if (button.textContent.includes('Editar na origem')) button.innerHTML = `${icon('external')}Editar no Minha Agenda`;
    button.addEventListener('click', () => {
    const feedback = $('[data-external-feedback]');
    if (!feedback) return;
    feedback.textContent = 'Não é possível abrir a Minha Agenda neste protótipo. Nenhum dado foi alterado.';
    feedback.classList.remove('hidden');
    });
  });

  $('[data-retry]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const original = button.textContent;
    const status = $('[data-retry-status]');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Carregando';
    if (status) status.textContent = '';
    setTimeout(() => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = original;
      if (status) status.textContent = mode === 'external'
        ? 'A conexão com Minha Agenda continua indisponível. Nenhum dado foi alterado.'
        : 'Ainda não foi possível atualizar a lista. Nenhum cadastro foi alterado.';
    }, 1000);
  });

  $('[data-note-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    const button = $('button[type="submit"]', event.currentTarget);
    const status = $('[data-note-status]', event.currentTarget);
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Salvando';
    setTimeout(() => { button.disabled = false; button.textContent = 'Salvar observações'; status.textContent = 'Observações salvas somente neste negócio.'; status.className = 'directory-form-status is-success'; }, 850);
  });

  $$('[data-customer-form], [data-customer-edit-form]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    const phone = $('input[type="tel"]', form)?.value.replace(/\D/g, '') || '';
    const error = $('[data-customer-error]', form);
    if (phone.length < 10) { error.textContent = 'Informe um telefone válido com DDD.'; error.classList.remove('hidden'); return; }
    if (form.hasAttribute('data-customer-form') && phone.endsWith('1234')) { error.textContent = 'Já existe um cliente com este telefone neste negócio. Abra o cadastro existente para evitar duplicidade.'; error.classList.remove('hidden'); return; }
    error.classList.add('hidden');
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Salvando';
    setTimeout(() => { window.location.href = 'customers.html'; }, 800);
  }));

  $$('input[name="price-mode"]').forEach(input => input.addEventListener('change', () => {
    const priceField = $('[data-price-field]');
    const priceInput = $('#service-price');
    const fixed = input.value === 'fixed';
    priceField.classList.toggle('hidden', !fixed);
    priceInput.disabled = !fixed;
    priceInput.required = fixed;
  }));

  $('[data-service-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = $('#service-name').value.trim().toLocaleLowerCase('pt-BR');
    const error = $('[data-service-error]', form);
    if (!form.dataset.editing.includes('true') && name === 'serviço de demonstração') { error.textContent = 'Já existe um serviço com este nome. Edite o existente ou escolha outro nome.'; error.classList.remove('hidden'); return; }
    if (!$('#service-duration').value) { error.textContent = 'Selecione a duração do serviço.'; error.classList.remove('hidden'); return; }
    error.classList.add('hidden');
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Salvando';
    setTimeout(() => { window.location.href = 'services.html'; }, 850);
  });

  $$('[data-service-toggle]').forEach(button => button.addEventListener('click', () => {
    const name = button.dataset.serviceName;
    const deactivating = button.textContent.trim() === 'Desativar';
    const dialog = document.createElement('div');
    dialog.id = 'service-status-dialog';
    dialog.className = 'overlay';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'service-status-title');
    dialog.setAttribute('aria-describedby', 'service-status-description');
    dialog.setAttribute('data-od-id', 'service-status-dialog');
    dialog.innerHTML = `<section class="modal"><div class="modal-header"><div><p class="eyebrow">${deactivating ? 'Atenção' : 'Serviço'}</p><h2 id="service-status-title">${deactivating ? 'Desativar serviço?' : 'Ativar serviço?'}</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p class="muted small" id="service-status-description">${deactivating ? `${name} deixará de ser oferecido para novos agendamentos. O histórico será preservado; agendamentos futuros devem ser revisados antes da alteração real.` : `${name} poderá voltar a ser oferecido pela IA depois que os demais requisitos forem válidos.`}</p><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Manter como está</button><button class="btn ${deactivating ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm-service-status>${deactivating ? 'Desativar serviço' : 'Ativar serviço'}</button></div></section>`;
    document.body.appendChild(dialog);
    document.body.classList.add('has-overlay');
    const dismiss = (restoreFocus = true) => {
      dialog.remove();
      document.body.classList.remove('has-overlay');
      if (restoreFocus) button.focus();
    };
    $$('[data-close]', dialog).forEach(close => close.addEventListener('click', dismiss));
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = $$('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', dialog);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    $('[data-confirm-service-status]', dialog).addEventListener('click', () => {
      const row = button.closest('[data-directory-row]');
      const statusCell = $('.directory-cell:nth-child(4)', row);
      const active = !deactivating;
      row.dataset.filter = active ? 'active' : 'inactive';
      statusCell.innerHTML = `<span class="directory-cell-label">Status</span><span class="badge ${active ? 'badge-success' : ''}"><span class="badge-dot" aria-hidden="true"></span>${active ? 'Ativo' : 'Inativo'}</span>`;
      button.textContent = active ? 'Desativar' : 'Ativar';
      dismiss(false);
      applyFilters();
      if (row.classList.contains('hidden')) $('.directory-filter.is-active')?.focus();
      else button.focus();
      window.AtendlyUI?.showToast(`${name} ${active ? 'ativado' : 'desativado'} no exemplo`);
    });
    $('button', dialog).focus();
  }));
})();
