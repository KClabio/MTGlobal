// Light/dark theme switch (website + admin share one preference, stored in the "theme" cookie).
// The server renders <html data-theme> from the cookie, so pages never flash the wrong theme.
(function () {
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-theme-toggle]');
    if (!toggle) return;
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.cookie = 'theme=' + next + '; path=/; max-age=31536000; samesite=lax';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (t) {
      t.setAttribute('aria-checked', String(next === 'dark'));
    });
  });
})();
