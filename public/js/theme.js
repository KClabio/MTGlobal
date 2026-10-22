// Light/dark theme switch (website + admin share one preference, stored in the "theme" cookie).
// The server renders <html data-theme> from the cookie, so pages never flash the wrong theme.
// The switch fades the page from the old colours to the new ones: a view transition where the browser has one,
// otherwise a short colour transition on every element (html.theme-fading, base.css), removed right after.
(function () {
  var root = document.documentElement;
  var FADE_MS = 450; // a little longer than the slowest fade in base.css

  function apply(next) {
    root.setAttribute('data-theme', next);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (t) {
      t.setAttribute('aria-checked', String(next === 'dark'));
    });
  }

  // The fade makes the browser forget the pointer is over the account menu (it opens on hover), so the menu would
  // close under the pointer: hold it open (.is-held, layout.css) until the pointer is somewhere else
  function holdMenu(toggle) {
    var menu = toggle.closest('.user-menu');
    if (!menu) return;
    menu.classList.add('is-held');
    document.addEventListener('pointermove', function release(e) {
      if (menu.contains(e.target)) return;
      menu.classList.remove('is-held');
      document.removeEventListener('pointermove', release);
    });
  }

  var fadeTimer = null;
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-theme-toggle]');
    if (!toggle) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.cookie = 'theme=' + next + '; path=/; max-age=31536000; samesite=lax';
    if (document.startViewTransition && !root.classList.contains('theme-switching')) {
      holdMenu(toggle);
      root.classList.add('theme-switching'); // tells base.css this transition is the theme fade
      var done = function () { root.classList.remove('theme-switching'); };
      var vt = document.startViewTransition(function () { apply(next); });
      vt.finished.then(done, done);
      return;
    }
    root.classList.add('theme-fading');
    apply(next);
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { root.classList.remove('theme-fading'); }, FADE_MS);
  });
})();
