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
      // A server link with a #part (equipment detail -> its Phần tab) keeps that part when going back to the same list
      var home = link.getAttribute('data-home') || link.getAttribute('href') || '';
      link.setAttribute('data-home', home);
      var hash = home.indexOf('#') > 0 ? home.slice(home.indexOf('#')) : '';
      link.setAttribute('href', hash && pageKey(home) === prev ? prev + hash : prev);
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
})();

// Header dropdowns (menu groups and the account menu) open while hovered (CSS :hover). A mouse click never pins one
// open. Keyboard users get the same menu: focus arriving by keyboard adds .is-kbd-open, which stays until focus has
// really left the menu (checked after the focus move, so Tab can step from the title into the links). Esc closes it.
(function () {
  var keyboard = false;
  document.addEventListener('keydown', function (e) { if (!e.altKey && !e.ctrlKey && !e.metaKey) keyboard = true; }, true);
  document.addEventListener('pointerdown', function () { keyboard = false; }, true);

  document.querySelectorAll('.nav-dropdown, .user-menu').forEach(function (menu) {
    var btn = menu.querySelector('.nav-dropdown-trigger, .user-menu-trigger');
    var hovered = false;
    function sync() {
      if (btn) btn.setAttribute('aria-expanded', String(hovered || menu.classList.contains('is-kbd-open')));
    }
    menu.addEventListener('mouseenter', function () { hovered = true; sync(); });
    menu.addEventListener('mouseleave', function () { hovered = false; sync(); });
    menu.addEventListener('focusin', function () {
      if (keyboard) menu.classList.add('is-kbd-open');
      sync();
    });
    menu.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!menu.contains(document.activeElement)) menu.classList.remove('is-kbd-open');
        sync();
      }, 0);
    });
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-kbd-open')) {
        menu.classList.remove('is-kbd-open');
        keyboard = false; // returning focus to the title must not reopen the menu
        if (btn) btn.focus();
        sync();
      }
    });
    sync();
  });
})();

// Password boxes: the eye button shows / hides what was typed (partials/password-input.ejs). Every box goes back to
// hidden when its form is sent (so the browser saves it as a password) and when the page comes back from history.
(function () {
  function setShown(btn, shown) {
    var input = document.getElementById(btn.getAttribute('aria-controls'));
    if (!input) return;
    input.type = shown ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(shown));
    var label = btn.getAttribute(shown ? 'data-label-hide' : 'data-label-show');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    // (SVG elements have no .hidden property: switch the attribute itself)
    btn.querySelector('.icon-eye').toggleAttribute('hidden', shown);
    btn.querySelector('.icon-eye-off').toggleAttribute('hidden', !shown);
  }
  function hideAll(scope) {
    scope.querySelectorAll('[data-password-toggle]').forEach(function (btn) { setShown(btn, false); });
  }
  document.querySelectorAll('[data-password-toggle]').forEach(function (btn) {
    // Keep the cursor in the box: the button does not take focus on a mouse press
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('aria-controls'));
      if (!input) return;
      var start = input.selectionStart;
      var end = input.selectionEnd;
      setShown(btn, input.type === 'password');
      if (document.activeElement === input && start !== null) {
        try { input.setSelectionRange(start, end); } catch (err) { /* type without selection */ }
      }
    });
    if (btn.form || btn.closest('form')) {
      (btn.form || btn.closest('form')).addEventListener('submit', function (e) { hideAll(e.target); });
    }
  });
  window.addEventListener('pageshow', function () { hideAll(document); });
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

