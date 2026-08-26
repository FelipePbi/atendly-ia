(function () {
  const root = document.getElementById('settings-root');
  const screen = document.body.dataset.settingsScreen;
  if (!root || !screen) return;

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-${name}"></use></svg>`;
  const externalMode = document.body.dataset.calendarMode === 'external' || screen.includes('external') || new URLSearchParams(window.location.search).get('mode') === 'external';
  const dashboardTarget = externalMode ? 'dashboard-external.html' : 'dashboard-atendly.html';
  const agendaTarget = externalMode ? 'agenda-external.html' : 'agenda-atendly.html';
  const customersTarget = externalMode ? 'customers-external.html' : 'customers.html';
  const servicesTarget = externalMode ? 'services-external.html' : 'services.html';
  const hubTarget = externalMode ? 'settings-external.html' : 'settings.html';
  const modeHref = href => externalMode && !href.includes('external') ? `${href}?mode=external` : href;

  function sidebar() {
    const sourceLabel = externalMode ? 'Minha Agenda conectada' : 'Agenda Atendly oficial';
    return `<aside class="sidebar" aria-label="Navegação da aplicação" data-od-id="settings-sidebar">
      <div class="sidebar-brand"><a class="brand" href="index.html" aria-label="Atendly — visão geral"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a></div>
      <div class="business-context" aria-label="Negócio atual: Studio Aurora"><span class="avatar" aria-hidden="true">SA</span><span class="business-name"><strong>Studio Aurora</strong><span>${sourceLabel}</span></span></div>
      <div class="wa-status status-line" aria-label="WhatsApp conectado"><span class="status-dot" aria-hidden="true"></span><span>WhatsApp conectado</span></div>
      <nav class="nav" aria-label="Navegação principal">
        <a class="nav-item" href="${dashboardTarget}">${icon('home')}<span>Início</span></a>
        <a class="nav-item" href="conversations.html">${icon('chat')}<span>Conversas</span></a>
        <a class="nav-item" href="${agendaTarget}">${icon('calendar')}<span>Agenda</span></a>
        <a class="nav-item" href="${customersTarget}">${icon('users')}<span>Clientes</span></a>
        <a class="nav-item" href="${servicesTarget}">${icon('briefcase')}<span>Serviços</span></a>
      </nav>
      <div class="sidebar-bottom">
        <nav class="nav" aria-label="Configurações"><a class="nav-item is-active" href="${hubTarget}" aria-current="page">${icon('settings')}<span>Configurações</span></a></nav>
        <div class="dropdown"><button class="account-button" type="button" data-toggle="settings-account-menu" aria-controls="settings-account-menu" aria-expanded="false"><span class="avatar" aria-hidden="true">FM</span><span class="business-name"><strong>Felipe Martins</strong><span>Conta principal</span></span>${icon('more')}</button><div id="settings-account-menu" class="menu hidden" data-panel aria-hidden="true"><a class="menu-item" href="${modeHref('settings-account.html')}">Minha conta</a><span class="menu-item" aria-disabled="true">Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">Sair</a></div></div>
      </div>
    </aside>`;
  }

  function mobileHeader() {
    return `<header class="settings-mobile-header" data-od-id="settings-mobile-header"><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a><span class="badge">Studio Aurora</span></header>`;
  }

  function bottomNavigation() {
    return `<nav class="settings-bottom-nav" aria-label="Navegação principal" data-od-id="settings-mobile-navigation">
      <a class="bottom-nav-item" href="${dashboardTarget}">${icon('home')}<span>Início</span></a>
      <a class="bottom-nav-item" href="conversations.html">${icon('chat')}<span>Conversas</span></a>
      <a class="bottom-nav-item" href="${agendaTarget}">${icon('calendar')}<span>Agenda</span></a>
      <a class="bottom-nav-item is-active" href="${hubTarget}" aria-current="page">${icon('more')}<span>Mais</span></a>
    </nav>`;
  }

  function shell(content, overlays = '') {
    root.innerHTML = `<a class="settings-skip-link" href="#main-content">Ir para o conteúdo</a><div class="settings-shell app-frame" data-od-id="settings-${screen}">${sidebar()}<main class="settings-main" id="main-content">${mobileHeader()}${content}</main>${bottomNavigation()}</div>${overlays}`;
  }

  function page(title, description, content, options = {}) {
    const back = options.back === false ? '' : `<a class="settings-back" href="${hubTarget}">${icon('chevron-right')}Configurações</a>`;
    const badge = options.badge || '';
    return `<div class="settings-page">${back}<header class="settings-page-header" data-od-id="settings-page-header"><div><p class="eyebrow">Configurações</p><h1 data-od-id="settings-page-title">${title}</h1><p>${description}</p></div>${badge}</header>${content}</div>`;
  }

  function hubCard(id, href, iconName, title, copy, meta = '', wide = false) {
    return `<a class="settings-hub-card${wide ? ' is-wide' : ''}" href="${href}" data-od-id="settings-card-${id}"><span class="settings-hub-icon">${icon(iconName)}</span><span class="settings-hub-copy"><strong>${title}</strong><span>${copy}</span>${meta ? `<span class="settings-hub-meta">${meta}</span>` : ''}</span>${icon('chevron-right')}</a>`;
  }

  function renderHub() {
    const sourceMeta = externalMode
      ? '<span class="badge">Minha Agenda</span><span class="badge badge-success">Conectada</span>'
      : '<span class="badge badge-success">Agenda Atendly</span><span class="badge">Controle local</span>';
    const availabilityCard = externalMode ? '' : hubCard('availability', 'settings-availability.html', 'clock', 'Disponibilidade', 'Dias, períodos de atendimento e acesso aos bloqueios da agenda.', '<span class="badge">Fuso de Brasília</span>');
    const sourceCopy = externalMode ? 'Integração, última atualização e entrada segura para migração.' : 'Fonte oficial, estado operacional e gestão da disponibilidade.';
    const sourceHref = externalMode ? 'settings-calendar-external.html' : 'settings-calendar.html';
    shell(page('Configurações', 'Ajuste os dados do negócio, o atendimento automático e as conexões.', `
      <section class="settings-overview" aria-label="Resumo operacional" data-od-id="settings-operational-summary"><div class="settings-overview-main"><span class="settings-overview-icon">${icon('shield')}</span><span class="settings-overview-copy"><strong>Atendimento automático disponível</strong><span>WhatsApp conectado e fonte oficial operacional.</span></span></div><div class="settings-overview-points"><span class="status-line"><span class="status-dot" aria-hidden="true"></span>WhatsApp</span><span class="status-line"><span class="status-dot" aria-hidden="true"></span>Agenda</span></div></section>
      <section class="settings-hub-grid" aria-label="Categorias de configurações" data-od-id="settings-categories">
        ${hubCard('business', modeHref('settings-business.html'), 'briefcase', 'Negócio', 'Nome, segmento, idioma, moeda e fuso usados pela Atendly.', '<span class="badge">Studio Aurora</span>')}
        ${hubCard('ai', modeHref('settings-ai.html'), 'spark', 'Atendente virtual', 'Tom das respostas e estado do atendimento automático.', '<span class="badge badge-ai">Leve e próxima</span><span class="badge badge-success">Ativo</span>')}
        ${hubCard('whatsapp', modeHref('settings-whatsapp.html'), 'chat', 'WhatsApp', 'Número conectado, estado da sessão e opções de reconexão.', '<span class="badge badge-success">Conectado</span>')}
        ${hubCard('calendar', sourceHref, 'calendar', 'Agenda e disponibilidade', sourceCopy, sourceMeta)}
        ${availabilityCard}
        ${hubCard('account', modeHref('settings-account.html'), 'lock', 'Conta e segurança', 'E-mail, senha, sessão atual e ações de segurança.', '<span class="badge">Conta principal</span>')}
        ${hubCard('legal', 'auth-terms.html', 'info', 'Termos e privacidade', 'Consulte os documentos aplicáveis ao uso do produto.', '<span class="badge">Documentos</span>', true)}
      </section>`, { back: false }));
  }

  function commonSavePanel(inner, note = 'Alterações aplicadas somente ao negócio atual.') {
    return `<section class="settings-panel"><div class="settings-form-grid">${inner}</div><div class="settings-form-actions"><span class="settings-save-note">${note}</span><button class="btn btn-primary" type="button" data-save-settings>Salvar alterações</button></div><div class="alert alert-success settings-inline-message hidden" role="status" aria-live="polite" data-save-success>${icon('check')}<div><p class="alert-title">Alterações salvas</p><p class="alert-text">As novas configurações já estão em uso.</p></div></div></section>`;
  }

  function renderBusiness() {
    const form = commonSavePanel(`
      <label class="field"><span class="label">Nome do negócio</span><input class="input" type="text" value="Studio Aurora" autocomplete="organization" data-od-id="business-name"><span class="field-help">Este nome será usado nas próximas respostas da Atendly.</span></label>
      <label class="field"><span class="label">Segmento</span><span class="input-wrap"><select class="select" data-od-id="business-segment"><option>Salão de beleza</option><option>Barbearia</option><option>Estética</option><option>Manicure</option><option>Massagem</option><option>Personal trainer</option><option>Consultório</option><option>Outro</option></select><span class="select-icon">${icon('chevron-down')}</span></span></label>
      <label class="field"><span class="label">Idioma</span><span class="input-wrap"><select class="select" data-od-id="business-language"><option>Português (Brasil)</option></select><span class="select-icon">${icon('chevron-down')}</span></span></label>
      <label class="field"><span class="label">Moeda</span><span class="input-wrap"><select class="select" data-od-id="business-currency"><option>Real brasileiro (BRL)</option></select><span class="select-icon">${icon('chevron-down')}</span></span></label>
      <label class="field is-wide"><span class="label">Fuso horário</span><span class="input-wrap"><select class="select" data-timezone data-od-id="business-timezone"><option value="America/Sao_Paulo">Brasília (GMT−3)</option><option value="America/Manaus">Manaus (GMT−4)</option><option value="America/Rio_Branco">Rio Branco (GMT−5)</option></select><span class="select-icon">${icon('chevron-down')}</span></span><span class="field-help">A mudança exige revisão porque altera como horários futuros são exibidos.</span></label>`);
    const side = `<aside class="settings-side-note"><article class="card"><h2>Antes de salvar</h2><p>O nome passa a valer nas próximas respostas. O histórico permanece como foi registrado.</p><div class="settings-side-list"><span>${icon('check')}Idioma padrão: Português do Brasil</span><span>${icon('check')}Moeda padrão: Real brasileiro</span><span>${icon('info')}Mudanças de fuso pedem confirmação</span></div></article></aside>`;
    const overlay = `<div id="timezone-impact-dialog" class="overlay hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="timezone-impact-title"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Revisão necessária</p><h2 id="timezone-impact-title">Alterar fuso horário?</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p class="settings-modal-copy">Horários futuros passarão a ser exibidos no novo fuso. Os agendamentos não serão recriados.</p><ul class="settings-impact-list"><li>Revise os próximos atendimentos depois da mudança.</li><li>Disponibilidade e bloqueios também usarão o novo fuso.</li></ul><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Manter fuso atual</button><button class="btn btn-primary" type="button" data-confirm-timezone>Alterar fuso</button></div></section></div>`;
    shell(page('Negócio', 'Informações usadas para identificar o negócio e apresentar horários corretamente.', `<div class="settings-detail-grid"><div>${form}</div>${side}</div>`), overlay);
  }

  function renderAI() {
    const overlay = `<div id="pause-ai-dialog" class="overlay hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="pause-ai-title"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Impacto operacional</p><h2 id="pause-ai-title">Pausar atendimento automático?</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p class="settings-modal-copy">A Atendly deixará de responder novas mensagens. Conversas em atendimento humano continuam disponíveis.</p><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Manter atendimento ativo</button><button class="btn btn-danger" type="button" data-confirm-ai-pause>Pausar atendimento</button></div></section></div>`;
    shell(page('Atendente virtual', 'Defina como a Atendly conversa, sem alterar fatos, preços ou disponibilidade.', `
      <div class="settings-detail-grid"><div class="settings-stack">
        <section class="settings-panel" data-od-id="ai-service-state"><div class="settings-panel-header"><div><h2>Atendimento automático</h2><p>A Atendly responde em nome do Studio Aurora quando o WhatsApp está conectado.</p></div><span class="badge badge-success" data-ai-status-badge>Ativo</span></div><div class="settings-switch-row"><span class="settings-switch-copy"><strong>Responder automaticamente</strong><span data-ai-state-copy>Novas conversas podem ser atendidas pela IA.</span></span><label class="switch"><span class="sr-only">Ativar atendimento automático</span><input type="checkbox" checked data-ai-toggle><span class="switch-track"></span></label></div></section>
        <section class="settings-panel" data-od-id="ai-tone-settings"><div class="settings-panel-header"><div><h2>Tom das respostas</h2><p>Escolha uma das duas opções disponíveis.</p></div></div><div class="settings-choice-grid" role="radiogroup" aria-label="Tom das respostas"><label class="settings-tone-choice"><input type="radio" name="ai-tone" value="professional"><span class="settings-tone-card"><strong>Profissional e objetiva</strong><span>Respostas diretas, cordiais e com menos informalidade.</span></span><span class="settings-tone-check">${icon('check')}</span></label><label class="settings-tone-choice"><input type="radio" name="ai-tone" value="light" checked><span class="settings-tone-card"><strong>Leve e próxima</strong><span>Conversa acolhedora, simples e natural.</span></span><span class="settings-tone-check">${icon('check')}</span></label></div><div class="settings-preview" aria-live="polite"><p class="settings-preview-label">Prévia da resposta</p><p class="settings-preview-bubble" data-tone-preview>Claro! Vou verificar os horários disponíveis para você.</p></div><div class="settings-form-actions"><span class="settings-save-note">O tom não muda serviços, preços ou regras.</span><button class="btn btn-primary" type="button" data-save-settings>Salvar tom</button></div><div class="alert alert-success settings-inline-message hidden" role="status" aria-live="polite" data-save-success>${icon('check')}<div><p class="alert-title">Tom atualizado</p><p class="alert-text">As próximas respostas usarão a opção escolhida.</p></div></div></section>
      </div><aside class="settings-side-note"><article class="card"><h2>Quando uma pessoa assume</h2><p>A IA pausa naquela conversa e só volta depois que o atendimento for devolvido.</p></article><article class="card"><h2>Fora do horário</h2><p>A mensagem segue a disponibilidade configurada. Nenhum lembrete adicional está ativo.</p></article></aside></div>`), overlay);
  }

  const whatsAppStates = {
    'whatsapp-connected': { badge: 'Conectado', badgeClass: 'badge-success', icon: 'chat', iconClass: '', title: 'WhatsApp conectado', copy: 'O atendimento automático pode operar neste número.', status: 'Sessão ativa', action: 'Reconectar WhatsApp' },
    'whatsapp-disconnected': { badge: 'Desconectado', badgeClass: 'badge-danger', icon: 'alert', iconClass: 'is-danger', title: 'WhatsApp desconectado', copy: 'A Atendly não pode responder automaticamente até uma nova conexão.', status: 'Atendimento automático indisponível', action: 'Conectar WhatsApp' },
    'whatsapp-reconnecting': { badge: 'Reconectando', badgeClass: '', icon: 'refresh', iconClass: 'is-warning', title: 'Reconexão em andamento', copy: 'Conclua a vinculação no WhatsApp. Você pode sair desta tela com segurança.', status: 'Aguardando vinculação', action: 'Ver instruções' },
    'whatsapp-expired': { badge: 'Sessão expirada', badgeClass: 'badge-danger', icon: 'lock', iconClass: 'is-danger', title: 'A sessão expirou', copy: 'Por segurança, conecte o número novamente para retomar o atendimento.', status: 'Atendimento automático interrompido', action: 'Reconectar WhatsApp' },
    'whatsapp-error': { badge: 'Erro de conexão', badgeClass: 'badge-danger', icon: 'alert', iconClass: 'is-danger', title: 'Não foi possível verificar a conexão', copy: 'O estado atual do WhatsApp não pôde ser confirmado. Tente novamente antes de contar com respostas automáticas.', status: 'Estado não confirmado', action: 'Tentar novamente' }
  };

  function reconnectPanel() {
    const cells = Array.from({ length: 49 }, () => '<i></i>').join('');
    return `<section class="settings-panel settings-connect-panel hidden" data-connect-panel aria-hidden="true" data-od-id="whatsapp-connect-instructions"><div class="settings-panel-header"><div><h2>Conectar WhatsApp</h2><p>Use o método adequado ao dispositivo atual.</p></div><button class="icon-btn" type="button" data-hide-connect aria-label="Fechar instruções">${icon('x')}</button></div><div class="settings-connect-layout"><div class="settings-desktop-only"><div class="settings-qr" aria-label="QR Code demonstrativo">${cells}</div><p class="field-help">No WhatsApp do celular, abra Aparelhos conectados e leia o código desta tela.</p></div><div class="settings-mobile-only"><div class="settings-code"><span class="small muted">Código de vinculação demonstrativo</span><strong data-link-code>ABCD-EFGH</strong><button class="btn btn-secondary" type="button" data-copy-code>Copiar código</button></div><ol class="settings-steps"><li>Abra o WhatsApp no celular.</li><li>Acesse Aparelhos conectados.</li><li>Escolha Vincular com número de telefone e cole o código.</li></ol></div><div><h3>Antes de começar</h3><ul class="settings-steps"><li>Mantenha o WhatsApp aberto durante a vinculação.</li><li>O atendimento só volta após a conexão ser confirmada.</li><li>Este protótipo não inicia uma conexão real.</li></ul></div></div></section>`;
  }

  function renderWhatsApp() {
    const config = whatsAppStates[screen] || whatsAppStates['whatsapp-connected'];
    const disconnectButton = screen === 'whatsapp-connected' ? '<button class="btn btn-danger" type="button" data-open="disconnect-whatsapp-dialog" aria-controls="disconnect-whatsapp-dialog">Desconectar número</button>' : '';
    const overlay = `<div id="disconnect-whatsapp-dialog" class="overlay hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="disconnect-whatsapp-title"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Interrupção do serviço</p><h2 id="disconnect-whatsapp-title">Desconectar WhatsApp?</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p class="settings-modal-copy">A Atendly deixará de responder automaticamente assim que a desconexão for concluída.</p><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Manter conectado</button><a class="btn btn-danger" href="settings-whatsapp-disconnected.html">Desconectar WhatsApp</a></div></section></div>`;
    shell(page('WhatsApp', 'Acompanhe a sessão usada pelo atendimento automático e recupere a conexão quando necessário.', `
      <div class="settings-detail-grid"><div class="settings-stack"><section class="settings-status-hero" data-od-id="whatsapp-status"><span class="settings-source-icon ${config.iconClass}">${icon(config.icon)}</span><div class="settings-status-copy"><span class="badge ${config.badgeClass}">${config.badge}</span><h2>${config.title}</h2><p>${config.copy}</p><div class="settings-status-actions"><button class="btn btn-primary" type="button" data-show-connect>${config.action}</button>${disconnectButton}</div></div></section>
      <section class="settings-panel"><div class="settings-panel-header"><div><h2>Detalhes da conexão</h2><p>Informações do ambiente demonstrativo.</p></div></div><div class="settings-data-list"><div class="settings-data-row"><span>Número</span><strong>(11) 99999-0000 · demonstrativo</strong></div><div class="settings-data-row"><span>Estado</span><strong>${config.status}</strong></div><div class="settings-data-row"><span>Última atualização</span><strong>${screen === 'whatsapp-connected' ? 'Agora · demonstração' : 'Não confirmada'}</strong></div></div></section>${reconnectPanel()}</div><aside class="settings-side-note"><article class="card"><h2>Diagnóstico básico</h2><div class="settings-side-list"><span>${icon(screen === 'whatsapp-connected' ? 'check' : 'alert')}Sessão: ${config.status}</span><span>${icon('info')}O atendimento depende desta conexão</span><span>${icon('shield')}Nenhum agendamento é confirmado por esta tela</span></div></article></aside></div>`), overlay);
  }

  function migrationOverlay(targetName, migrationHref) {
    return `<div id="calendar-migration-dialog" class="overlay hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="calendar-migration-title"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Fluxo assistido</p><h2 id="calendar-migration-title">Revisar mudança para ${targetName}</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p class="settings-modal-copy">A fonte oficial não muda agora. O próximo passo inicia uma análise guiada de dados, compatibilidade e conflitos.</p><ul class="settings-impact-list"><li>A agenda atual permanece oficial durante a análise.</li><li>Nenhum horário é liberado ou recriado nesta etapa.</li><li>A migração só avança depois de uma revisão explícita.</li></ul><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Manter fonte atual</button><a class="btn btn-primary" href="${migrationHref}">Iniciar análise assistida</a></div></section></div>`;
  }

  function renderCalendar() {
    const isExternal = externalMode || screen === 'calendar-external';
    const sourceTitle = isExternal ? 'Minha Agenda' : 'Agenda Atendly';
    const sourceBadge = isExternal ? 'Minha Agenda oficial' : 'Gerenciado pela Atendly';
    const sourceCopy = isExternal ? 'Minha Agenda continua controlando os agendamentos. A Atendly usa apenas as operações disponíveis pela conexão.' : 'A Atendly é a fonte oficial e controla serviços, disponibilidade e agendamentos.';
    const primaryAction = isExternal ? '<span class="status-line"><span class="status-dot" aria-hidden="true"></span>Consulta conforme a integração</span>' : '<a class="btn btn-secondary" href="settings-availability.html">Revisar disponibilidade</a>';
    const migrationAction = isExternal ? 'Migrar para Agenda Atendly' : 'Conectar Minha Agenda';
    const targetName = isExternal ? 'Agenda Atendly' : 'Minha Agenda';
    const migrationHref = isExternal ? 'migration-to-atendly-intro.html' : 'migration-to-external-intro.html';
    const summary = isExternal
      ? '<div class="settings-data-row"><span>Serviços</span><strong>Dados disponíveis pela conexão</strong></div><div class="settings-data-row"><span>Clientes</span><strong>Dados disponíveis pela conexão</strong></div><div class="settings-data-row"><span>Agendamentos</span><strong>Gerenciados na fonte oficial</strong></div>'
      : '<div class="settings-data-row"><span>Serviços</span><strong>Gerenciados pela Atendly</strong></div><div class="settings-data-row"><span>Clientes</span><strong>Gerenciados pela Atendly</strong></div><div class="settings-data-row"><span>Agendamentos</span><strong>Gerenciados pela Atendly</strong></div>';
    shell(page('Agenda e disponibilidade', 'Entenda qual sistema confirma os agendamentos antes de alterar qualquer configuração.', `
      <div class="settings-detail-grid"><div class="settings-stack"><section class="settings-source-card" data-od-id="official-calendar-source"><span class="settings-source-icon">${icon(isExternal ? 'link' : 'calendar')}</span><span class="settings-source-copy"><strong>${sourceTitle}</strong><span>${sourceCopy}</span></span><span class="badge badge-success">${sourceBadge}</span></section>
      <section class="settings-panel"><div class="settings-panel-header"><div><h2>Estado da fonte oficial</h2><p>Resumo sem presumir capacidades ainda não confirmadas.</p></div><span class="status-line"><span class="status-dot" aria-hidden="true"></span>Operacional</span></div><div class="settings-data-list"><div class="settings-data-row"><span>Fonte oficial</span><strong>${sourceTitle}</strong></div><div class="settings-data-row"><span>Última atualização</span><strong>${isExternal ? 'Não informada' : 'Agora · ambiente local'}</strong></div><div class="settings-data-row"><span>Sincronização</span><strong>${isExternal ? 'Conexão ativa; frequência não informada' : 'Não se aplica à fonte local'}</strong></div>${summary}</div><div class="settings-form-actions"><span class="settings-save-note" data-sync-status>Dados operacionais sem valores inventados.</span>${primaryAction}</div></section>
      <section class="settings-panel"><div class="settings-panel-header"><div><h2>Mudar fonte oficial</h2><p>Essa decisão inicia uma migração assistida. Não existe troca instantânea.</p></div></div><div class="alert banner-warning">${icon('alert')}<div><p class="alert-title">A agenda atual continua oficial</p><p class="alert-text">Nenhuma mudança ocorrerá antes da análise e da revisão final.</p></div></div><div class="settings-form-actions"><button class="btn btn-primary" type="button" data-open="calendar-migration-dialog" aria-controls="calendar-migration-dialog">${migrationAction}</button></div></section></div><aside class="settings-side-note"><article class="card"><h2>Fonte oficial significa</h2><p>Um agendamento só é confirmado depois de ser salvo com sucesso no sistema que controla a agenda.</p></article>${isExternal ? '<article class="card"><h2>Ações permitidas</h2><p>A interface mostra apenas operações disponibilizadas pela conexão. Recursos não suportados devem ser concluídos na Minha Agenda.</p></article>' : '<article class="card"><h2>Controle local</h2><p>Serviços, disponibilidade, bloqueios e agendamentos são gerenciados pela Atendly.</p></article>'}</aside></div>`, { badge: `<span class="badge badge-success">${sourceBadge}</span>` }), migrationOverlay(targetName, migrationHref));
  }

  const dayRows = [
    ['Segunda-feira', true, '09:00', '18:00'], ['Terça-feira', true, '09:00', '18:00'], ['Quarta-feira', true, '09:00', '18:00'], ['Quinta-feira', true, '09:00', '18:00'], ['Sexta-feira', true, '09:00', '18:00'], ['Sábado', true, '09:00', '13:00'], ['Domingo', false, '', '']
  ];

  function availabilityRow(day, active, start, end, index) {
    return `<div class="availability-row${active ? '' : ' is-off'}" data-availability-row><label class="availability-day"><span class="check"><input type="checkbox" ${active ? 'checked' : ''} data-day-toggle><span class="check-box"></span></span><span>${day}</span></label><div class="availability-periods" data-periods>${active ? `<span class="availability-period"><label class="sr-only" for="start-${index}">Início em ${day}</label><input id="start-${index}" type="time" value="${start}" data-start><span>até</span><label class="sr-only" for="end-${index}">Fim em ${day}</label><input id="end-${index}" type="time" value="${end}" data-end></span>` : '<span class="small muted">Sem atendimento</span>'}</div><button class="btn btn-tertiary" type="button" data-add-period>Adicionar período</button></div>`;
  }

  function renderAvailability() {
    const rows = dayRows.map((day, index) => availabilityRow(...day, index)).join('');
    shell(page('Disponibilidade', 'Defina quando novos horários podem ser oferecidos pela Agenda Atendly.', `<div class="settings-detail-grid"><div class="settings-stack"><section class="settings-panel" data-od-id="weekly-availability"><div class="settings-panel-header"><div><h2>Semana habitual</h2><p>Fuso usado: Brasília (GMT−3). Períodos do mesmo dia não podem se sobrepor.</p></div></div><div class="availability-list">${rows}</div><div class="alert alert-error settings-inline-message hidden" role="alert" data-availability-error>${icon('alert')}<div><p class="alert-title">Revise os horários</p><p class="alert-text">O início precisa ser anterior ao fim e os períodos não podem se sobrepor.</p></div></div><div class="settings-form-actions"><span class="settings-save-note">Mudanças afetam novas opções de horário.</span><button class="btn btn-primary" type="button" data-save-availability>Salvar disponibilidade</button></div><div class="alert alert-success settings-inline-message hidden" role="status" aria-live="polite" data-save-success>${icon('check')}<div><p class="alert-title">Disponibilidade salva</p><p class="alert-text">Novos horários usarão esta semana habitual.</p></div></div></section></div><aside class="settings-side-note"><article class="card"><h2>Exceções e bloqueios</h2><p>Ausências pontuais são registradas como bloqueios na agenda, preservando a rotina semanal.</p><a class="btn btn-secondary" href="agenda-block-time.html">Bloquear horário</a></article><article class="card"><h2>Proteção contra conflitos</h2><p>Períodos sobrepostos e horários invertidos impedem o salvamento.</p></article></aside></div>`));
  }

  function renderAccount() {
    const deleteOverlay = `<div id="delete-account-dialog" class="overlay hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="delete-account-title"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Ação irreversível</p><h2 id="delete-account-title">Solicitar exclusão da conta</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button></div><p class="settings-modal-copy">A exclusão não acontece com um clique. Confirme sua identidade e revise o impacto antes de enviar a solicitação.</p><label class="field settings-confirm-field"><span class="label">Digite EXCLUIR para continuar</span><input class="input" type="text" autocomplete="off" data-delete-confirm aria-describedby="delete-help"><span class="field-help" id="delete-help">Detalhes de retenção ainda dependem da política definitiva do produto.</span></label><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Cancelar</button><button class="btn btn-danger" type="button" disabled data-delete-submit>Revisar solicitação</button></div></section></div>`;
    shell(page('Conta e segurança', 'Proteja o acesso à conta principal e revise ações de encerramento com cuidado.', `<div class="settings-detail-grid"><div class="settings-stack"><section class="settings-panel"><div class="settings-panel-header"><div><h2>Acesso</h2><p>O e-mail identifica a conta usada neste protótipo.</p></div></div><div class="settings-form-grid"><label class="field is-wide"><span class="label">E-mail</span><input class="input" type="email" value="felipe@exemplo.com" autocomplete="email" data-od-id="account-email"></label><label class="field"><span class="label">Senha atual</span><input class="input" type="password" autocomplete="current-password"></label><label class="field"><span class="label">Nova senha</span><input class="input" type="password" autocomplete="new-password" aria-describedby="password-help"><span class="field-help" id="password-help">Use uma senha exclusiva e difícil de adivinhar.</span></label></div><div class="settings-form-actions"><button class="btn btn-primary" type="button" data-save-settings>Atualizar senha</button></div><div class="alert alert-success settings-inline-message hidden" role="status" aria-live="polite" data-save-success>${icon('check')}<div><p class="alert-title">Senha atualizada</p><p class="alert-text">Use a nova senha no próximo acesso.</p></div></div></section><section class="settings-panel"><div class="settings-panel-header"><div><h2>Sessão atual</h2><p>Outras sessões não são apresentadas sem suporte confirmado.</p></div><span class="badge badge-success">Atual</span></div><div class="settings-current-session"><span class="avatar">${icon('shield')}</span><div><strong>Este dispositivo</strong><p class="small muted">Sessão principal · ambiente demonstrativo</p></div></div><div class="settings-form-actions"><a class="btn btn-secondary" href="auth-login.html">Sair da conta</a></div></section><section class="settings-panel settings-danger-zone"><div class="settings-panel-header"><div><h2>Excluir conta</h2><p>Inicia uma solicitação específica com confirmação de identidade e revisão do impacto.</p></div></div><button class="btn btn-danger" type="button" data-open="delete-account-dialog" aria-controls="delete-account-dialog">Solicitar exclusão</button></section></div><aside class="settings-side-note"><article class="card"><h2>Segurança</h2><div class="settings-side-list"><span>${icon('check')}E-mail da conta principal</span><span>${icon('check')}Confirmação antes de ações críticas</span><span>${icon('info')}Política de retenção ainda não definida</span></div></article></aside></div>`), deleteOverlay);
  }

  function renderLoading() {
    shell(page('Configurações', 'Carregando preferências e estados operacionais.', `<section class="settings-state-shell" aria-busy="true" aria-live="polite"><div class="settings-loading-stack"><div class="skeleton skeleton-title"></div><div class="settings-loading-card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div><div class="settings-loading-card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div><span class="sr-only">Carregando configurações</span></div></section>`, { back: false }));
  }

  function renderError() {
    shell(page('Configurações', 'Não foi possível carregar as preferências agora.', `<section class="settings-state-shell"><div class="settings-state-card"><span class="settings-source-icon is-danger">${icon('alert')}</span><h2>Configurações indisponíveis</h2><p>O estado atual não foi alterado. Tente carregar novamente antes de fazer mudanças operacionais.</p><a class="btn btn-primary" href="${hubTarget}">${icon('refresh')}Tentar novamente</a></div></section>`, { back: false }));
  }

  const renderers = {
    hub: renderHub,
    'hub-external': renderHub,
    business: renderBusiness,
    ai: renderAI,
    'whatsapp-connected': renderWhatsApp,
    'whatsapp-disconnected': renderWhatsApp,
    'whatsapp-reconnecting': renderWhatsApp,
    'whatsapp-expired': renderWhatsApp,
    'whatsapp-error': renderWhatsApp,
    calendar: renderCalendar,
    'calendar-external': renderCalendar,
    availability: renderAvailability,
    account: renderAccount,
    loading: renderLoading,
    error: renderError
  };
  (renderers[screen] || renderHub)();

  function showSaveSuccess(button) {
    const panel = button.closest('.settings-panel');
    const success = $('[data-save-success]', panel);
    if (!success) return;
    button.classList.add('btn-loading');
    button.setAttribute('aria-busy', 'true');
    const original = button.innerHTML;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Salvando';
    button.disabled = true;
    window.setTimeout(() => {
      button.innerHTML = original;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.classList.remove('btn-loading');
      success.classList.remove('hidden');
      success.focus?.();
    }, 650);
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#pause-ai-dialog [data-close]') && aiToggle) aiToggle.checked = true;
    const save = event.target.closest('[data-save-settings]');
    if (save) {
      if (screen === 'business' && $('[data-timezone]')?.value !== 'America/Sao_Paulo') {
        event.preventDefault();
        $('[data-open="timezone-impact-dialog"]')?.click();
        const dialog = $('#timezone-impact-dialog');
        if (dialog) dialog._returnFocus = save;
        dialog?.classList.remove('hidden');
        dialog?.setAttribute('aria-hidden', 'false');
        document.body.classList.add('has-overlay');
        $('button', dialog)?.focus();
        return;
      }
      showSaveSuccess(save);
    }
    if (event.target.closest('[data-show-connect]')) {
      const panel = $('[data-connect-panel]');
      panel?.classList.remove('hidden');
      panel?.setAttribute('aria-hidden', 'false');
      panel?.querySelector('button')?.focus();
    }
    if (event.target.closest('[data-hide-connect]')) {
      const panel = $('[data-connect-panel]');
      panel?.classList.add('hidden');
      panel?.setAttribute('aria-hidden', 'true');
      $('[data-show-connect]')?.focus();
    }
    if (event.target.closest('[data-copy-code]')) {
      const button = event.target.closest('[data-copy-code]');
      const code = $('[data-link-code]')?.textContent || '';
      navigator.clipboard?.writeText(code).catch(() => {});
      button.textContent = 'Código copiado';
      window.setTimeout(() => { button.textContent = 'Copiar código'; }, 1600);
    }
    if (event.target.closest('[data-sync-now]')) {
      const button = event.target.closest('[data-sync-now]');
      const status = $('[data-sync-status]');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Sincronizando';
      if (status) status.textContent = 'Consultando a conexão sem alterar a fonte oficial.';
      window.setTimeout(() => {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Sincronizar agora';
        if (status) status.textContent = 'Consulta concluída no ambiente demonstrativo.';
      }, 900);
    }
    if (event.target.closest('[data-confirm-timezone]')) {
      const button = $('[data-save-settings]');
      event.target.closest('.overlay')?.classList.add('hidden');
      document.body.classList.remove('has-overlay');
      if (button) showSaveSuccess(button);
    }
  });

  $$('input[name="ai-tone"]').forEach(input => input.addEventListener('change', () => {
    const preview = $('[data-tone-preview]');
    if (!preview) return;
    preview.textContent = input.value === 'professional'
      ? 'Sim. Vou consultar os horários disponíveis para você.'
      : 'Claro! Vou verificar os horários disponíveis para você.';
  }));

  const aiToggle = $('[data-ai-toggle]');
  aiToggle?.addEventListener('change', () => {
    if (!aiToggle.checked) {
      const dialog = $('#pause-ai-dialog');
      if (dialog) dialog._returnFocus = aiToggle;
      dialog?.classList.remove('hidden');
      dialog?.setAttribute('aria-hidden', 'false');
      document.body.classList.add('has-overlay');
      $('button', dialog)?.focus();
    } else {
      $('[data-ai-status-badge]').textContent = 'Ativo';
      $('[data-ai-status-badge]').className = 'badge badge-success';
      $('[data-ai-state-copy]').textContent = 'Novas conversas podem ser atendidas pela IA.';
    }
  });
  $('[data-confirm-ai-pause]')?.addEventListener('click', event => {
    $('[data-ai-status-badge]').textContent = 'Pausado';
    $('[data-ai-status-badge]').className = 'badge';
    $('[data-ai-state-copy]').textContent = 'Nenhuma nova resposta automática será enviada.';
    event.currentTarget.closest('.overlay')?.classList.add('hidden');
    document.body.classList.remove('has-overlay');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#pause-ai-dialog')?.classList.contains('hidden') && aiToggle) aiToggle.checked = true;
  });

  $$('[data-day-toggle]').forEach(toggle => toggle.addEventListener('change', () => {
    const row = toggle.closest('[data-availability-row]');
    const periods = $('[data-periods]', row);
    row.classList.toggle('is-off', !toggle.checked);
    periods.innerHTML = toggle.checked
      ? '<span class="availability-period"><input type="time" value="09:00" aria-label="Início"><span>até</span><input type="time" value="18:00" aria-label="Fim"></span>'
      : '<span class="small muted">Sem atendimento</span>';
  }));

  $$('[data-add-period]').forEach(button => button.addEventListener('click', () => {
    const row = button.closest('[data-availability-row]');
    const toggle = $('[data-day-toggle]', row);
    const periods = $('[data-periods]', row);
    if (!toggle.checked) toggle.click();
    periods.insertAdjacentHTML('beforeend', '<span class="availability-period"><input type="time" value="14:00" aria-label="Início do período adicional"><span>até</span><input type="time" value="18:00" aria-label="Fim do período adicional"></span>');
  }));

  $('[data-save-availability]')?.addEventListener('click', event => {
    const invalid = $$('[data-availability-row]').some(row => {
      const times = $$('input[type="time"]', row);
      for (let index = 0; index < times.length; index += 2) {
        if (times[index + 1] && times[index].value >= times[index + 1].value) return true;
      }
      const periods = [];
      for (let index = 0; index < times.length; index += 2) periods.push([times[index].value, times[index + 1]?.value]);
      return periods.some((period, index) => index > 0 && period[0] < periods[index - 1][1]);
    });
    $('[data-availability-error]')?.classList.toggle('hidden', !invalid);
    $$('[data-availability-row] input[type="time"]').forEach(input => input.setAttribute('aria-invalid', String(invalid)));
    if (!invalid) showSaveSuccess(event.currentTarget);
  });

  const deleteConfirm = $('[data-delete-confirm]');
  deleteConfirm?.addEventListener('input', () => {
    const submit = $('[data-delete-submit]');
    if (submit) submit.disabled = deleteConfirm.value.trim() !== 'EXCLUIR';
  });
  $('[data-delete-submit]')?.addEventListener('click', event => {
    event.currentTarget.textContent = 'Identidade precisa ser verificada';
    event.currentTarget.disabled = true;
  });
})();
