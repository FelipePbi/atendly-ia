(function () {
  const root = document.getElementById('system-root');
  const screen = document.body.dataset.systemScreen;
  if (!root || !screen) return;

  const icon = name => `<svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-${name}"></use></svg>`;
  const externalMode = screen === 'external-unavailable';
  const dashboardTarget = externalMode ? 'dashboard-external.html' : 'dashboard-atendly.html';
  const agendaTarget = externalMode ? 'agenda-external.html' : 'agenda-atendly.html';
  const customersTarget = externalMode ? 'customers-external.html' : 'customers.html';
  const servicesTarget = externalMode ? 'services-external.html' : 'services.html';
  const settingsTarget = externalMode ? 'settings-external.html' : 'settings.html';

  function sidebar() {
    return `<aside class="sidebar" aria-label="Navegação da aplicação" data-od-id="system-sidebar">
      <div class="sidebar-brand"><a class="brand" href="index.html" aria-label="Atendly — visão geral"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a></div>
      <div class="business-context" aria-label="Negócio atual: Studio Aurora"><span class="avatar" aria-hidden="true">SA</span><span class="business-name"><strong>Studio Aurora</strong><span>${externalMode ? 'Minha Agenda oficial' : 'Agenda Atendly oficial'}</span></span></div>
      <div class="wa-status status-line" aria-label="Estado do WhatsApp não alterado por esta tela"><span class="status-dot warning" aria-hidden="true"></span><span>Operação requer atenção</span></div>
      <nav class="nav" aria-label="Navegação principal">
        <a class="nav-item is-active" href="${dashboardTarget}" aria-current="page">${icon('home')}<span>Início</span></a>
        <a class="nav-item" href="conversations.html">${icon('chat')}<span>Conversas</span></a>
        <a class="nav-item" href="${agendaTarget}">${icon('calendar')}<span>Agenda</span></a>
        <a class="nav-item" href="${customersTarget}">${icon('users')}<span>Clientes</span></a>
        <a class="nav-item" href="${servicesTarget}">${icon('briefcase')}<span>Serviços</span></a>
      </nav>
      <div class="sidebar-bottom"><nav class="nav" aria-label="Configurações"><a class="nav-item" href="${settingsTarget}">${icon('settings')}<span>Configurações</span></a></nav><a class="account-button" href="settings-account.html"><span class="avatar" aria-hidden="true">FM</span><span class="business-name"><strong>Felipe Martins</strong><span>Conta principal</span></span>${icon('chevron-right')}</a></div>
    </aside>`;
  }

  function mobileHeader() {
    return `<header class="settings-mobile-header" data-od-id="system-mobile-header"><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a><span class="badge badge-attention">Atenção</span></header>`;
  }

  function bottomNavigation() {
    return `<nav class="settings-bottom-nav" aria-label="Navegação principal" data-od-id="system-mobile-navigation"><a class="bottom-nav-item is-active" href="${dashboardTarget}" aria-current="page">${icon('home')}<span>Início</span></a><a class="bottom-nav-item" href="conversations.html">${icon('chat')}<span>Conversas</span></a><a class="bottom-nav-item" href="${agendaTarget}">${icon('calendar')}<span>Agenda</span></a><a class="bottom-nav-item" href="${settingsTarget}">${icon('more')}<span>Mais</span></a></nav>`;
  }

  function shell(content) {
    root.innerHTML = `<a class="settings-skip-link" href="#main-content">Ir para o conteúdo</a><div class="settings-shell app-frame" data-od-id="system-${screen}">${sidebar()}<main class="settings-main" id="main-content">${mobileHeader()}${content}</main>${bottomNavigation()}</div>`;
  }

  function page(options) {
    const { title, description, bannerTitle, bannerCopy, body, badge = '<span class="badge badge-attention">Atenção operacional</span>' } = options;
    return `<div class="system-page"><header class="system-page-header" data-od-id="system-page-header"><div><p class="eyebrow">Estado da operação</p><h1 data-od-id="system-page-title">${title}</h1><p>${description}</p></div>${badge}</header><section class="system-banner" role="alert" data-od-id="system-persistent-banner">${icon('alert')}<div><strong>${bannerTitle}</strong><p>${bannerCopy}</p></div><a class="btn btn-secondary" href="${settingsTarget}">Ver configurações</a></section>${body}</div>`;
  }

  function detailList(items) {
    return `<ul class="system-detail-list">${items.map(([symbol, copy]) => `<li>${icon(symbol)}<span>${copy}</span></li>`).join('')}</ul>`;
  }

  function side() {
    return `<aside class="system-side" aria-label="Ações alternativas"><section class="system-side-card"><h2>O que permanece acessível</h2><p>Use a navegação para consultar informações já carregadas. Ações que exigem confirmação remota continuam bloqueadas.</p><a class="btn btn-secondary" href="conversations.html">Abrir conversas</a></section><section class="system-side-card"><h2>Precisa atender agora?</h2><p>Quando a agenda ou o WhatsApp não puderem confirmar uma operação, assuma o atendimento e não prometa um horário ainda.</p></section></aside>`;
  }

  function offline() {
    const body = `<div class="system-layout"><section class="system-state-panel" data-od-id="offline-state"><span class="system-state-mark">${icon('x')}</span><h2>Você está sem conexão</h2><p>Consultas seguras serão tentadas novamente quando a internet voltar. Nenhuma ação remota será apresentada como concluída.</p>${detailList([['x', '<strong>Novos agendamentos estão bloqueados.</strong> A Atendly não consegue confirmar disponibilidade nem persistência agora.'], ['info', '<strong>Dados visíveis podem estar desatualizados.</strong> Consulte a última informação apenas como referência.'], ['refresh', '<strong>Retentativas são seguras.</strong> A interface não duplica uma operação ao tentar consultar novamente.']])}<div class="system-disabled-action"><div><strong>Criar agendamento</strong><span>Indisponível até recuperar a conexão</span></div><button class="btn" type="button" disabled>Sem conexão</button></div><div class="system-actions"><button class="btn btn-primary" type="button" data-system-retry>Tentar novamente</button><a class="btn btn-secondary" href="${dashboardTarget}">Voltar para Início</a></div><p class="system-retry-status" role="status" aria-live="polite" data-retry-status>Nenhuma alteração foi enviada.</p></section>${side()}</div>`;
    shell(page({ title: 'Conexão interrompida', description: 'Você pode consultar dados já carregados, mas ações que dependem de conexão estão bloqueadas.', bannerTitle: 'Atendly está offline', bannerCopy: 'Ações que dependem da agenda, do WhatsApp ou de serviços online estão temporariamente indisponíveis.', body }));
  }

  function externalUnavailable() {
    const body = `<div class="system-layout"><section class="system-state-panel" data-od-id="external-calendar-unavailable"><span class="system-state-mark">${icon('calendar')}</span><h2>Minha Agenda está indisponível</h2><p>A Atendly não consegue consultar a fonte oficial agora. Horários antigos não são apresentados como disponibilidade atual.</p>${detailList([['clock', '<strong>Última sincronização válida:</strong> não informada pela integração.'], ['x', '<strong>Novos horários não podem ser confirmados.</strong> Aguarde a consulta da fonte oficial.'], ['user', '<strong>Atendimento humano recomendado.</strong> Explique ao cliente que a disponibilidade precisa ser verificada.']])}<div class="system-actions"><button class="btn btn-primary" type="button" data-system-retry>Tentar novamente</button><a class="btn btn-secondary" href="conversations.html">Assumir atendimento</a></div><p class="system-retry-status" role="status" aria-live="polite" data-retry-status>A fonte oficial continua sendo Minha Agenda.</p></section>${side()}</div>`;
    shell(page({ title: 'A agenda oficial não respondeu', description: 'Até a agenda responder, horários antigos não serão mostrados como disponibilidade atual.', bannerTitle: 'Não conseguimos consultar a Minha Agenda', bannerCopy: 'O atendimento automático não deve confirmar agendamentos até a conexão voltar.', body, badge: '<span class="badge badge-danger">Minha Agenda indisponível</span>' }));
  }

  function unexpectedError() {
    const body = `<div class="system-layout"><section class="system-state-panel" data-od-id="unexpected-error-state"><span class="system-state-mark is-danger">${icon('alert')}</span><h2>Algo não saiu como esperado</h2><p>A ação não foi confirmada. Tente novamente ou volte ao Início sem interpretar esta tela como sucesso.</p>${detailList([['x', '<strong>Resultado da ação:</strong> não confirmado.'], ['shield', '<strong>Dados anteriores:</strong> preservados até uma resposta válida.'], ['info', '<strong>Identificador de suporte:</strong> não disponível neste estado demonstrativo.']])}<div class="system-actions"><button class="btn btn-primary" type="button" data-system-retry>Tentar novamente</button><a class="btn btn-secondary" href="${dashboardTarget}">Voltar para Início</a></div><p class="system-retry-status" role="status" aria-live="polite" data-retry-status>Nenhuma confirmação foi emitida.</p></section>${side()}</div>`;
    shell(page({ title: 'Erro inesperado', description: 'Não conseguimos concluir a última ação. Seus dados anteriores foram preservados.', bannerTitle: 'A última ação não foi concluída', bannerCopy: 'Revise o resultado antes de tentar novamente.', body, badge: '<span class="badge badge-danger">Erro</span>' }));
  }

  function sessionExpired() {
    root.innerHTML = `<main class="system-auth" data-od-id="session-expired"><section class="system-auth-card" aria-labelledby="session-title"><a class="brand" href="index.html" aria-label="Atendly — visão geral"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a><span class="system-state-mark is-info">${icon('lock')}</span><p class="eyebrow">Acesso protegido</p><h1 id="session-title" data-od-id="session-expired-title">Sua sessão expirou</h1><p>Entre novamente para continuar. Você voltará à tela anterior quando isso puder ser feito com segurança.</p><div class="system-actions"><a class="btn btn-primary" href="auth-login.html" data-od-id="login-again">Entrar novamente</a><a class="btn btn-secondary" href="index.html">Voltar ao protótipo</a></div><p class="system-auth-meta">Nenhum dado sensível da sessão anterior é exibido nesta tela.</p></section></main>`;
  }

  const renderers = { offline, 'external-unavailable': externalUnavailable, error: unexpectedError, 'session-expired': sessionExpired };
  (renderers[screen] || unexpectedError)();

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-system-retry]');
    if (!button) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Verificando';
    const status = root.querySelector('[data-retry-status]');
    if (status) status.textContent = 'Verificando o estado sem enviar alterações.';
    window.setTimeout(() => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Tentar novamente';
      if (status) status.textContent = screen === 'external-unavailable' ? 'A integração ainda não confirmou recuperação. Minha Agenda continua oficial.' : screen === 'offline' ? 'Ainda sem conexão. Nenhuma alteração foi enviada.' : 'A ação continua sem confirmação. Tente novamente mais tarde.';
    }, 900);
  });
})();