// Home "Lĩnh vực hoạt động" slider: the mouse wheel over the cards scrolls them sideways and never the page (at the
// first/last card it simply does nothing; over the title and around the cards the page scrolls as usual), arrow
// buttons and ← / → step one card, the mouse can drag and throw it, and it always comes
// to rest on a card edge. Every move is a smooth, time-based slide. The position is kept for the "← Về trang chủ"
// link that pages opened from a card show (it returns to /#linh-vuc).
(function () {
  var track = document.querySelector('[data-domain-slider]');
  if (!track) return;
  var section = track.closest('section');
  var prev = section.querySelector('[data-domain-prev]');
  var next = section.querySelector('[data-domain-next]');
  var POS_KEY = 'mtgDomainScroll';
  // The visitor asked the system for less motion: keep sliding (never jump) but make every slide shorter
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SPEED = reduceMotion ? 0.6 : 1;
  var STEP_MS = 450 * SPEED;
  var WHEEL_MS = 350 * SPEED;
  var SETTLE_MS = 300 * SPEED;
  var THROW_MS = 320 * SPEED; // how far a mouse throw carries: release speed × this

  function maxScroll() { return track.scrollWidth - track.clientWidth; }
  function step() {
    var item = track.querySelector('.domain-item');
    var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return item ? item.getBoundingClientRect().width + gap : track.clientWidth / 2;
  }
  // Where the slider may rest: the left edge of every card, plus the very end
  function edges() {
    var s = step();
    var max = maxScroll();
    var list = [];
    for (var x = 0; x < max - 1; x += s) list.push(x);
    list.push(max);
    return list;
  }
  // Nearest resting edge; `dir` (-1 / 1) leans toward the direction of travel
  function edgeNear(x, dir) {
    var list = edges();
    var s = step();
    var best = list[0];
    list.forEach(function (e) {
      var d = Math.abs(e - x) + (dir && (e - x) * dir < 0 ? s * 0.25 : 0);
      var bd = Math.abs(best - x) + (dir && (best - x) * dir < 0 ? s * 0.25 : 0);
      if (d < bd) best = e;
    });
    return best;
  }
  // First resting edge at or beyond x in the direction of travel (a single wheel notch still moves one card)
  function edgeAhead(x, dir) {
    var list = edges();
    if (dir > 0) { for (var i = 0; i < list.length; i++) if (list[i] >= x - 2) return list[i]; return list[list.length - 1]; }
    for (var j = list.length - 1; j >= 0; j--) if (list[j] <= x + 2) return list[j];
    return list[0];
  }
  function updateArrows() {
    if (prev) prev.disabled = track.scrollLeft <= 1;
    if (next) next.disabled = track.scrollLeft >= maxScroll() - 1;
  }

  // ---- One animator for every move ----
  // A cubic Hermite curve from the current position and speed to the target (ending at rest). Starting from rest it
  // is an ease-in-out; with a start speed of 3·distance/duration it is exactly an ease-out. A new move mid-slide starts
  // from the current position *and speed*, so repeated clicks or wheel ticks blend into one continuous glide.
  // The position is kept as a float: the browser rounds scrollLeft, which would stall the last pixels.
  var anim = null; // { from, to, v0 (px/ms), start, dur }
  var frame = null;
  function posAt(a, now) {
    var t = Math.min(1, (now - a.start) / a.dur);
    var d = a.to - a.from;
    return { t: t, x: a.from + d * (3 * t * t - 2 * t * t * t) + a.v0 * a.dur * (t * t * t - 2 * t * t + t),
      v: (d * (6 * t - 6 * t * t) + a.v0 * a.dur * (3 * t * t - 4 * t + 1)) / a.dur };
  }
  function tick(now) {
    var p = posAt(anim, now);
    if (p.t >= 1) { track.scrollLeft = anim.to; anim = null; frame = null; return; }
    track.scrollLeft = p.x;
    frame = requestAnimationFrame(tick);
  }
  function current() {
    if (!anim) return { x: track.scrollLeft, v: 0 };
    return posAt(anim, performance.now());
  }
  // style 'out' = ease-out from rest (wheel, settle); 'inout' = ease-in-out (arrows, keys)
  function slideTo(x, dur, style, startSpeed) {
    x = Math.max(0, Math.min(maxScroll(), x));
    var now = performance.now();
    var c = current();
    var d = x - c.x;
    if (Math.abs(d) < 0.5) {
      if (anim) { cancelAnimationFrame(frame); frame = null; anim = null; }
      track.scrollLeft = x;
      return;
    }
    var v0 = startSpeed !== undefined ? startSpeed : (anim ? c.v : (style === 'out' ? 3 * d / dur : 0));
    // Keep the curve monotonic (no overshoot past the target): at most an ease-out's start speed
    if (v0 * d > 0) v0 = Math.sign(d) * Math.min(Math.abs(v0), 3 * Math.abs(d) / dur);
    anim = { from: c.x, to: x, v0: v0, start: now, dur: dur };
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    anim = null;
  }
  function destination() { return anim ? anim.to : track.scrollLeft; }

  // ---- Mouse wheel: ticks add up into one glide, then it settles on the next card edge in that direction ----
  var settleTimer = null;
  var wheelDir = 0;
  track.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return; // pinch / page zoom
    // Horizontal trackpad swipes scroll the track natively
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // While the pointer is over the cards the wheel belongs to the slider only: the page never scrolls from here
    e.preventDefault();
    var dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? track.clientWidth : 1);
    var from = destination();
    // Already at the start/end in the wheel's direction: nothing to do
    if ((dy < 0 && from <= 1) || (dy > 0 && from >= maxScroll() - 1)) return;
    wheelDir = dy > 0 ? 1 : -1;
    slideTo(from + dy, WHEEL_MS, 'out');
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () {
      slideTo(edgeAhead(destination(), wheelDir), SETTLE_MS, 'out');
    }, 150);
  }, { passive: false });

  // ---- Arrows and keys: one card per press; fast presses carry on without restarting ----
  function stepBy(dir) {
    clearTimeout(settleTimer);
    var list = edges();
    var from = destination();
    var i = 0;
    list.forEach(function (e, k) { if (Math.abs(e - from) < Math.abs(list[i] - from)) i = k; });
    var j = Math.max(0, Math.min(list.length - 1, i + dir));
    slideTo(list[j], STEP_MS, 'inout');
  }
  if (prev) prev.addEventListener('click', function () { stepBy(-1); });
  if (next) next.addEventListener('click', function () { stepBy(1); });
  track.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      stepBy(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  // ---- Mouse drag: follows the pointer, then a throw keeps its speed, slows down and settles on a card edge ----
  // (touch screens swipe natively); a real drag does not open the card under the pointer
  var drag = null;
  var dragged = false;
  track.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: track.scrollLeft, id: e.pointerId, samples: [] };
    dragged = false;
  });
  track.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x;
    if (!dragged && Math.abs(dx) > 5) {
      dragged = true;
      clearTimeout(settleTimer);
      stop();
      drag.left = track.scrollLeft + dx; // continue from where a running slide was stopped
      track.classList.add('is-dragging');
      track.setPointerCapture(drag.id);
    }
    if (!dragged) return;
    var x = Math.max(0, Math.min(maxScroll(), drag.left - dx));
    track.scrollLeft = x;
    var now = performance.now();
    drag.samples.push({ t: now, x: x });
    while (drag.samples.length > 2 && now - drag.samples[0].t > 100) drag.samples.shift();
  });
  function endDrag(e) {
    if (!drag) return;
    var d = drag;
    drag = null;
    track.classList.remove('is-dragging');
    if (!dragged) return;
    // Release speed over the last ~100 ms (0 if the pointer was held still)
    var v = 0;
    var s = d.samples;
    if (s.length >= 2 && performance.now() - s[s.length - 1].t < 60) {
      var a = s[0];
      var b = s[s.length - 1];
      if (b.t > a.t) v = (b.x - a.x) / (b.t - a.t);
    }
    var here = track.scrollLeft;
    var dir = v > 0.05 ? 1 : v < -0.05 ? -1 : 0;
    var to = edgeNear(here + v * THROW_MS, dir);
    var dist = Math.abs(to - here);
    // Long enough for the throw to slow down naturally, short enough to feel responsive
    var dur = Math.abs(v) > 0.05 ? Math.max(SETTLE_MS, Math.min(900 * SPEED, 2.5 * dist / Math.abs(v))) : SETTLE_MS;
    slideTo(to, dur, 'out', (to - here) * v > 0 ? v : 0);
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('click', function (e) {
    if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
  }, true);

  track.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', function () { stop(); updateArrows(); });

  // Remember where the slider was when a card is opened, and restore it on the way back (/#linh-vuc)
  track.querySelectorAll('.domain-card').forEach(function (card) {
    card.addEventListener('click', function () {
      try { sessionStorage.setItem(POS_KEY, String(destination())); } catch (err) { /* storage unavailable */ }
    });
  });
  if (window.location.hash === '#linh-vuc') {
    try {
      var saved = parseFloat(sessionStorage.getItem(POS_KEY));
      if (!isNaN(saved)) track.scrollLeft = Math.min(saved, maxScroll());
    } catch (err) { /* storage unavailable */ }
  }
  updateArrows();
})();

