(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function enhancePageStructure() {
    const main = $('main');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    if (!$('a[href="#' + main.id + '"]')) {
      const skip = document.createElement('a');
      skip.className = 'skip-link';
      skip.href = '#' + main.id;
      skip.textContent = 'Ir para o conteúdo';
      document.body.prepend(skip);
    }
    $$('.brand-mark:not([aria-hidden])').forEach(mark => mark.setAttribute('aria-hidden', 'true'));
  }

  enhancePageStructure();

  function syncOverlayState() {
    document.body.classList.toggle('has-overlay', $$('.overlay').some(panel => !panel.classList.contains('hidden')));
  }

  function closeOverlay(panel) {
    if (!panel) return;
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    const trigger = $('[data-open="' + panel.id + '"]');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    syncOverlayState();
    if (panel._returnFocus) panel._returnFocus.focus();
  }

  function closePanels(except, restoreFocus = false) {
    $$('[data-panel]').forEach(panel => {
      if (panel !== except) {
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        const trigger = $('[data-toggle="' + panel.id + '"]');
        if (trigger) {
          trigger.setAttribute('aria-expanded', 'false');
          if (restoreFocus && panel.contains(document.activeElement)) trigger.focus();
        }
      }
    });
  }

  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const panel = document.getElementById(toggle.dataset.toggle);
      if (!panel) return;
      const willOpen = panel.classList.contains('hidden');
      closePanels(panel);
      panel.classList.toggle('hidden', !willOpen);
      panel.setAttribute('aria-hidden', String(!willOpen));
      toggle.setAttribute('aria-expanded', String(willOpen));
      return;
    }

    const open = event.target.closest('[data-open]');
    if (open) {
      const panel = document.getElementById(open.dataset.open);
      if (panel) {
        panel._returnFocus = open;
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        if (open.hasAttribute('aria-expanded')) open.setAttribute('aria-expanded', 'true');
        syncOverlayState();
        const focusTarget = $('[data-autofocus]', panel) || $('button, input, select, textarea', panel);
        if (focusTarget) setTimeout(() => focusTarget.focus(), 20);
      }
      return;
    }

    const close = event.target.closest('[data-close]');
    if (close) {
      const panel = close.closest('.overlay, [data-panel]');
      if (panel?.classList.contains('overlay')) closeOverlay(panel);
      else if (panel) {
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        const trigger = $('[data-toggle="' + panel.id + '"]');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
      return;
    }

    const choice = event.target.closest('.choice-card');
    if (choice) {
      if (choice.getAttribute('aria-disabled') === 'true') return;
      $$('.choice-card', choice.parentElement).forEach(item => {
        item.classList.toggle('is-selected', item === choice);
        item.setAttribute('aria-checked', String(item === choice));
      });
      return;
    }

    const tab = event.target.closest('.tab');
    if (tab) {
      $$('.tab', tab.parentElement).forEach(item => {
        item.classList.toggle('is-active', item === tab);
        item.setAttribute('aria-selected', String(item === tab));
      });
      return;
    }

    const chip = event.target.closest('.chip');
    if (chip) {
      chip.classList.toggle('is-active');
      chip.setAttribute('aria-pressed', String(chip.classList.contains('is-active')));
      return;
    }

    const bottomNav = event.target.closest('.bottom-nav-item:not([data-open])');
    if (bottomNav) {
      $$('.bottom-nav-item', bottomNav.parentElement).forEach(item => {
        item.classList.toggle('is-active', item === bottomNav);
        if (item === bottomNav) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      return;
    }

    const placeholderNav = event.target.closest('.nav-item[href="#"]');
    if (placeholderNav) {
      event.preventDefault();
      $$('.nav-item', placeholderNav.closest('.sidebar')).forEach(item => {
        item.classList.toggle('is-active', item === placeholderNav);
        if (item === placeholderNav) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      return;
    }

    const password = event.target.closest('[data-password-toggle]');
    if (password) {
      const input = document.getElementById(password.dataset.passwordToggle);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      password.setAttribute('aria-label', input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha');
      return;
    }

    const loading = event.target.closest('[data-loading-demo]');
    if (loading) {
      const original = loading.innerHTML;
      loading.style.width = loading.getBoundingClientRect().width + 'px';
      loading.disabled = true;
      loading.classList.add('btn-loading');
      loading.innerHTML = '<span class="spinner" aria-hidden="true"></span>Salvando';
      setTimeout(() => {
        loading.innerHTML = original;
        loading.disabled = false;
        loading.classList.remove('btn-loading');
        loading.style.removeProperty('width');
        showToast('Alterações salvas');
      }, 1300);
      return;
    }

    if (event.target.classList.contains('overlay') && event.target.getAttribute('role') !== 'alertdialog') {
      closeOverlay(event.target);
      return;
    }

    if (!event.target.closest('.dropdown')) closePanels();
  });

  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.choice-card')) {
      event.preventDefault();
      event.target.click();
    }
    if (event.key === 'Escape') {
      closePanels(undefined, true);
      const openOverlays = $$('.overlay').filter(panel => !panel.classList.contains('hidden'));
      if (openOverlays.length) closeOverlay(openOverlays[openOverlays.length - 1]);
    }
    if (event.target.matches('.tab') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const tabs = $$('.tab', event.target.parentElement).filter(tab => !tab.disabled);
      if (!tabs.length) return;
      event.preventDefault();
      const current = tabs.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    }
    if (event.target.matches('[role="radio"]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const group = event.target.closest('[role="radiogroup"]');
      const radios = group ? $$('[role="radio"]', group).filter(item => item.getAttribute('aria-disabled') !== 'true') : [];
      if (!radios.length) return;
      event.preventDefault();
      const current = radios.indexOf(event.target);
      const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
      const next = (current + (forward ? 1 : -1) + radios.length) % radios.length;
      radios[next].focus();
      radios[next].click();
    }
    if (event.key === 'Tab') {
      const panel = $$('.overlay').find(item => !item.classList.contains('hidden'));
      if (!panel) return;
      const focusables = $$(focusableSelector, panel);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  function showToast(message) {
    const old = $('.toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<svg class="icon" aria-hidden="true"><use href="atendly-icons.svg#i-check"></use></svg><span></span>';
    $('span', toast).textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  window.AtendlyUI = { showToast };
})();
