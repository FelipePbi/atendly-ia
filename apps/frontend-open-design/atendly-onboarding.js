(function () {
  document.querySelectorAll('[data-onboarding-choice][aria-disabled="true"]').forEach(card => { card.disabled = true; });
  document.querySelectorAll('a[aria-disabled="true"]').forEach(link => link.setAttribute('tabindex', '-1'));
  document.querySelectorAll('.choice-card h3').forEach(heading => {
    const replacement = document.createElement('h2');
    replacement.innerHTML = heading.innerHTML;
    Array.from(heading.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value));
    heading.replaceWith(replacement);
  });
  document.querySelectorAll('.analysis-panel h3').forEach(heading => {
    const replacement = document.createElement('h2');
    replacement.innerHTML = heading.innerHTML;
    Array.from(heading.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value));
    heading.replaceWith(replacement);
  });

  document.addEventListener('click', event => {
    const disabledLink = event.target.closest('a[aria-disabled="true"]');
    if (disabledLink) { event.preventDefault(); return; }

    const day = event.target.closest('[data-day]');
    if (day) day.setAttribute('aria-pressed', String(day.getAttribute('aria-pressed') !== 'true'));

    const daysNext = event.target.closest('a[href="onboarding-hours.html"]');
    if (daysNext && !document.querySelector('[data-day][aria-pressed="true"]')) {
      event.preventDefault();
      let error = document.querySelector('[data-days-error]');
      if (!error) {
        error = document.createElement('div');
        error.className = 'onboarding-note is-important';
        error.dataset.daysError = '';
        error.setAttribute('role', 'alert');
        error.setAttribute('tabindex', '-1');
        error.textContent = 'Escolha pelo menos um dia de atendimento.';
        document.querySelector('.day-grid').after(error);
      }
      error.focus();
      return;
    }

    const card = event.target.closest('[data-onboarding-choice]');
    if (card && card.getAttribute('aria-disabled') !== 'true') {
      const group = card.closest('[role="radiogroup"]');
      group.querySelectorAll('[data-onboarding-choice]').forEach(item => {
        const selected = item === card;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-checked', String(selected));
      });
      const next = document.querySelector('[data-choice-next]');
      if (next) { next.href = card.dataset.next; next.removeAttribute('aria-disabled'); next.removeAttribute('tabindex'); next.classList.remove('is-disabled'); }
    }
  });

  document.querySelectorAll('[data-form-next]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const times = form.querySelectorAll('input[type="time"]');
      if (times.length === 2 && times[1].value <= times[0].value) {
        times[1].setCustomValidity('O horário final precisa ser depois do inicial.');
        times[1].setAttribute('aria-invalid', 'true');
        times[1].reportValidity();
        times[1].addEventListener('input', () => { times[1].setCustomValidity(''); times[1].removeAttribute('aria-invalid'); }, { once: true });
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Salvando';
      setTimeout(() => { location.href = form.dataset.formNext; }, 500);
    });
  });

  const consult = document.querySelector('[data-consult-toggle]');
  if (consult) consult.addEventListener('change', () => {
    const price = document.querySelector('[data-price-input]');
    price.disabled = consult.checked;
    price.required = !consult.checked;
  });

  const price = document.querySelector('[data-price-input]');
  if (price) price.addEventListener('input', () => {
    const digits = price.value.replace(/\D/g, '').slice(0, 8);
    price.value = digits ? (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
  });

  const progress = document.querySelector('[data-import-progress]');
  if (progress) {
    const bar = progress.querySelector('.progress-bar');
    const label = progress.querySelector('[data-progress-label]');
    const next = document.querySelector('[data-progress-next]');
    label.setAttribute('aria-live', 'polite');
    let value = 12;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) value = 89;
    const timer = setInterval(() => {
      value = Math.min(100, value + 11);
      bar.style.width = value + '%';
      bar.parentElement.setAttribute('aria-valuenow', String(value));
      label.textContent = value < 100 ? 'Copiando dados com segurança…' : 'Importação concluída';
      if (value >= 100) { clearInterval(timer); next.disabled = false; next.removeAttribute('aria-disabled'); }
    }, 260);
  }

  if (location.pathname.endsWith('onboarding-import-analysis.html')) {
    const next = document.querySelector('a[href="onboarding-import-preview.html"]');
    const title = document.querySelector('.analysis-panel h2');
    const copy = document.querySelector('.analysis-panel p');
    next.setAttribute('aria-disabled', 'true');
    next.setAttribute('tabindex', '-1');
    setTimeout(() => {
      next.removeAttribute('aria-disabled');
      next.removeAttribute('tabindex');
      title.textContent = 'Prévia preparada';
      copy.textContent = 'Nenhum dado foi alterado. A prévia está pronta para revisão.';
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 1200);
  }

  if (location.pathname.endsWith('onboarding-external-authenticating.html')) {
    const next = document.querySelector('[data-auth-next]');
    const title = document.querySelector('.analysis-panel h2');
    const copy = document.querySelector('.analysis-panel p');
    next.disabled = true;
    next.setAttribute('aria-busy', 'true');
    setTimeout(() => {
      title.textContent = 'Conexão confirmada';
      copy.textContent = 'A Minha Agenda respondeu. Você pode revisar o estado da conexão.';
      next.disabled = false;
      next.removeAttribute('aria-busy');
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 1200);
  }
})();