// STEM equipment catalog: one Phần per tab (Phần I first, #phan-N opens another) plus a search across every part.
// Without JS the page keeps showing all parts as one list (the tools and tab panels are only switched on here).
(function () {
  var tools = document.querySelector('[data-equip-tools]');
  if (!tools) return;
  var tabs = Array.prototype.slice.call(tools.querySelectorAll('[role="tab"]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('[data-panel]'));
  var input = tools.querySelector('[data-equip-search]');
  var results = document.querySelector('[data-equip-results]');
  var grid = results.querySelector('[data-equip-grid]');
  var count = results.querySelector('[data-equip-count]');
  var empty = results.querySelector('[data-equip-empty]');
  var current = null;

  // Accents and case don't matter: "may in" finds "Máy in"
  function fold(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  }

  function select(slug, focus) {
    var tab = tabs.filter(function (t) { return t.getAttribute('data-tab') === slug; })[0] || tabs[0];
    current = tab.getAttribute('data-tab');
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== current; });
    if (focus) tab.focus();
    try { history.replaceState(history.state, '', '#' + current); } catch (err) { /* file:// or sandboxed */ }
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      if (input.value) { input.value = ''; search(); } // picking a part ends the search
      select(tab.getAttribute('data-tab'));
    });
    tab.addEventListener('keydown', function (e) {
      var to = null;
      if (e.key === 'ArrowRight') to = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') to = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') to = tabs[0];
      else if (e.key === 'End') to = tabs[tabs.length - 1];
      if (!to) return;
      e.preventDefault();
      if (input.value) { input.value = ''; search(); }
      select(to.getAttribute('data-tab'), true);
    });
  });

  // Every card once, with the part it belongs to (shown on search results, which mix parts)
  var cards = [];
  panels.forEach(function (panel) {
    var label = panel.getAttribute('data-part-label');
    var partTitle = (panel.querySelector('.equipment-group-title') || {}).textContent || '';
    panel.querySelectorAll('.card').forEach(function (card) {
      cards.push({ card: card, label: label, text: fold(card.textContent + ' ' + partTitle + ' ' + label) });
    });
  });

  function search() {
    var q = fold(input.value);
    if (!q) {
      results.hidden = true;
      grid.innerHTML = '';
      tools.classList.remove('is-searching');
      select(current);
      return;
    }
    var words = q.split(' ');
    var hits = cards.filter(function (c) { return words.every(function (w) { return c.text.indexOf(w) !== -1; }); });
    grid.innerHTML = '';
    hits.forEach(function (h) {
      var copy = h.card.cloneNode(true);
      var tag = document.createElement('span');
      tag.className = 'card-part';
      tag.textContent = h.label;
      copy.querySelector('.card-body').insertBefore(tag, copy.querySelector('.card-body').firstChild);
      grid.appendChild(copy);
    });
    count.textContent = hits.length === 1 ? count.getAttribute('data-one') : count.getAttribute('data-many').replace('{n}', hits.length);
    count.hidden = !hits.length;
    empty.hidden = !!hits.length;
    tools.classList.add('is-searching');
    panels.forEach(function (p) { p.hidden = true; });
    results.hidden = false;
  }
  input.addEventListener('input', search);
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) { input.value = ''; search(); } });

  tools.hidden = false;
  var fromHash = (window.location.hash || '').slice(1);
  select(tabs.some(function (t) { return t.getAttribute('data-tab') === fromHash; }) ? fromHash : tabs[0].getAttribute('data-tab'));
  window.addEventListener('hashchange', function () {
    var h = window.location.hash.slice(1);
    if (tabs.some(function (t) { return t.getAttribute('data-tab') === h; })) { input.value = ''; search(); select(h); }
  });
})();

