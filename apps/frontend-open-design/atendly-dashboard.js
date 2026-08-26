(function () {
  const dashboard = document.querySelector('.dashboard-shell');
  const dashboardId = dashboard?.dataset.odId || '';
  const agendaTarget = dashboardId.includes('integration-error')
    ? 'agenda-integration-error.html'
    : dashboardId.includes('external')
      ? 'agenda-external.html'
      : dashboardId.includes('empty')
        ? 'agenda-empty.html'
        : dashboardId.includes('loading')
          ? 'agenda-loading.html'
          : 'agenda-atendly.html';
  const externalMode = dashboardId.includes('external') || dashboardId.includes('integration-error');
  const customersTarget = externalMode ? 'customers-external.html' : 'customers.html';
  const servicesTarget = externalMode ? 'services-external.html' : 'services.html';
  const settingsTarget = externalMode ? 'settings-external.html' : 'settings.html';

  document.querySelectorAll('.nav-item.is-active[href="#"]').forEach(item => { item.href = window.location.pathname.split('/').pop() || 'dashboard-atendly.html'; });

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    if (!item.querySelector('use[href$="#i-calendar"]')) return;
    item.addEventListener('click', event => {
      event.preventDefault();
      window.location.href = agendaTarget;
    });
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.querySelector('use[href$="#i-users"]')) item.href = customersTarget;
    if (item.querySelector('use[href$="#i-briefcase"]')) item.href = servicesTarget;
    if (item.querySelector('use[href$="#i-settings"]')) item.href = settingsTarget;
  });

  if (document.querySelector('.dashboard-banner .btn-primary')) {
    document.querySelectorAll('.quick-card .btn-primary').forEach(button => {
      button.classList.remove('btn-primary');
      button.classList.add('btn-secondary');
    });
  }
  if (externalMode) {
    document.querySelectorAll('.agenda-row .badge').forEach(badge => {
      if (badge.textContent.trim() === 'Fonte externa') badge.textContent = 'Minha Agenda';
    });
  }

  document.querySelectorAll('a[href="#agenda-today"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      window.location.href = agendaTarget;
    });
  });
  document.querySelectorAll('[data-today]').forEach(node => {
    node.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  });

  document.querySelectorAll('.dashboard-bottom-nav').forEach(nav => {
    nav.setAttribute('aria-label', 'Navegação principal');
    nav.querySelector('.is-active')?.setAttribute('aria-current', 'page');
  });

  document.querySelectorAll('.sidebar-bottom').forEach((bottom, index) => {
    if (bottom.querySelector('.account-button')) return;
    const wrap = document.createElement('div');
    wrap.className = 'dropdown';
    wrap.classList.add('sidebar-account-menu');
    wrap.innerHTML = '<button class="account-button" type="button" data-toggle="dashboard-account-' + index + '" aria-controls="dashboard-account-' + index + '" aria-expanded="false"><span class="avatar" aria-hidden="true">FM</span><span class="business-name"><strong>Felipe Martins</strong><span>Conta principal</span></span><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-more"></use></svg></button><div id="dashboard-account-' + index + '" class="menu hidden" data-panel aria-hidden="true"><a class="menu-item" href="settings-account.html">Minha conta</a><span class="menu-item" aria-disabled="true">Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">Sair</a></div>';
    bottom.appendChild(wrap);
  });

  document.querySelectorAll('.dashboard-bottom-nav a[href="atendly-shell-mobile.html"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      let overlay = document.getElementById('dashboard-more-sheet');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dashboard-more-sheet';
        overlay.className = 'overlay bottom-sheet-wrap';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Mais opções');
        overlay.innerHTML = '<section class="bottom-sheet"><div class="sheet-handle"></div><div class="modal-header"><div><p class="eyebrow">Navegação</p><h2>Mais</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-x"></use></svg></button></div><div class="list"><a class="menu-item" href="' + customersTarget + '">Clientes</a><a class="menu-item" href="' + servicesTarget + '">Serviços</a><a class="menu-item" href="' + settingsTarget + '">Configurações</a><span class="menu-item" aria-disabled="true">Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">Sair</a></div></section>';
        document.body.appendChild(overlay);
      }
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
      overlay._returnFocus = link;
      link.setAttribute('aria-expanded', 'true');
      document.body.classList.add('has-overlay');
      overlay.querySelector('button')?.focus();
      overlay.querySelector('[data-close]')?.addEventListener('click', () => link.setAttribute('aria-expanded', 'false'), { once: true });
    });
  });
})();
