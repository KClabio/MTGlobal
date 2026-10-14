// Back link: points at the previous *page* this tab visited on the site (not history.back(),
// which would also undo same-page state changes such as switching VI <-> EN).
// Falls back to the server-rendered parent-list href when there is no in-site history.
(function () {
  var KEY = 'mtgTrail';
  var BACK_KEY = 'mtgBackTo';

  // A "page" is its path + query, ignoring ?lang= so a language switch is not a new page
  function pageKey(href) {
    var u = new URL(href, window.location.origin);
    u.searchParams.delete('lang');
    return u.pathname + u.search;
  }

  function update(e) {
    var trail = [];
    var backTo = null;
    try {
      trail = JSON.parse(sessionStorage.getItem(KEY)) || [];
      backTo = sessionStorage.getItem(BACK_KEY);
      sessionStorage.removeItem(BACK_KEY);
    } catch (err) { /* storage unavailable */ }

    var here = pageKey(window.location.href);
    var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    // Only a real "go back" (our Back link or the browser's back button) steps back in the trail;
    // reopening a page normally is a new step, even if it was visited before
    var wentBack = backTo === here || (e && e.persisted) || (nav && nav.type === 'back_forward');

    if (trail[trail.length - 1] !== here) { // same page (reload / VI <-> EN / form post) leaves the trail unchanged
      if (wentBack && trail[trail.length - 2] === here) trail.pop();
      else trail.push(here);
    }
    trail = trail.slice(-30);
    try { sessionStorage.setItem(KEY, JSON.stringify(trail)); } catch (e) { /* storage unavailable */ }

    var prev = trail[trail.length - 2];
    if (!prev) return;
    document.querySelectorAll('[data-back]').forEach(function (link) {
      link.setAttribute('href', prev);
    });
  }

  document.querySelectorAll('[data-back]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { sessionStorage.setItem(BACK_KEY, pageKey(link.href)); } catch (err) { /* storage unavailable */ }
    });
  });

  // pageshow also fires when a page is restored from the back/forward cache
  window.addEventListener('pageshow', update);
})();

// Request form gatekeeping: name and message required, plus a phone number OR an email.
// Mirrors the server-side rules in routes/index.js (validateQuoteRequest), which stay authoritative.
(function () {
  var PHONE_RE = /^[0-9+()\-.\s]{8,20}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var NUMBER_RE = /^\d{1,12}([.,]\d{1,4})?$/;

  document.querySelectorAll('[data-quote-form]').forEach(function (form) {
    var hint = form.querySelector('[data-contact-hint]');
    var field = function (name) { return form.elements[name]; };
    var value = function (name) { return field(name) ? field(name).value.trim() : ''; };

    function clearError(name) {
      var input = field(name);
      if (!input) return;
      input.classList.remove('is-invalid');
      var msg = input.parentNode.querySelector('[data-error-for="' + name + '"]');
      if (msg) msg.remove();
    }

    function setError(name, text) {
      var input = field(name);
      input.classList.add('is-invalid');
      if (!text) return;
      var msg = document.createElement('div');
      msg.className = 'field-error';
      msg.setAttribute('data-error-for', name);
      msg.textContent = text;
      input.parentNode.appendChild(msg);
    }

    function setContactError(on) {
      if (!hint) return;
      hint.classList.toggle('is-error', on);
      hint.textContent = '* ' + (on ? form.dataset.errContact : hint.dataset.hint);
    }

    form.addEventListener('submit', function (e) {
      ['name', 'phone', 'email', 'message'].forEach(clearError);
      setContactError(false);
      var invalid = [];

      if (!value('name')) { setError('name', form.dataset.errName); invalid.push('name'); }
      if (!value('phone') && !value('email')) {
        setError('phone'); setError('email'); setContactError(true); invalid.push('phone');
      } else {
        if (value('phone') && !PHONE_RE.test(value('phone'))) { setError('phone', form.dataset.errPhone); invalid.push('phone'); }
        if (value('email') && !EMAIL_RE.test(value('email'))) { setError('email', form.dataset.errEmail); invalid.push('email'); }
      }
      if (!value('message')) { setError('message', form.dataset.errMessage); invalid.push('message'); }

      // A service's own questions: required ones must be answered, number answers must be numbers
      form.querySelectorAll('[data-required-answer], [data-answer-number]').forEach(function (input) {
        clearError(input.name);
        var v = input.value.trim();
        if (!v && input.hasAttribute('data-required-answer')) { setError(input.name, form.dataset.errAnswer); invalid.push(input.name); }
        else if (v && input.hasAttribute('data-answer-number') && !NUMBER_RE.test(v)) { setError(input.name, form.dataset.errNumber); invalid.push(input.name); }
      });

      if (invalid.length) {
        e.preventDefault();
        field(invalid[0]).focus();
      }
    });

    form.querySelectorAll('[data-required-answer], [data-answer-number]').forEach(function (input) {
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', function () { clearError(input.name); });
    });

    ['name', 'phone', 'email', 'message'].forEach(function (name) {
      if (!field(name)) return;
      field(name).addEventListener('input', function () {
        clearError(name);
        if ((name === 'phone' || name === 'email') && hint && hint.classList.contains('is-error')) {
          clearError(name === 'phone' ? 'email' : 'phone');
          setContactError(false);
        }
      });
    });
  });
})();

// Profile page: live avatar preview and bio character counter
(function () {
  document.querySelectorAll('[data-avatar-input]').forEach(function (input) {
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      var preview = input.form.querySelector('[data-avatar-preview]');
      var picker = input.closest('.avatar-picker');
      var oldError = picker && picker.querySelector('[data-avatar-error]');
      if (oldError) oldError.remove();
      if (!file || !preview) return;

      // Reject an oversized photo right away instead of uploading it only to be refused by the server
      var maxBytes = Number(input.getAttribute('data-max-bytes')) || 0;
      if (maxBytes && file.size > maxBytes) {
        input.value = '';
        var error = document.createElement('div');
        error.className = 'field-error';
        error.setAttribute('data-avatar-error', '');
        error.textContent = input.getAttribute('data-size-error');
        input.closest('label').parentNode.appendChild(error);
        return;
      }
      if (preview.tagName !== 'IMG') {
        var img = document.createElement('img');
        img.className = 'avatar-sm';
        img.alt = '';
        img.setAttribute('data-avatar-preview', '');
        preview.replaceWith(img);
        preview = img;
      }
      preview.src = URL.createObjectURL(file);
      var remove = input.form.querySelector('[name="removeAvatar"]');
      if (remove) remove.checked = false; // a new photo replaces the old one
    });
  });

  document.querySelectorAll('[data-count]').forEach(function (field) {
    var counter = document.getElementById(field.getAttribute('data-count'));
    if (!counter) return;
    field.addEventListener('input', function () { counter.textContent = field.value.length; });
  });
})();

(function () {
  var toggle = document.getElementById('navToggle');
  if (!toggle) return;
  toggle.addEventListener('click', function () {
    document.body.classList.toggle('nav-open');
  });

  document.querySelectorAll('.nav-dropdown-trigger').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var menu = btn.nextElementSibling;
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      if (menu) menu.style.display = expanded ? 'none' : 'flex';
    });
  });
})();

// Service packages: "Choose this package" picks it in the request form and moves to the form
(function () {
  document.querySelectorAll('[data-choose-package]').forEach(function (link) {
    link.addEventListener('click', function () {
      var select = document.getElementById('q__package');
      if (!select) return;
      select.value = link.getAttribute('data-choose-package');
      setTimeout(function () { select.focus({ preventScroll: true }); }, 0);
    });
  });
})();