// Search above a list of cards (reference projects: by school; news: by title and text). Accents and case don't matter.
// Cards: [data-search-item][data-search]; optional groups [data-search-group] hide when none of their cards match.
(function () {
  var box = document.querySelector('[data-card-search]');
  if (!box) return;
  var input = box.querySelector('input');
  var count = box.querySelector('.card-search-count');
  var none = document.querySelector('[data-search-none]');
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-search-group]'));
  function fold(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  }
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-search-item]')).map(function (el) {
    return { el: el, text: fold(el.getAttribute('data-search')) };
  });

  function search() {
    var raw = input.value.trim();
    var words = fold(raw).split(' ').filter(Boolean);
    var shown = 0;
    items.forEach(function (it) {
      var match = words.every(function (w) { return it.text.indexOf(w) !== -1; });
      it.el.hidden = !match;
      if (match) shown++;
    });
    groups.forEach(function (g) {
      var visible = g.querySelectorAll('[data-search-item]:not([hidden])').length;
      // While searching, a level without matches (or an empty "being updated" level) steps aside
      g.hidden = words.length > 0 && visible === 0;
      var c = g.querySelector('[data-search-group-count]');
      if (c) c.textContent = words.length ? visible : g.querySelectorAll('[data-search-item]').length;
    });
    count.textContent = !words.length ? '' : shown === 1 ? count.getAttribute('data-one') : count.getAttribute('data-many').replace('{n}', shown);
    if (none) {
      none.hidden = !words.length || shown > 0;
      none.textContent = box.getAttribute('data-none').replace('{q}', raw);
    }
  }
  input.addEventListener('input', search);
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) { input.value = ''; search(); } });
  box.hidden = false;
  if (input.value) search(); // the browser may restore the text on Back
})();

