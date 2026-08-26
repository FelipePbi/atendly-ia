(function () {
  const forms = document.querySelectorAll('[data-auth-form]');
  forms.forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const passwords = form.querySelectorAll('input[type="password"]');
      if (passwords.length === 2 && passwords[0].value !== passwords[1].value) {
        passwords[1].setCustomValidity('As senhas precisam ser iguais.');
        passwords[1].setAttribute('aria-invalid', 'true');
        passwords[1].reportValidity();
        passwords[1].addEventListener('input', () => { passwords[1].setCustomValidity(''); passwords[1].removeAttribute('aria-invalid'); }, { once: true });
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      const original = button.innerHTML;
      form.setAttribute('aria-busy', 'true');
      button.disabled = true;
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + (form.dataset.loading || 'Processando');
      setTimeout(() => {
        const isSignup = location.pathname.endsWith('auth-signup.html');
        const isLogin = location.pathname.endsWith('auth-login.html');
        const destination = isSignup ? 'onboarding-business.html' : isLogin ? 'dashboard-atendly.html' : form.dataset.destination;
        if (destination) window.location.href = destination;
        else {
          button.innerHTML = original;
          button.disabled = false;
          form.removeAttribute('aria-busy');
          window.AtendlyUI?.showToast(isSignup ? 'Conta pronta para a próxima etapa' : 'Dados verificados');
        }
      }, 650);
    });
  });
})();
