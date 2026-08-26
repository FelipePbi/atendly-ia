(function () {
  const root = document.getElementById('migration-root');
  const screen = document.body.dataset.migrationScreen;
  if (!root || !screen) return;

  const params = new URLSearchParams(window.location.search);
  const target = params.get('target') || document.body.dataset.migrationTarget || (screen.includes('external') ? 'external' : 'atendly');
  const capability = params.get('capability') || document.body.dataset.migrationCapability || (screen.includes('external') ? 'unavailable' : 'available');
  const toExternal = target === 'external';
  const sourceName = toExternal ? 'Agenda Atendly' : 'Minha Agenda';
  const targetName = toExternal ? 'Minha Agenda' : 'Agenda Atendly';
  const currentMode = toExternal ? 'atendly' : 'external';
  const migrationCompleted = screen === 'success';
  const activeMode = migrationCompleted ? target : currentMode;
  const activeSourceName = migrationCompleted ? targetName : sourceName;
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-${name}"></use></svg>`;
  const withTarget = href => `${href}${href.includes('?') ? '&' : '?'}target=${target}&capability=${capability}`;
  const dashboardTarget = activeMode === 'external' ? 'dashboard-external.html' : 'dashboard-atendly.html';
  const agendaTarget = activeMode === 'external' ? 'agenda-external.html' : 'agenda-atendly.html';
  const customersTarget = activeMode === 'external' ? 'customers-external.html' : 'customers.html';
  const servicesTarget = activeMode === 'external' ? 'services-external.html' : 'services.html';
  const settingsTarget = activeMode === 'external' ? 'settings-external.html' : 'settings.html';

  function sidebar() {
    return `<aside class="sidebar" aria-label="Navegação da aplicação" data-od-id="migration-sidebar">
      <div class="sidebar-brand"><a class="brand" href="index.html" aria-label="Atendly — visão geral"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a></div>
      <div class="business-context" aria-label="Negócio atual: Studio Aurora"><span class="avatar" aria-hidden="true">SA</span><span class="business-name"><strong>Studio Aurora</strong><span>${activeSourceName} oficial</span></span></div>
      <div class="wa-status status-line" aria-label="WhatsApp conectado"><span class="status-dot" aria-hidden="true"></span><span>WhatsApp conectado</span></div>
      <nav class="nav" aria-label="Navegação principal">
        <a class="nav-item" href="${dashboardTarget}">${icon('home')}<span>Início</span></a>
        <a class="nav-item" href="conversations.html">${icon('chat')}<span>Conversas</span></a>
        <a class="nav-item" href="${agendaTarget}">${icon('calendar')}<span>Agenda</span></a>
        <a class="nav-item" href="${customersTarget}">${icon('users')}<span>Clientes</span></a>
        <a class="nav-item" href="${servicesTarget}">${icon('briefcase')}<span>Serviços</span></a>
      </nav>
      <div class="sidebar-bottom">
        <nav class="nav" aria-label="Configurações"><a class="nav-item is-active" href="${settingsTarget}" aria-current="page">${icon('settings')}<span>Configurações</span></a></nav>
        <a class="account-button" href="settings-account.html"><span class="avatar" aria-hidden="true">FM</span><span class="business-name"><strong>Felipe Martins</strong><span>Conta principal</span></span>${icon('chevron-right')}</a>
      </div>
    </aside>`;
  }

  function mobileHeader() {
    return `<header class="settings-mobile-header" data-od-id="migration-mobile-header"><a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span><span>Atendly</span></a><span class="badge">${activeSourceName}</span></header>`;
  }

  function bottomNavigation() {
    return `<nav class="settings-bottom-nav" aria-label="Navegação principal" data-od-id="migration-mobile-navigation">
      <a class="bottom-nav-item" href="${dashboardTarget}">${icon('home')}<span>Início</span></a>
      <a class="bottom-nav-item" href="conversations.html">${icon('chat')}<span>Conversas</span></a>
      <a class="bottom-nav-item" href="${agendaTarget}">${icon('calendar')}<span>Agenda</span></a>
      <a class="bottom-nav-item is-active" href="${settingsTarget}" aria-current="page">${icon('more')}<span>Mais</span></a>
    </nav>`;
  }

  function stepper(step) {
    const items = [['Preparar', 1], ['Revisar', 2], ['Realizar corte', 3]];
    return `<ol class="migration-stepper" aria-label="Progresso da migração">${items.map(([label, number]) => {
      const state = number < step ? 'is-complete' : number === step ? 'is-current' : '';
      const index = number < step ? icon('check') : String(number).padStart(2, '0');
      return `<li class="${state}"${number === step ? ' aria-current="step"' : ''}><span class="migration-step-index">${index}</span><span>${label}</span></li>`;
    }).join('')}</ol>`;
  }

  function route() {
    const sourceLabel = migrationCompleted ? 'Fonte anterior' : 'Fonte atual';
    const targetLabel = migrationCompleted ? 'Fonte oficial' : 'Destino proposto';
    return `<section class="migration-route" aria-label="Mudança da fonte oficial" data-od-id="migration-route"><div class="migration-route-node"><span>${sourceLabel}</span><strong>${sourceName}</strong></div>${icon('chevron-right')}<div class="migration-route-node"><span>${targetLabel}</span><strong>${targetName}</strong></div></section>`;
  }

  function sideNotes(extra = '') {
    return `<aside class="migration-side" aria-label="Proteções da migração"><section class="migration-side-card"><h2>Proteções mantidas</h2><ul class="migration-side-list"><li>${icon('shield')}<span>A fonte atual continua oficial durante a preparação.</span></li><li>${icon('check')}<span>A troca só ocorre após validar o destino.</span></li><li>${icon('chat')}<span>Conversas e histórico local permanecem na Atendly.</span></li></ul></section>${extra}</aside>`;
  }

  function shell(content) {
    root.innerHTML = `<a class="settings-skip-link" href="#main-content">Ir para o conteúdo</a><div class="settings-shell app-frame" data-od-id="migration-${screen}">${sidebar()}<main class="settings-main" id="main-content">${mobileHeader()}${content}</main>${bottomNavigation()}</div>`;
  }

  function page(options) {
    const { title, description, step, body, back = settingsTarget, badge = '' } = options;
    return `<div class="migration-page"><div class="migration-toolbar"><a class="migration-back" href="${back}">${icon('chevron-right')}Configurações</a><span class="migration-progress-label">MIGRAÇÃO ASSISTIDA</span></div><header class="migration-header" data-od-id="migration-page-header"><div class="migration-header-copy"><p class="eyebrow">Fonte oficial da agenda</p><h1 data-od-id="migration-page-title">${title}</h1><p>${description}</p></div>${badge}</header>${stepper(step)}${body}</div>`;
  }

  function intro() {
    const copy = toExternal
      ? 'Antes de conectar o Minha Agenda, a Atendly verifica a conta de destino e o que a integração realmente permite transferir.'
      : 'Prepare a importação única e revise os dados antes de tornar a Agenda Atendly responsável por novos agendamentos.';
    const facts = toExternal
      ? [
          ['Minha Agenda passará a controlar os dados', 'A troca só acontece depois da validação e do corte final.'],
          ['A conta de destino precisa ser conectada', 'Nenhum método específico de autenticação é antecipado nesta etapa.'],
          ['A transferência pode não ser automática', 'A Atendly mostra a capacidade real da integração antes de continuar.'],
          ['Agendamentos futuros serão protegidos', 'Conflitos precisam ser resolvidos antes da mudança.']
        ]
      : [
          ['Importação única, não sincronização contínua', 'Os dados compatíveis são copiados para a Atendly durante a migração.'],
          ['A Atendly controlará novos agendamentos', 'A integração contínua é encerrada somente após o corte concluído.'],
          ['Histórico e pendências serão revisados', 'Itens incompatíveis aparecem antes da confirmação.'],
          ['A fonte atual permanece ativa', 'Minha Agenda continua oficial durante análise e preparação.']
        ];
    const next = toExternal ? 'migration-diagnosis-external.html' : 'migration-diagnosis.html';
    const cta = toExternal ? 'Conectar e verificar' : 'Preparar migração';
    const body = `${route()}<div class="migration-layout migration-content"><div class="migration-stack"><section class="migration-panel" data-od-id="migration-introduction"><div class="migration-panel-header"><div><h2>O que muda</h2><p>Primeiro analisamos. Nada é trocado nesta etapa.</p></div><span class="badge">Sem corte agora</span></div><ul class="migration-facts">${facts.map(([title, detail]) => `<li>${icon('check')}<div><strong>${title}</strong><span>${detail}</span></div></li>`).join('')}</ul><div class="migration-actions"><a class="btn btn-secondary" href="${settingsTarget}">Manter fonte atual</a><a class="btn btn-primary" href="${next}" data-od-id="prepare-migration">${cta}</a></div></section></div>${sideNotes()}</div>`;
    shell(page({ title: `Migrar para ${targetName}`, description: copy, step: 1, body }));
  }

  function diagnosticRows() {
    if (toExternal && capability === 'unavailable') {
      return [
        ['Conta de destino', 'Conexão necessária', 'is-warning', 'alert'],
        ['Serviços', 'Revisão manual', 'is-warning', 'alert'],
        ['Clientes', 'Capacidade não confirmada', '', 'info'],
        ['Agendamentos futuros', 'Não transferir automaticamente', 'is-danger', 'alert'],
        ['Migração automática', 'Indisponível nesta variação', 'is-danger', 'x']
      ];
    }
    if (toExternal) {
      return [
        ['Conta de destino', 'Validada para este diagnóstico', 'is-ready', 'check'],
        ['Serviços', 'Disponíveis para mapear', 'is-ready', 'check'],
        ['Clientes', 'Disponíveis para mapear', 'is-ready', 'check'],
        ['Agendamentos futuros', 'Revisão obrigatória', 'is-warning', 'alert'],
        ['Transferência', 'Disponível pela conexão validada', 'is-ready', 'check']
      ];
    }
    return [
      ['Serviços', 'Disponíveis para validar', 'is-ready', 'check'],
      ['Clientes', 'Disponíveis para validar', 'is-ready', 'check'],
      ['Agendamentos futuros', 'Revisão obrigatória', 'is-warning', 'alert'],
      ['Disponibilidade', 'Revisão obrigatória', 'is-warning', 'alert'],
      ['Importação para Atendly', 'Prevista pelo produto', 'is-ready', 'check']
    ];
  }

  function diagnosis() {
    const unavailable = toExternal && capability === 'unavailable';
    const rows = diagnosticRows();
    const body = `${route()}<div class="migration-layout migration-content"><div class="migration-stack"><section class="migration-panel" data-od-id="migration-diagnosis"><div class="migration-panel-header"><div><h2>${unavailable ? 'Transferência automática indisponível' : 'Diagnóstico da origem e do destino'}</h2><p>A conexão informa a capacidade real antes de qualquer corte.</p></div><span class="migration-status ${unavailable ? 'is-danger' : 'is-warning'}">${icon(unavailable ? 'x' : 'alert')}${unavailable ? 'Não automatizar' : 'Revisão necessária'}</span></div><ul class="migration-diagnostics">${rows.map(([label, state, style, stateIcon]) => `<li><div><strong>${label}</strong><small>${label === 'Agendamentos futuros' ? 'O corte não avança sem proteger horários já registrados.' : 'A categoria será validada antes da mudança.'}</small></div><span class="migration-status ${style}">${icon(stateIcon)}${state}</span></li>`).join('')}</ul>${unavailable ? `<div class="alert banner-warning migration-inline-state" role="status">${icon('alert')}<div><p class="alert-title">A mudança não será automatizada</p><p class="alert-text">Prepare os dados no Minha Agenda e retorne à Atendly para validar a nova fonte. A Agenda Atendly continua oficial.</p></div></div><div class="migration-actions"><a class="btn btn-primary" href="settings-calendar.html">Voltar para configurações</a></div>` : `<div class="migration-actions"><a class="btn btn-secondary" href="${toExternal ? 'migration-diagnosis-external.html' : settingsTarget}">${toExternal ? 'Ver integração sem transferência' : 'Cancelar preparação'}</a><a class="btn btn-primary" href="${withTarget('migration-conflicts.html')}" data-od-id="review-conflicts">Revisar conflitos</a></div>`}</section></div>${sideNotes(`<section class="migration-side-card"><h2>Capacidade real</h2><p>${toExternal ? 'A transferência para o Minha Agenda depende das operações oferecidas pela integração conectada.' : 'A importação copia dados compatíveis uma única vez e não cria sincronização contínua.'}</p></section>`)}</div>`;
    shell(page({ title: 'Verificar se a troca é segura', description: 'A fonte atual continua ativa enquanto serviços, clientes, agendamentos e disponibilidade são analisados.', step: 1, body, back: toExternal ? 'migration-to-external-intro.html' : 'migration-to-atendly-intro.html', badge: '<span class="badge">Diagnóstico</span>' }));
  }

  function conflicts() {
    const conflicts = [
      ['Serviços', 'Campos obrigatórios ausentes', 'Manter para corrigir'],
      ['Clientes', 'Possíveis duplicidades por telefone', 'Mesclar após revisar'],
      ['Agendamentos futuros', 'Horários concorrentes', 'Manter fonte atual']
    ];
    const body = `${route()}<div class="migration-layout migration-content"><div class="migration-stack"><section class="migration-panel" data-od-id="migration-conflicts"><div class="migration-panel-header"><div><h2>Resolver por categoria</h2><p>Somente categorias com atenção aparecem aqui. Revise a recomendação antes de decidir.</p></div><span class="migration-status is-warning" data-conflict-status>${icon('alert')}3 categorias pendentes</span></div>${conflicts.map(([title, detail, recommendation], index) => `<section class="migration-conflict-group" data-conflict="${index}"><div class="migration-conflict-head"><div><h3>${title}</h3><p>${detail}</p></div><span class="badge">Recomendação segura</span></div><div class="migration-conflict-options" role="group" aria-label="Decisão para ${title}"><button class="migration-option" type="button" aria-pressed="false" data-resolution="${index}" data-value="recommended">${recommendation}</button><button class="migration-option" type="button" aria-pressed="false" data-resolution="${index}" data-value="review">Revisar individualmente</button></div></section>`).join('')}<div class="migration-actions is-split"><span class="migration-actions-note">Nenhuma decisão é aplicada antes da revisão final.</span><a class="btn btn-primary" href="${withTarget('migration-review.html')}" aria-disabled="true" tabindex="-1" data-conflicts-next>Revisar mudança</a></div></section></div>${sideNotes()}</div>`;
    shell(page({ title: 'Resolver diferenças antes do corte', description: 'Agrupe decisões por categoria para reduzir carga cognitiva e impedir alterações irreversíveis silenciosas.', step: 2, body, back: withTarget('migration-diagnosis.html') }));
  }

  function review() {
    const unavailableTransfer = toExternal && capability === 'unavailable';
    const rows = [
      ['Nova fonte oficial', targetName, 'A mudança só ocorre após o corte concluído.'],
      ['Dados copiados', unavailableTransfer ? 'Sem transferência automática' : 'Itens compatíveis e revisados', 'Quantidades reais aparecem no resultado.'],
      ['Histórico local', 'Permanece na Atendly', 'Conversas e histórico não são removidos.'],
      ['Itens não transferidos', 'Mantidos na fonte anterior', 'Nada é excluído automaticamente.'],
      ['Duração do corte', 'Ainda não informada', 'A estimativa só aparece quando o processo puder calculá-la.'],
      ['Operação durante o corte', 'Pode ficar temporariamente limitada', 'O estado exato é comunicado antes de iniciar.']
    ];
    const body = `${route()}<div class="migration-layout migration-content"><div class="migration-stack"><section class="migration-panel" data-od-id="migration-review"><div class="migration-panel-header"><div><h2>Revisão consciente</h2><p>Confira o destino e o impacto operacional antes de iniciar.</p></div><span class="migration-status is-warning">${icon('shield')}Sem exclusão automática</span></div><div class="migration-review">${rows.map(([label, value, help]) => `<div class="migration-review-row"><div><strong>${label}</strong><small>${help}</small></div><span class="migration-status">${value}</span></div>`).join('')}</div><label class="check migration-confirm"><input type="checkbox" data-migration-confirm><span class="check-box" aria-hidden="true"></span><span class="check-copy"><strong>Revisei a nova fonte e o impacto do corte</strong><span>Se a validação final falhar, ${sourceName} continua oficial.</span></span></label><div class="migration-actions"><a class="btn btn-secondary" href="${withTarget('migration-conflicts.html')}">Voltar aos conflitos</a><a class="btn btn-primary" href="${withTarget('migration-progress.html')}" aria-disabled="true" tabindex="-1" data-start-migration data-od-id="start-migration">Iniciar migração</a></div></section></div>${sideNotes()}</div>`;
    shell(page({ title: 'Revisar a mudança da fonte oficial', description: 'A confirmação inicia o corte assistido. A fonte anterior não será excluída automaticamente.', step: 2, body, back: withTarget('migration-conflicts.html') }));
  }

  function progress() {
    const body = `${route()}<div class="migration-layout migration-content"><div class="migration-stack"><section class="migration-process" aria-busy="true" aria-live="polite" data-od-id="migration-progress"><span class="migration-process-icon">${icon('refresh')}</span><h2>Migração em andamento</h2><p>A troca ainda não foi concluída. Evite alterar dados em ${sourceName} enquanto os agendamentos futuros são validados.</p><div class="migration-process-track" role="progressbar" aria-label="Progresso da migração" aria-valuetext="Validando agendamentos futuros"><span class="is-complete"></span><span class="is-complete"></span><span class="is-active"></span><span></span></div><p class="migration-current-step">Etapa atual: validar agendamentos futuros</p><div class="alert banner-warning migration-inline-state">${icon('alert')}<div><p class="alert-title">Operações temporariamente limitadas</p><p class="alert-text">Não confirme novas mudanças na fonte de agenda até o resultado. Se o corte falhar, ${sourceName} permanece oficial.</p></div></div><div class="migration-actions"><a class="btn btn-secondary" href="index.html">Acompanhar em segundo plano</a><a class="btn btn-primary" href="${withTarget('migration-success.html')}">Atualizar andamento</a></div></section></div>${sideNotes()}</div>`;
    shell(page({ title: 'Validando a nova fonte', description: 'O corte protege agendamentos e mantém a fonte anterior como referência até a conclusão.', step: 3, body, back: withTarget('migration-review.html'), badge: '<span class="badge badge-attention">Mudanças limitadas</span>' }));
  }

  function result(type) {
    const configs = {
      success: { icon: 'check', cls: '', title: `${targetName} agora é a fonte oficial`, copy: 'A validação e o corte foram concluídos. Novos agendamentos passam a ser confirmados no destino.', badge: '<span class="badge badge-success">Concluída</span>' },
      partial: { icon: 'alert', cls: 'is-warning', title: 'A migração precisa de correções', copy: `Os requisitos mínimos ainda não foram validados. ${sourceName} continua oficial e nenhum sucesso foi simulado.`, badge: '<span class="badge badge-attention">Ação necessária</span>' },
      error: { icon: 'x', cls: 'is-danger', title: 'Não foi possível concluir a migração', copy: `${sourceName} continua como fonte oficial. Nenhum horário foi apresentado como transferido ou confirmado.`, badge: '<span class="badge badge-danger">Falha</span>' }
    };
    const config = configs[type];
    const success = type === 'success';
    const partial = type === 'partial';
    const rows = success
      ? [['Fonte oficial', targetName, 'Corte concluído'], ['Itens transferidos', 'Resultado real do processo', 'Valores não são simulados'], ['Histórico local', 'Preservado na Atendly', 'Conversas mantidas'], ['Pendências críticas', 'Nenhuma neste estado', 'Pronto para testar']]
      : partial
        ? [['Fonte oficial', sourceName, 'Sem troca até corrigir'], ['Requisitos mínimos', 'Ainda não validados', 'Correção obrigatória'], ['Itens revisados', 'Preservados', 'Sem exclusão automática'], ['Próximo passo', 'Resolver pendências', 'Nova validação necessária']]
        : [['Fonte oficial', sourceName, 'Mantida sem alteração'], ['Corte', 'Não concluído', 'Sem confirmação de sucesso'], ['Dados anteriores', 'Preservados', 'Nada foi excluído'], ['Identificador', 'Não disponível', 'Exibido quando fornecido']];
    const actions = success
      ? `<a class="btn btn-secondary" href="appointment-new.html">Testar agendamento</a><a class="btn btn-primary" href="${toExternal ? 'dashboard-external.html' : 'dashboard-atendly.html'}">Ir para o Início</a>`
      : partial
        ? `<a class="btn btn-secondary" href="${settingsTarget}">Voltar para configurações</a><a class="btn btn-primary" href="${withTarget('migration-conflicts.html')}">Revisar pendências</a>`
        : `<a class="btn btn-secondary" href="${settingsTarget}">Voltar para configurações</a><a class="btn btn-primary" href="${withTarget('migration-progress.html')}">Tentar novamente</a>`;
    const body = `${route()}<div class="migration-layout migration-content"><div class="migration-stack"><section class="migration-result" data-od-id="migration-${type}"><span class="migration-result-mark ${config.cls}">${icon(config.icon)}</span>${config.badge}<h2>${config.title}</h2><p>${config.copy}</p><div class="migration-review">${rows.map(([label, value, help]) => `<div class="migration-review-row"><div><strong>${label}</strong><small>${help}</small></div><span class="migration-status ${partial && label === 'Requisitos mínimos' ? 'is-warning' : type === 'error' && label === 'Corte' ? 'is-danger' : ''}">${value}</span></div>`).join('')}</div><div class="migration-actions">${actions}</div></section></div>${sideNotes()}</div>`;
    shell(page({ title: success ? 'Migração concluída' : partial ? 'Resultado parcial' : 'Falha na migração', description: success ? 'A nova fonte foi ativada somente depois da validação bem-sucedida.' : 'A fonte anterior continua oficial enquanto o problema é resolvido.', step: 3, body, back: settingsTarget }));
  }

  const renderers = {
    'intro-atendly': intro,
    'intro-external': intro,
    'diagnosis': diagnosis,
    'diagnosis-external': diagnosis,
    conflicts,
    review,
    progress,
    success: () => result('success'),
    partial: () => result('partial'),
    error: () => result('error')
  };

  (renderers[screen] || intro)();

  const selectedResolutions = new Set();
  root.addEventListener('click', event => {
    const option = event.target.closest('[data-resolution]');
    if (option) {
      const group = option.dataset.resolution;
      root.querySelectorAll(`[data-resolution="${group}"]`).forEach(button => button.classList.toggle('is-selected', button === option));
      root.querySelectorAll(`[data-resolution="${group}"]`).forEach(button => button.setAttribute('aria-pressed', String(button === option)));
      selectedResolutions.add(group);
      const pending = Math.max(0, 3 - selectedResolutions.size);
      const status = root.querySelector('[data-conflict-status]');
      const next = root.querySelector('[data-conflicts-next]');
      if (status) status.innerHTML = pending ? `${icon('alert')}${pending} ${pending === 1 ? 'categoria pendente' : 'categorias pendentes'}` : `${icon('check')}Decisões revisadas`;
      if (pending === 0 && next) {
        next.removeAttribute('aria-disabled');
        next.removeAttribute('tabindex');
      }
    }
    const guardedLink = event.target.closest('a[aria-disabled="true"]');
    if (guardedLink) event.preventDefault();
  });

  const confirmation = root.querySelector('[data-migration-confirm]');
  const start = root.querySelector('[data-start-migration]');
  confirmation?.addEventListener('change', () => {
    if (!start) return;
    if (confirmation.checked) {
      start.removeAttribute('aria-disabled');
      start.removeAttribute('tabindex');
    } else {
      start.setAttribute('aria-disabled', 'true');
      start.setAttribute('tabindex', '-1');
    }
  });
})();
