(function () {
  const root = document.getElementById('conversation-detail-root');
  if (!root) return;

  const state = document.body.dataset.initialState || 'ai';
  const contactWithoutName = state === 'ai';
  const person = contactWithoutName ? 'Contato sem nome' : 'Cliente de demonstração';
  const initials = contactWithoutName ? '?' : 'CD';
  const phone = contactWithoutName ? '(**) *****-4321' : '(**) *****-1234';

  const stateEvent = {
    ai: ['i-spark', 'Atendimento automático ativo', 'A IA está conduzindo a conversa. Nenhum agendamento foi confirmado.'],
    human: ['i-user', 'Conversa assumida por você', 'A IA foi pausada enquanto o atendimento humano estiver ativo.'],
    paused: ['i-info', 'IA pausada nesta conversa', 'Nenhuma resposta automática será enviada até a retomada.'],
    waiting: ['i-alert', 'Cliente pediu atendimento humano', 'A IA foi pausada e esta conversa precisa da sua atenção.'],
    error: ['i-alert', 'Não foi possível consultar a agenda', 'Os horários podem estar desatualizados. Nenhum agendamento foi confirmado.'],
    resolved: ['i-check', 'Conversa marcada como resolvida', 'Nenhuma ação está pendente neste exemplo.']
  }[state];

  const lastCustomerMessage = state === 'waiting'
    ? 'Prefiro falar com uma pessoa, por favor.'
    : state === 'error'
      ? 'Pode confirmar se esse horário está disponível?'
      : 'Quero entender quais opções tenho para esta semana.';

  root.innerHTML = `
    <div class="conversations-shell conversation-detail-shell" data-od-id="conversation-detail-${state}">
      <aside class="sidebar" aria-label="Navegação da aplicação">
        <div class="sidebar-brand"><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a></div>
        <div class="business-context"><span class="avatar">SA</span><span class="business-name"><strong>Studio Aurora</strong><span>Ambiente de demonstração</span></span></div>
        <div class="wa-status status-line"><span class="status-dot" aria-hidden="true"></span><span>WhatsApp conectado</span></div>
        <nav class="nav" aria-label="Navegação principal">
          <a class="nav-item" href="dashboard-atendly.html"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-home"></use></svg><span>Início</span></a>
          <a class="nav-item is-active" href="conversations.html" aria-current="page"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-chat"></use></svg><span>Conversas</span></a>
          <a class="nav-item" href="agenda-atendly.html"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-calendar"></use></svg><span>Agenda</span></a>
          <a class="nav-item" href="customers.html"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-users"></use></svg><span>Clientes</span></a>
          <a class="nav-item" href="services.html"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-briefcase"></use></svg><span>Serviços</span></a>
        </nav>
        <div class="sidebar-bottom"><nav class="nav"><a class="nav-item" href="settings.html"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-settings"></use></svg><span>Configurações</span></a></nav><div class="dropdown"><button class="account-button" type="button" data-toggle="detail-account-menu" aria-controls="detail-account-menu" aria-expanded="false"><span class="avatar" aria-hidden="true">FM</span><span class="business-name"><strong>Felipe Martins</strong><span>Conta principal</span></span><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-more"></use></svg></button><div id="detail-account-menu" class="menu hidden" data-panel aria-hidden="true"><a class="menu-item" href="settings-account.html">Minha conta</a><span class="menu-item" aria-disabled="true">Ajuda</span><div class="menu-divider"></div><a class="menu-item danger" href="auth-login.html">Sair</a></div></div></div>
      </aside>

      <main class="conversation-detail-main">
        <div class="conversation-workspace">
          <aside class="conversation-rail" aria-label="Conversas recentes" data-od-id="conversation-rail">
            <header class="conversation-rail-header"><h1>Conversas</h1><span class="badge badge-attention">1 pendência no exemplo</span></header>
            <div class="conversation-rail-search conversation-search"><label class="sr-only" for="rail-search">Buscar conversa</label><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-search"></use></svg><input class="input" id="rail-search" type="search" placeholder="Buscar conversa" data-conversation-search></div>
            <div class="conversation-rail-list">
              <a class="conversation-row ${state === 'waiting' ? 'is-selected is-attention' : 'is-attention'}" href="conversation-waiting.html" data-conversation-row data-status="unread waiting" data-search="cliente de demonstração 11999991234"><span class="conversation-row-avatar"><span class="avatar">CD</span><span class="unread-count" aria-label="2 mensagens não lidas no exemplo">2</span></span><span class="conversation-row-main"><span class="conversation-row-title"><strong>Cliente de demonstração</strong></span><span class="conversation-row-preview">Prefiro falar com uma pessoa.</span><span class="conversation-row-signals"><span class="badge badge-attention">Aguardando você</span></span></span><time class="conversation-row-time">Agora</time></a>
              <a class="conversation-row ${state === 'ai' ? 'is-selected' : ''}" href="conversation-ai-active.html" data-conversation-row data-status="ai" data-search="contato sem nome 11988884321"><span class="conversation-row-avatar"><span class="avatar">?</span></span><span class="conversation-row-main"><span class="conversation-row-title"><strong>Contato sem nome</strong></span><span class="conversation-row-preview">Quais horários estão disponíveis?</span><span class="conversation-row-signals"><span class="badge badge-ai">IA atendendo</span></span></span><time class="conversation-row-time">12 min</time></a>
              <a class="conversation-row ${state === 'paused' ? 'is-selected' : ''}" href="conversation-paused.html" data-conversation-row data-status="paused" data-search="cliente de demonstração 11977776543"><span class="conversation-row-avatar"><span class="avatar">CD</span></span><span class="conversation-row-main"><span class="conversation-row-title"><strong>Cliente de demonstração</strong></span><span class="conversation-row-preview">Tudo certo, obrigada.</span><span class="conversation-row-signals"><span class="badge">IA pausada</span></span></span><time class="conversation-row-time">1 h</time></a>
            </div>
          </aside>

          <section class="conversation-thread" aria-labelledby="conversation-person-name" data-od-id="conversation-thread">
            <header class="conversation-thread-header">
              <div class="conversation-person">
                <a class="icon-btn conversation-mobile-back" href="conversations.html" aria-label="Voltar para conversas"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-chevron-right"></use></svg></a>
                <span class="avatar">${initials}</span>
                <span class="conversation-person-copy"><strong id="conversation-person-name">${person}</strong><span>${phone} · WhatsApp</span></span>
              </div>
              <div class="conversation-header-actions">
                <button class="btn btn-secondary desktop-context-action" type="button" data-open-client-desktop>Abrir cliente</button>
                <button class="icon-btn conversation-mobile-context" type="button" data-open="conversation-context-sheet" aria-haspopup="dialog" aria-expanded="false" aria-label="Abrir contexto do cliente"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-user"></use></svg></button>
                <div class="dropdown"><button class="icon-btn" type="button" data-toggle="conversation-actions-menu" aria-expanded="false" aria-label="Mais ações"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-more"></use></svg></button><div id="conversation-actions-menu" class="menu hidden" data-panel aria-hidden="true"><button class="menu-item" type="button" data-start-appointment><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-calendar"></use></svg>Criar agendamento</button><button class="menu-item" type="button" data-resolve-conversation><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-check"></use></svg>Marcar como resolvida</button></div></div>
              </div>
            </header>

            <div class="conversation-state-bar" data-thread-state role="status" aria-live="polite">
              <span class="conversation-state-icon"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#${stateEvent[0]}"></use></svg></span>
              <span class="conversation-state-copy"><strong data-thread-state-label>Estado da conversa</strong><span data-thread-state-copy>Atualizando estado.</span></span>
              <button class="btn btn-primary conversation-state-action" type="button" data-thread-primary data-od-id="conversation-primary-action">Ação</button>
            </div>

            <div class="message-timeline" data-message-timeline data-od-id="message-timeline">
              <div class="conversation-demo-note">Conversa de demonstração</div>
              <div class="message-date"><span>Hoje</span></div>
              <div class="message-group"><span class="message-sender">${person}</span><div class="message-bubble">Olá, gostaria de saber os horários disponíveis para esta semana.</div><span class="message-meta">09:42</span></div>
              <div class="message-group is-outgoing is-ai"><span class="message-sender">Studio Aurora · IA</span><div class="message-bubble">Claro. Antes de consultar a agenda, qual serviço você procura?</div><span class="message-meta">09:42 · resposta automática</span></div>
              <div class="message-group"><span class="message-sender">${person}</span><div class="message-bubble">${lastCustomerMessage}</div><span class="message-meta">09:44</span></div>
              <div class="message-system ${state === 'error' ? 'is-error' : ''}" role="${state === 'error' ? 'alert' : 'status'}"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#${stateEvent[0]}"></use></svg><div><strong>${stateEvent[1]}</strong><span>${stateEvent[2]}</span></div></div>
              ${state === 'human' ? '<div class="message-group is-outgoing"><span class="message-sender">Você</span><div class="message-bubble">Olá, vou continuar seu atendimento por aqui.</div><span class="message-meta">09:45 · atendimento humano</span></div>' : ''}
            </div>

            <footer class="composer-zone" data-od-id="conversation-composer">
              ${state === 'error' ? '<div class="composer-error" id="composer-send-error" role="alert"><span>Uma mensagem não foi enviada. O texto foi preservado.</span><button type="button" data-retry-message>Tentar novamente</button></div>' : ''}
              <div class="composer-status"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-info"></use></svg><span id="composer-status-text" data-composer-status>Estado do envio</span></div>
              <form class="composer-form" data-conversation-composer><label class="sr-only" for="message-composer">Mensagem</label><textarea class="composer-input" id="message-composer" rows="1" data-composer-input aria-describedby="composer-status-text${state === 'error' ? ' composer-send-error' : ''}"></textarea><button class="btn btn-primary composer-send" type="submit" data-composer-send aria-label="Enviar mensagem"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-chevron-right"></use></svg></button></form>
            </footer>
          </section>

          <aside class="conversation-context" data-conversation-context data-od-id="conversation-context" aria-labelledby="context-title">
            <h2 id="context-title">Contexto</h2>
            <div class="context-profile"><span class="avatar">${initials}</span><div><strong>${person}</strong><span>${phone}</span></div></div>
            <section class="context-section"><div class="context-section-head"><h3>Cliente</h3><span class="badge">Exemplo</span></div><p>Sem observações cadastradas.</p></section>
            <section class="context-section"><div class="context-section-head"><h3>Agendamentos relacionados</h3></div><div class="context-appointment"><strong>Nenhum agendamento confirmado</strong><span>Horário e serviço só aparecerão após registro na fonte oficial.</span></div></section>
            <section class="context-section context-actions"><button class="btn btn-secondary" type="button" data-start-appointment>Criar agendamento</button><button class="btn btn-tertiary" type="button" data-open-client-desktop>Abrir cliente</button><button class="btn btn-tertiary" type="button" data-resolve-conversation>Marcar como resolvida</button></section>
          </aside>
        </div>
      </main>
    </div>

    <div id="return-ai-dialog" class="overlay hidden" role="alertdialog" aria-modal="true" aria-hidden="true" aria-labelledby="return-ai-title" aria-describedby="return-ai-description"><section class="modal"><div class="modal-header"><div><p class="eyebrow">Retomar automação</p><h2 id="return-ai-title">Devolver conversa para a IA?</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-x"></use></svg></button></div><p id="return-ai-description" class="small muted">A IA voltará a responder automaticamente em nome do Studio Aurora. Revise a conversa antes de continuar.</p><div class="modal-actions"><button class="btn btn-secondary" type="button" data-close>Manter atendimento humano</button><button class="btn btn-primary" type="button" data-confirm-return-ai data-close>Devolver para IA</button></div></section></div>

    <div id="conversation-context-sheet" class="overlay bottom-sheet-wrap hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="context-sheet-title"><section class="bottom-sheet"><div class="sheet-handle"></div><div class="modal-header"><div><p class="eyebrow">Cliente</p><h2 id="context-sheet-title">Contexto da conversa</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar"><svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-x"></use></svg></button></div><div class="context-sheet-profile"><div class="context-profile"><span class="avatar">${initials}</span><div><strong>${person}</strong><span>${phone}</span></div></div><section class="context-section"><h3>Agendamentos relacionados</h3><p>Nenhum agendamento confirmado neste exemplo.</p></section><div class="context-actions"><button class="btn btn-primary" type="button" data-start-appointment data-close>Criar agendamento</button><button class="btn btn-secondary" type="button" data-open-client-demo data-close>Abrir cliente</button><button class="btn btn-tertiary" type="button" data-resolve-conversation data-close>Marcar como resolvida</button></div></div></section></div>
  `;
})();
