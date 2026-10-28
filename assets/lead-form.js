// Shared lead form handler for all templates.
// Markup contract:
//   <form data-lead-form action="/api/lead" novalidate> ... </form>
//   each field:  <input name="x" required>  +  <p data-error-for="x"></p>
//   status line: <p data-form-status role="status"></p>
//   submit:      <button type="submit">
// The form gets the class "is-sending", "is-sent" or "is-failed" so each template can style the states.
(function () {
  var MESSAGES = {
    required: 'Please fill in this field.',
    email: 'Please enter a valid email address.',
    phone: 'Please enter a phone number with country code.',
    consent: 'Please accept to continue.',
    sent: 'Thank you. We will contact you within 15 minutes in working hours.',
    failed: 'We could not send your request. Please try again, or message us on WhatsApp.'
  };

  function fieldError(field) {
    if (field.type === 'checkbox') return field.required && !field.checked ? MESSAGES.consent : '';
    var v = field.value.trim();
    if (field.required && !v) return MESSAGES.required;
    if (v && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return MESSAGES.email;
    if (v && field.type === 'tel' && v.replace(/\D/g, '').length < 7) return MESSAGES.phone;
    return '';
  }

  function showError(form, field, msg) {
    var slot = form.querySelector('[data-error-for="' + field.name + '"]');
    if (slot) slot.textContent = msg;
    field.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function utm() {
    var p = new URLSearchParams(location.search), out = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
      if (p.get(k)) out[k] = p.get(k);
    });
    return out;
  }

  document.querySelectorAll('form[data-lead-form]').forEach(function (form) {
    var status = form.querySelector('[data-form-status]');
    var button = form.querySelector('button[type="submit"]');

    form.addEventListener('blur', function (e) {
      if (e.target.name && e.target.dataset.touched) showError(form, e.target, fieldError(e.target));
    }, true);
    form.addEventListener('input', function (e) {
      if (!e.target.name) return;
      e.target.dataset.touched = '1';
      if (e.target.getAttribute('aria-invalid') === 'true') showError(form, e.target, fieldError(e.target));
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = Array.prototype.slice.call(form.elements).filter(function (f) { return f.name; });
      var firstBad = null;
      fields.forEach(function (f) {
        var msg = fieldError(f);
        showError(form, f, msg);
        if (msg && !firstBad) firstBad = f;
      });
      if (firstBad) { firstBad.focus(); return; }

      var data = {};
      fields.forEach(function (f) { data[f.name] = f.type === 'checkbox' ? f.checked : f.value.trim(); });
      data.page = location.pathname;
      data.utm = utm();

      form.classList.remove('is-sent', 'is-failed');
      form.classList.add('is-sending');
      button.disabled = true;
      if (status) status.textContent = '';

      fetch(form.getAttribute('action') || '/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        form.classList.add('is-sent');
        if (status) status.textContent = MESSAGES.sent;
        form.reset();
        form.dispatchEvent(new CustomEvent('lead:sent', { bubbles: true }));
      }).catch(function () {
        form.classList.add('is-failed');
        if (status) status.textContent = MESSAGES.failed;
      }).finally(function () {
        form.classList.remove('is-sending');
        button.disabled = false;
      });
    });
  });
})();