// Videos are for watching on the site: no "Save video as…" from the right-click menu (the player hides its own download button)
document.addEventListener('contextmenu', function (e) {
  if (e.target.closest && e.target.closest('video')) e.preventDefault();
});

// Giải pháp pages: pictures behind tabs (gallery shown as "tabs"). Without JS every picture stays on the page.
(function () {
  document.querySelectorAll('[data-media-tabs]').forEach(function (wrap) {
    var list = wrap.querySelector('[role="tablist"]');
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(wrap.querySelectorAll('[role="tabpanel"]'));
    function select(i, focus) {
      tabs.forEach(function (tab, k) {
        var on = k === i;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
        if (!on) panels[k].querySelectorAll('video').forEach(function (v) { v.pause(); });
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i); });
      tab.addEventListener('keydown', function (e) {
        var to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
          : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (to < 0) return;
        e.preventDefault();
        select(to, true);
      });
    });
    list.hidden = false;
    wrap.classList.add('is-tabbed');
    select(0);
  });
})();

// Giải pháp pages: the jump menu sits under the sticky header and marks the section being read
(function () {
  var nav = document.querySelector('[data-page-jump]');
  if (!nav) return;
  var header = document.querySelector('.site-header');
  var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
  var targets = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  function measure() {
    document.documentElement.style.setProperty('--header-h', (header ? Math.round(header.getBoundingClientRect().height) : 0) + 'px');
    document.documentElement.style.setProperty('--jump-h', Math.ceil(nav.getBoundingClientRect().height) + 'px');
  }
  var ticking = false;
  function spy() {
    ticking = false;
    var line = (header ? header.getBoundingClientRect().height : 0) + nav.offsetHeight + 24;
    var current = -1;
    targets.forEach(function (el, i) { if (el && el.getBoundingClientRect().top <= line) current = i; });
    // At the very bottom the last section counts as read, even when it is too short to reach the line
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = targets.length - 1;
    links.forEach(function (a, i) {
      var on = i === current;
      if (a.classList.contains('is-current') === on) return;
      a.classList.toggle('is-current', on);
      if (on) { a.setAttribute('aria-current', 'location'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      else a.removeAttribute('aria-current');
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }
  measure();
  spy();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); onScroll(); });
})();

// Process trails (the "steps" blocks of the Giải pháp pages): when a trail scrolls into view its line fills
// from the first step to the last and each step lights up as the line reaches it. Without JS (or an observer) it is simply shown.
(function () {
  var trails = document.querySelectorAll('.process-trail');
  if (!trails.length) return;
  if (!('IntersectionObserver' in window)) {
    trails.forEach(function (t) { t.classList.add('is-drawn'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-drawn');
      io.unobserve(entry.target);
    });
  }, { threshold: 0, rootMargin: '0px 0px -15% 0px' }); // a tall (phone) trail starts once its top is well inside the screen
  trails.forEach(function (t) { io.observe(t); });
})();
