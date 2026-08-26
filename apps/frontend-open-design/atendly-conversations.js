(function () {
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const $ = (selector, root = document) => root.querySelector(selector);

  function normalizeShellNavigation() {
    $$('.sidebar').forEach(sidebar => {
      const navigation = $('.nav', sidebar);
      if (!navigation) return;
      const iconLink = iconName => $(`.nav-item use[href$="#i-${iconName}"]`, navigation)?.closest('.nav-item');
      const agenda = iconLink('calendar');
      if (agenda) agenda.setAttribute('href', 'agenda-atendly.html');
      if (!iconLink('users')) navigation.insertAdjacentHTML('beforeend', '<a class="nav-item" href="customers.html"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-users"></use></svg><span>Clientes</span></a>');
      if (!iconLink('briefcase')) navigation.insertAdjacentHTML('beforeend', '<a class="nav-item" href="services.html"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-briefcase"></use></svg><span>Serviços</span></a>');

      let bottom = $('.sidebar-bottom', sidebar);
      if (!bottom) {
        bottom = document.createElement('div');
        bottom.className = 'sidebar-bottom';
        bottom.innerHTML = '<nav class="nav" aria-label="Configurações"><a class="nav-item" href="settings.html"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-settings"></use></svg><span>Configurações</span></a></nav><div class="dropdown sidebar-account-menu"><button class="account-button" type="button" data-toggle="conversations-account-menu" aria-controls="conversations-account-menu" aria-expanded="false"><span class="avatar" aria-hidden="true">FM</span><span class="business-name"><strong>Felipe Martins</strong><span>Conta principal</span></span><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-more"></use></svg></button><div id="conversations-account-menu" class="menu hidden" data-panel aria-hidden="true"><a class="menu-item" href="settings-account.html">Minha conta</a><span class="menu-item" aria-disabled="true">Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">Sair</a></div></div>';
        sidebar.appendChild(bottom);
      }
      bottom.querySelectorAll('.nav-item[href="#"]').forEach(link => { link.href = 'settings.html'; });
      bottom.querySelectorAll('.menu-item').forEach(item => {
        const label = item.textContent.trim();
        if (label === 'Minha conta' && item.tagName !== 'A') item.outerHTML = '<a class="menu-item" href="settings-account.html">Minha conta</a>';
        if (label === 'Sair' && item.tagName !== 'A') item.outerHTML = '<a class="menu-item danger" href="auth-login.html">Sair</a>';
      });
    });

    $$('.bottom-nav-item').forEach(item => {
      if (!item.querySelector('use[href$="#i-calendar"]') || item.tagName === 'A') return;
      const link = document.createElement('a');
      link.className = item.className;
      link.href = 'agenda-atendly.html';
      link.innerHTML = item.innerHTML;
      item.replaceWith(link);
    });
  }

  normalizeShellNavigation();

  const moreTrigger = $('[data-open="conversations-more-sheet"]');
  if (moreTrigger && !document.getElementById('conversations-more-sheet')) {
    const overlay = document.createElement('div');
    overlay.id = 'conversations-more-sheet';
    overlay.className = 'overlay bottom-sheet-wrap hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-labelledby', 'conversations-more-title');
    overlay.innerHTML = '<section class="bottom-sheet"><div class="sheet-handle"></div><div class="modal-header"><div><p class="eyebrow">Navegação</p><h2 id="conversations-more-title">Mais</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-x"></use></svg></button></div><div class="list"><a class="menu-item" href="customers.html">Clientes</a><a class="menu-item" href="services.html">Serviços</a><a class="menu-item" href="settings.html">Configurações</a><span class="menu-item" aria-disabled="true">Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">Sair</a></div></section>';
    document.body.appendChild(overlay);
  }

  document.querySelectorAll('.menu-item').forEach(item => {
    if (item.textContent.trim() === 'Ajuda' && item.matches('button')) {
      item.disabled = true;
      item.setAttribute('aria-disabled', 'true');
    }
  });

  $$('.nav-item, .bottom-nav-item').forEach(item => {
    const calendarIcon = $('use[href$="#i-calendar"]', item);
    const isPlaceholder = item.tagName === 'BUTTON' || item.getAttribute('href') === '#';
    if (calendarIcon && isPlaceholder) {
      item.addEventListener('click', event => {
        event.preventDefault();
        window.location.href = 'agenda-atendly.html';
      });
    }
  });

  const stateConfig = {
    ai: {
      label: 'IA atendendo',
      copy: 'A IA responde em nome do negócio.',
      icon: 'i-spark',
      action: 'Assumir conversa',
      className: 'is-ai',
      composer: 'Assuma a conversa para responder manualmente.'
    },
    human: {
      label: 'Atendimento humano',
      copy: 'Você está atendendo. A IA está pausada.',
      icon: 'i-user',
      action: 'Devolver para IA',
      className: 'is-human',
      composer: 'Você está respondendo · IA pausada'
    },
    paused: {
      label: 'IA pausada',
      copy: 'Nenhuma resposta automática será enviada.',
      icon: 'i-info',
      action: 'Devolver para IA',
      className: 'is-paused',
      composer: 'IA pausada para esta conversa.'
    },
    waiting: {
      label: 'Aguardando você',
      copy: 'O cliente pediu atendimento humano.',
      icon: 'i-alert',
      action: 'Assumir conversa',
      className: 'is-waiting',
      composer: 'Assuma a conversa para responder ao cliente.'
    },
    error: {
      label: 'Erro operacional',
      copy: 'A IA não pôde concluir a solicitação.',
      icon: 'i-alert',
      action: 'Assumir conversa',
      className: 'is-error',
      composer: 'Assuma a conversa para orientar o cliente.'
    },
    resolved: {
      label: 'Conversa resolvida',
      copy: 'Nenhuma ação está pendente.',
      icon: 'i-check',
      action: 'Resolvida',
      className: 'is-resolved',
      composer: 'Reabra a conversa antes de responder.'
    }
  };

  function filterConversations() {
    const search = $('[data-conversation-search]');
    const rows = $$('[data-conversation-row]');
    if (!rows.length) return;
    const active = $('[data-conversation-filter].is-active')?.dataset.conversationFilter || 'all';
    const query = (search?.value || '').trim().toLocaleLowerCase('pt-BR');
    let visible = 0;

    rows.forEach(row => {
      const statuses = (row.dataset.status || '').split(' ');
      const matchesFilter = active === 'all' || statuses.includes(active);
      const matchesSearch = !query || (row.dataset.search || row.textContent).toLocaleLowerCase('pt-BR').includes(query);
      const show = matchesFilter && matchesSearch;
      row.classList.toggle('hidden', !show);
      if (show) visible += 1;
    });

    const count = $('[data-visible-count]');
    if (count) count.textContent = visible + (visible === 1 ? ' conversa no exemplo' : ' conversas no exemplo');
    const noResults = $('[data-no-results]');
    if (noResults) noResults.classList.toggle('hidden', visible !== 0);
  }

  $$('[data-conversation-filter]').forEach(button => {
    button.addEventListener('click', () => {
      $$('[data-conversation-filter]').forEach(item => {
        const selected = item === button;
        item.classList.toggle('is-active', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      filterConversations();
    });
  });

  $('[data-conversation-search]')?.addEventListener('input', filterConversations);

  let currentState = document.body.dataset.initialState || 'ai';

  function setConversationState(nextState) {
    const config = stateConfig[nextState];
    const bar = $('[data-thread-state]');
    if (!config || !bar) return;
    currentState = nextState;
    bar.className = 'conversation-state-bar ' + config.className;
    $('[data-thread-state-label]', bar).textContent = config.label;
    $('[data-thread-state-copy]', bar).textContent = config.copy;
    const use = $('use', bar);
    if (use) use.setAttribute('href', 'atendly-icons.svg#' + config.icon);

    const action = $('[data-thread-primary]');
    if (action) {
      action.className = 'btn conversation-state-action ' + ((nextState === 'human' || nextState === 'paused' || nextState === 'resolved') ? 'btn-secondary' : 'btn-primary');
      action.textContent = config.action;
      action.disabled = nextState === 'resolved';
      if (nextState === 'human' || nextState === 'paused') {
        action.dataset.open = 'return-ai-dialog';
        action.setAttribute('aria-haspopup', 'dialog');
      } else {
        delete action.dataset.open;
        action.removeAttribute('aria-haspopup');
      }
    }

    const input = $('[data-composer-input]');
    const send = $('[data-composer-send]');
    const composerStatus = $('[data-composer-status]');
    const canReply = nextState === 'human';
    if (input) {
      input.disabled = !canReply;
      input.placeholder = canReply ? 'Digite sua mensagem' : config.composer;
    }
    if (send) send.disabled = !canReply;
    if (composerStatus) composerStatus.textContent = config.composer;
  }

  $('[data-thread-primary]')?.addEventListener('click', event => {
    if (currentState === 'human' || currentState === 'paused' || currentState === 'resolved') return;
    event.preventDefault();
    setConversationState('human');
    window.AtendlyUI?.showToast('Conversa assumida. A IA foi pausada.');
    $('[data-composer-input]')?.focus();
  });

  $('[data-confirm-return-ai]')?.addEventListener('click', () => {
    setConversationState('ai');
    window.AtendlyUI?.showToast('A IA retomou o atendimento automático.');
  });

  $$('[data-resolve-conversation]').forEach(button => {
    button.addEventListener('click', () => {
      setConversationState('resolved');
      window.AtendlyUI?.showToast('Conversa marcada como resolvida.');
    });
  });

  $('[data-conversation-composer]')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = $('[data-composer-input]', event.currentTarget);
    const text = input?.value.trim();
    if (!text || currentState !== 'human') return;
    const group = document.createElement('div');
    group.className = 'message-group is-outgoing';
    group.innerHTML = '<span class="message-sender">Você</span><div class="message-bubble"></div><span class="message-meta">Agora · exemplo</span>';
    $('.message-bubble', group).textContent = text;
    const timeline = $('[data-message-timeline]');
    timeline?.appendChild(group);
    input.value = '';
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
    window.AtendlyUI?.showToast('Mensagem adicionada à conversa de demonstração.');
  });

  $$('[data-start-appointment]').forEach(button => {
    button.addEventListener('click', () => {
      window.location.href = 'appointment-new.html';
    });
  });

  $$('[data-open-client-desktop]').forEach(button => {
    button.addEventListener('click', () => {
      const context = $('[data-conversation-context]');
      if (context && getComputedStyle(context).display !== 'none') {
        context.setAttribute('tabindex', '-1');
        context.focus();
      }
    });
  });

  $$('[data-open-client-demo]').forEach(button => {
    button.addEventListener('click', () => {
      window.AtendlyUI?.showToast('Dados do cliente exibidos no contexto da conversa.');
    });
  });

  $('[data-retry-message]')?.addEventListener('click', event => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = 'Tentando…';
    window.setTimeout(() => {
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = 'Tentar novamente';
      window.AtendlyUI?.showToast('Nova tentativa iniciada.');
    }, 700);
  });

  $('[data-refresh-empty]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const status = $('[data-empty-update]');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Atualizando</span>';
    if (status) status.textContent = 'Consultando novas conversas…';

    window.setTimeout(() => {
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
      button.textContent = originalLabel;
      if (status) status.textContent = 'Lista atualizada. Ainda não há conversas.';
    }, 800);
  });

  if ($('[data-thread-state]')) setConversationState(currentState);
  filterConversations();
})();
