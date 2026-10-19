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

// Sign-up form: the same checks as the server (routes/auth.js), shown under each box on leaving it and on sending;
// "Xác nhận mật khẩu" says at once whether it matches. Sending is blocked while something is wrong.
(function () {
  var PHONE_RE = /^[0-9+()\-.\s]{8,20}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PASSWORD_MIN = 6;
  var FIELDS = ['name', 'email', 'phone', 'password', 'confirmPassword'];

  document.querySelectorAll('[data-register-form]').forEach(function (form) {
    var d = form.dataset;
    var input = function (name) { return form.elements[name]; };
    var value = function (name) { return name === 'password' || name === 'confirmPassword' ? input(name).value : input(name).value.trim(); };
    var touched = {};

    function problem(name) {
      var v = value(name);
      if (name === 'name') return v ? '' : d.errName;
      if (name === 'email') return !v ? d.errEmailRequired : EMAIL_RE.test(v) ? '' : d.errEmail;
      if (name === 'phone') return !v || PHONE_RE.test(v) ? '' : d.errPhone;
      if (name === 'password') return !v ? d.errPasswordRequired : v.length < PASSWORD_MIN ? d.errPasswordLength : '';
      if (name === 'confirmPassword') return !v ? d.errConfirmRequired : value('password') && v !== value('password') ? d.errPasswordMatch : '';
      return '';
    }

    // One message line per box, under the box (and under the eye button for passwords); the hint hides behind an error
    function show(name, text, ok) {
      var box = input(name);
      var group = box.closest('.form-group');
      var line = group.querySelector('[data-error-for="' + name + '"], [data-ok-for="' + name + '"]');
      var hint = group.querySelector('[data-hint-for="' + name + '"]');
      box.classList.toggle('is-invalid', !!text);
      if (line) line.remove();
      if (hint) hint.hidden = !!text;
      if (!text && !ok) return;
      line = document.createElement('div');
      line.className = text ? 'field-error' : 'field-ok';
      line.setAttribute(text ? 'data-error-for' : 'data-ok-for', name);
      line.textContent = text || ok;
      group.appendChild(line);
    }

    function check(name) {
      var text = problem(name);
      var ok = name === 'confirmPassword' && !text && value('password') ? d.passwordMatch : '';
      show(name, text, ok);
      return !text;
    }

    // Under "Mật khẩu": how many characters are still needed, then "Đủ độ dài ✓"
    var lengthLine = form.querySelector('[data-password-length]');
    function showLength() {
      var n = value('password').length;
      lengthLine.classList.toggle('is-short', n > 0 && n < PASSWORD_MIN);
      lengthLine.classList.toggle('is-ok', n >= PASSWORD_MIN);
      lengthLine.textContent = !n ? lengthLine.getAttribute('data-default')
        : n < PASSWORD_MIN ? lengthLine.getAttribute('data-short').replace('{n}', PASSWORD_MIN - n) : lengthLine.getAttribute('data-ok');
    }
    if (lengthLine) input('password').addEventListener('input', showLength);

    FIELDS.forEach(function (name) {
      var box = input(name);
      box.addEventListener('blur', function () { if (value(name) || touched[name]) { touched[name] = true; check(name); } });
      box.addEventListener('input', function () {
        // While typing: errors go away as soon as the box is right; the confirmation is compared at every key
        if (name === 'confirmPassword' || (name === 'password' && value('confirmPassword'))) {
          touched.confirmPassword = true;
          if (value('confirmPassword')) check('confirmPassword');
        }
        // The password's own line counts the characters while typing; its red message comes back on leaving the box
        if (name === 'password') show('password', '');
        else if (name !== 'confirmPassword' && box.classList.contains('is-invalid')) check(name);
      });
    });

    form.addEventListener('submit', function (e) {
      var wrong = FIELDS.filter(function (name) { touched[name] = true; return !check(name); });
      if (!wrong.length) return;
      e.preventDefault();
      input(wrong[0]).focus();
    });
  });
})();

// "Đăng nhập thành công" (once after logging in): slides out off the screen after a few seconds, or at once with ×.
// The countdown waits while the pointer is on it or it has keyboard focus, so it doesn't leave while being read.
(function () {
  var toast = document.querySelector('[data-site-toast]');
  if (!toast) return;
  var STAY = 4000;
  var timer = null;
  function leave() {
    if (toast.classList.contains('is-leaving')) return;
    clearTimeout(timer);
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', function (e) { if (e.animationName === 'site-toast-out') toast.remove(); });
    setTimeout(function () { toast.remove(); }, 1200); // in case the animation doesn't run
  }
  function wait() { clearTimeout(timer); timer = setTimeout(leave, STAY); }
  function hold() { clearTimeout(timer); }
  wait();
  toast.addEventListener('mouseenter', hold);
  toast.addEventListener('mouseleave', function () { if (!toast.contains(document.activeElement)) wait(); });
  toast.addEventListener('focusin', hold);
  toast.addEventListener('focusout', function () { if (!toast.matches(':hover')) wait(); });
  toast.querySelector('[data-site-toast-close]').addEventListener('click', leave);
})();

// Profile page: live avatar preview, "Bỏ ảnh vừa chọn", "Xóa ảnh" (asks first) and bio character counter
(function () {
  document.querySelectorAll('[data-avatar-input]').forEach(function (input) {
    var picker = input.closest('.avatar-picker');
    var saved = input.form.querySelector('[data-avatar-preview]').cloneNode(true); // the photo (or two letters) as saved
    var drop = picker && picker.querySelector('[data-avatar-drop]');
    var del = picker && picker.querySelector('[data-avatar-delete]');
    var chosen = function (on) {
      if (drop) drop.hidden = !on;
      if (del) del.hidden = on; // a chosen, unsaved photo is dropped first; "Xóa ảnh" is for the saved one
    };
    if (drop) drop.addEventListener('click', function () {
      input.value = '';
      input.form.querySelector('[data-avatar-preview]').replaceWith(saved.cloneNode(true));
      chosen(false);
    });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      var preview = input.form.querySelector('[data-avatar-preview]');
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
      chosen(true);
    });
  });

  // "Xóa ảnh" sends its own form (routes/auth.js) after "Xóa ảnh đại diện?"; without JS it simply sends
  var removeForm = document.querySelector('[data-avatar-remove-form]');
  var confirmBox = document.querySelector('[data-avatar-confirm]');
  if (removeForm && confirmBox && typeof confirmBox.showModal === 'function') {
    removeForm.addEventListener('submit', function (e) {
      if (removeForm.dataset.confirmed) return;
      e.preventDefault();
      confirmBox.showModal();
      confirmBox.querySelector('[data-confirm-cancel]').focus();
    });
    confirmBox.querySelector('[data-confirm-cancel]').addEventListener('click', function () { confirmBox.close(); });
    confirmBox.querySelector('[data-confirm-ok]').addEventListener('click', function () {
      removeForm.dataset.confirmed = '1';
      confirmBox.close();
      removeForm.submit();
    });
    confirmBox.addEventListener('click', function (e) { // a click on the dimmed page around the box closes it
      var r = confirmBox.getBoundingClientRect();
      if (e.target === confirmBox && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) confirmBox.close();
    });
  }

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

  // Same rule as the admin list search: every typed word must start a word of the item's names (VI + EN) or of its
  // sub-list topic. Accents, case and punctuation don't matter: "may tinh" finds "Máy tính", "vex-iq" finds "VEX IQ"
  function words(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
      .split(/[^a-z0-9]+/).filter(Boolean);
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
    panel.querySelectorAll('.card').forEach(function (card) {
      cards.push({ card: card, label: label, words: words(card.getAttribute('data-search') || card.textContent) });
    });
  });

  function search() {
    var query = words(input.value);
    if (!query.length) {
      results.hidden = true;
      grid.innerHTML = '';
      tools.classList.remove('is-searching');
      select(current);
      return;
    }
    var hits = cards.filter(function (c) {
      return query.every(function (q) { return c.words.some(function (w) { return w.indexOf(q) === 0; }); });
    });
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

// Giải pháp pages: "Xem ảnh lớn", or a click on a picture of a 'zoom' gallery, shows the picture larger in a box on the
// page. "← Quay lại", the browser's or phone's Back, Esc or a click outside the box close it. Opening adds one history step, so Back closes the picture instead of
// leaving the page; closing any other way takes that step out again.
// Built to work in every browser and next to blocker add-ons (uBlock, AdBlock…):
// - the box shows the picture the page has already loaded, so there is no new download for a blocker to stop;
// - its names avoid the words blocker lists hide ("popup", "modal", "overlay", "lightbox");
// - if the box still ends up hidden or covered, the picture opens in the tab itself (Back returns to the page);
// - without <dialog> (very old browsers) the button opens the picture in the tab; without JS a <noscript> link does.
// It is a button, not a link to the picture file, so hovering it previews nothing (no address, no add-on picture pop-up).
// The picture gets its size in pixels here (never larger than its real size); "Đang tải ảnh…" shows until it has loaded,
// and a message with a link if it can't be loaded.
(function () {
  var buttons = document.querySelectorAll('[data-image-view]');
  if (!buttons.length) return;
  if (typeof HTMLDialogElement === 'undefined' || typeof document.createElement('dialog').showModal !== 'function') {
    buttons.forEach(function (btn) { btn.addEventListener('click', function () { location.assign(btn.getAttribute('data-full')); }); });
    return;
  }
  var box = null, img, title, back, note, head, opener = null, address = '', natural = null, stepAdded = false, ownBack = false, opened = 0;
  var PAD = 16; // the box's inner padding (components.css: .plan-zoom-body)

  // The picture the button belongs to: beside it (floor-plan tabs) or inside it (a zoomable gallery picture)
  function pagePicture(btn) {
    var holder = btn.closest('.media-tabpanel, .media-figure');
    return holder && holder.querySelector('.media-frame img');
  }

  function build(btn) {
    box = document.createElement('dialog');
    box.className = 'plan-zoom';
    box.setAttribute('aria-labelledby', 'planZoomTitle');
    box.innerHTML = '<div class="plan-zoom-head"><h2 class="plan-zoom-title" id="planZoomTitle"></h2>' +
      '<button type="button" class="btn btn-ghost btn-sm plan-zoom-back"><span aria-hidden="true">&larr;</span> <span></span></button></div>' +
      '<div class="plan-zoom-body"><img class="plan-zoom-img" alt=""><p class="plan-zoom-note" aria-live="polite"></p></div>';
    document.body.appendChild(box);
    head = box.querySelector('.plan-zoom-head');
    title = box.querySelector('.plan-zoom-title');
    back = box.querySelector('.plan-zoom-back');
    img = box.querySelector('.plan-zoom-img');
    note = box.querySelector('.plan-zoom-note');
    back.lastChild.textContent = btn.getAttribute('data-back-label');
    back.addEventListener('click', function () { box.close(); });
    box.addEventListener('click', function (e) { if (e.target === box) box.close(); }); // outside the box (the dimmed page)
    box.addEventListener('close', function () {
      document.documentElement.classList.remove('has-plan-zoom');
      if (stepAdded) { stepAdded = false; ownBack = true; history.back(); } // closed by the button, Esc or a click: take the step out
      if (opener) opener.focus();
    });
    window.addEventListener('popstate', function () {
      if (ownBack) { ownBack = false; return; } // our own step-out (it may land after a quick reopen)
      if (!box.open) return;
      stepAdded = false; // Back already took the step out
      box.close();
    });
    window.addEventListener('resize', fit);
    img.addEventListener('load', function () {
      natural = { w: img.naturalWidth, h: img.naturalHeight };
      note.hidden = true;
      fit();
    });
    img.addEventListener('error', function () {
      note.textContent = '';
      note.appendChild(document.createTextNode(opener.getAttribute('data-failed') + ' '));
      var link = document.createElement('a');
      link.href = address;
      link.textContent = opener.getAttribute('data-open');
      note.appendChild(link);
      note.hidden = false;
      box.classList.add('is-failed');
    });
  }

  // As large as fits in ~92% × 92% of the window (minus the box's title row), never beyond the picture's real size
  function fit() {
    if (!box || !box.open || !natural || !natural.w || !natural.h) return;
    var maxW = Math.min(window.innerWidth * 0.92, 1600) - PAD * 2;
    var maxH = window.innerHeight * 0.92 - head.offsetHeight - PAD * 2;
    var scale = Math.min(1, maxW / natural.w, Math.max(120, maxH) / natural.h);
    img.style.width = Math.max(1, Math.floor(natural.w * scale)) + 'px';
    img.style.height = Math.max(1, Math.floor(natural.h * scale)) + 'px';
  }

  // False when something (a blocker add-on's style or a layer it adds) hides or covers the open box
  function onScreen() {
    if (!box.open) return true; // already closed by the visitor
    var cs = getComputedStyle(box);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) return false;
    var r = box.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return false;
    if (!box.classList.contains('is-failed')) {
      var ci = getComputedStyle(img);
      if (ci.display === 'none' || ci.visibility === 'hidden' || parseFloat(ci.opacity) < 0.1) return false;
    }
    var hit = document.elementFromPoint ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return !hit || box.contains(hit);
  }

  // The box can't be seen: show the picture in the tab instead. It takes the place of the box's history step, so Back
  // returns to the page.
  function openInTab() {
    var hadStep = stepAdded;
    stepAdded = false;
    box.close();
    if (hadStep) location.replace(address);
    else location.assign(address);
  }

  function check(n) {
    if (n === opened && box.open && !onScreen()) openInTab();
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!box) build(btn);
      if (box.open) return;
      opener = btn;
      // The picture the page shows (already loaded: no new download), else the button's own address
      var shown = pagePicture(btn);
      var loaded = shown && shown.complete && shown.naturalWidth;
      address = (loaded && shown.currentSrc) || btn.getAttribute('data-full');
      natural = loaded ? { w: shown.naturalWidth, h: shown.naturalHeight } : { w: 1500, h: 1000 };
      title.textContent = btn.getAttribute('data-title') || '';
      img.alt = btn.getAttribute('data-alt') || '';
      box.classList.remove('is-failed');
      note.textContent = btn.getAttribute('data-loading');
      note.hidden = false;
      img.src = address;
      try { history.pushState({ planZoom: true }, '', location.href); stepAdded = true; } catch (err) { stepAdded = false; }
      document.documentElement.classList.add('has-plan-zoom');
      box.showModal();
      fit();
      if (img.complete && img.naturalWidth) { natural = { w: img.naturalWidth, h: img.naturalHeight }; note.hidden = true; fit(); }
      back.focus();
      // Look again once it is drawn, and a little later (some add-ons hide things after a short delay)
      var n = ++opened;
      requestAnimationFrame(function () { requestAnimationFrame(function () { check(n); }); });
      setTimeout(function () { check(n); }, 600);
    });
  });
})();

// Giải pháp cards: "Xem chi tiết" slides its text open and closed instead of jumping. A click during the slide turns it
// around. Without JS the <details> still opens, just at once; with "reduced motion" the slide stays, only shorter (--anim).
(function () {
  var folds = document.querySelectorAll('details.card-more');
  if (!folds.length || !Element.prototype.animate) return;
  var anim = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim')) || 1;
  var ms = Math.round(180 + 220 * anim);
  folds.forEach(function (fold) {
    var summary = fold.querySelector('summary');
    var body = fold.querySelector('.card-more-body');
    if (!summary || !body) return;
    var running = null;
    var closing = false;
    function slide(from, to, done) {
      var full = body.scrollHeight || 1;
      body.classList.add('is-animating');
      running = body.animate([
        { height: from + 'px', opacity: Math.min(1, from / full) },
        { height: to + 'px', opacity: Math.min(1, to / full) }
      ], { duration: ms, easing: 'cubic-bezier(.2, .8, .3, 1)' });
      running.onfinish = function () {
        running = null;
        body.classList.remove('is-animating');
        if (done) done();
      };
    }
    summary.addEventListener('click', function (e) {
      e.preventDefault();
      var from = fold.open ? body.getBoundingClientRect().height : 0;
      if (running) { running.onfinish = null; running.cancel(); running = null; }
      if (!fold.open || closing) {
        closing = false;
        fold.open = true;
        slide(from, body.scrollHeight);
      } else {
        closing = true;
        slide(from, 0, function () { fold.open = false; closing = false; });
      }
    });
  });
})();

// Giải pháp pages: the jump menu marks the section being read. It stays out of sight at the top of the page and
// slides in under the sticky header once the banner has been scrolled past (pages.css: .js .page-jump / .is-shown).
// Topics above the one being read are marked as read, and the bar along its bottom shows how much of the page is read.
(function () {
  var nav = document.querySelector('[data-page-jump]');
  if (!nav) return;
  var header = document.querySelector('.site-header');
  var hero = document.querySelector('.page-hero');
  var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
  var targets = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  var contentEnd = document.querySelector('.next-steps'); // "Khám phá thêm" closes the page's own content
  function measure() {
    document.documentElement.style.setProperty('--header-h', (header ? Math.round(header.getBoundingClientRect().height) : 0) + 'px');
    document.documentElement.style.setProperty('--jump-h', Math.ceil(nav.getBoundingClientRect().height) + 'px');
  }
  var ticking = false;
  var row = nav.querySelector('.page-jump-list');
  // Keeps the current link in view inside the menu's own row (scrollIntoView would also scroll the page)
  function revealLink(a) {
    if (!row) return;
    var r = row.getBoundingClientRect(), l = a.getBoundingClientRect();
    if (l.left < r.left) row.scrollLeft -= r.left - l.left + 8;
    else if (l.right > r.right) row.scrollLeft += l.right - r.right + 8;
  }
  var shown = null;
  function show(on) {
    if (shown === on) return;
    shown = on;
    nav.classList.toggle('is-shown', on);
    // Out of sight = out of the keyboard order too
    if (on) nav.removeAttribute('aria-hidden'); else nav.setAttribute('aria-hidden', 'true');
    links.forEach(function (a) { if (on) a.removeAttribute('tabindex'); else a.setAttribute('tabindex', '-1'); });
  }
  function spy() {
    ticking = false;
    var headerH = header ? header.getBoundingClientRect().height : 0;
    show(!hero || hero.getBoundingClientRect().bottom <= headerH + nav.offsetHeight + 1);
    var line = headerH + nav.offsetHeight + 24;
    var current = -1;
    targets.forEach(function (el, i) { if (el && el.getBoundingClientRect().top <= line) current = i; });
    // At the very bottom the last section counts as read, even when it is too short to reach the line
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = targets.length - 1;
    links.forEach(function (a, i) {
      a.classList.toggle('is-read', i < current);
      var on = i === current;
      if (a.classList.contains('is-current') === on) return;
      a.classList.toggle('is-current', on);
      if (on) { a.setAttribute('aria-current', 'location'); revealLink(a); }
      else a.removeAttribute('aria-current');
    });
    // Reading progress: 0 when the menu appears, 1 when the end of the page's content reaches the bottom of the screen
    var y = window.scrollY;
    var start = hero ? hero.getBoundingClientRect().bottom + y - headerH - nav.offsetHeight : 0;
    var endDoc = contentEnd ? contentEnd.getBoundingClientRect().top + y : document.documentElement.scrollHeight;
    var end = Math.min(endDoc - window.innerHeight, document.documentElement.scrollHeight - window.innerHeight);
    var read = end > start ? (y - start) / (end - start) : 1;
    nav.style.setProperty('--read', Math.max(0, Math.min(1, read)).toFixed(4));
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
      var trail = entry.target;
      trail.classList.add('is-drawn');
      io.unobserve(trail);
      // Once every step is shown, hovering a step reacts at once (pages.css: .is-settled)
      var seg = 2400 / Math.max((parseInt(trail.style.getPropertyValue('--steps'), 10) || 1) - 1, 1);
      var steps = trail.querySelectorAll('.trail-step').length;
      setTimeout(function () { trail.classList.add('is-settled'); }, (steps - 1) * seg + 600);
    });
  }, { threshold: 0, rootMargin: '0px 0px -15% 0px' }); // a tall (phone) trail starts once its top is well inside the screen
  trails.forEach(function (t) { io.observe(t); });
})();

// VI ↔ EN reloads the page in the other language: keep the visitor where they were. Before leaving, note the first
// content block below the sticky header (and how far down it sits); on arrival scroll that same block back into place.
// Both languages have the same blocks in the same order; if the count differs, fall back to the same scroll fraction.
(function () {
  var KEY = 'mtgLangScroll';
  var SELECTOR = 'section, h1, h2, h3, p, li, .card, figure, .stat-card, .trail-step, .timeline-item';
  function blocks() {
    var main = document.querySelector('main');
    // Not the jump menu (it is fixed to the top of the window, so it says nothing about the reading position)
    return main ? Array.prototype.slice.call(main.querySelectorAll(SELECTOR)).filter(function (el) { return el.getClientRects().length && !el.closest('.page-jump'); }) : [];
  }
  // Measured from the bottom of the sticky header (the jump menu is left out: it is hidden right after the reload)
  function topLine() {
    var header = document.querySelector('.site-header');
    return header ? header.getBoundingClientRect().bottom : 0;
  }
  function scrollable() { return Math.max(document.documentElement.scrollHeight - window.innerHeight, 1); }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('.lang-switch a');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    var line = topLine();
    var list = blocks();
    var idx = -1;
    // The first block that starts below the header (a heading, paragraph, card…), not a big section around it
    for (var i = 0; i < list.length; i++) { if (list[i].getBoundingClientRect().top >= line) { idx = i; break; } }
    var saved = { path: location.pathname, count: list.length, idx: idx, ratio: window.scrollY / scrollable(), at: Date.now(),
      offset: idx >= 0 ? list[idx].getBoundingClientRect().top - line : 0, top: window.scrollY };
    try { sessionStorage.setItem(KEY, JSON.stringify(saved)); } catch (err) { /* storage unavailable */ }
  });

  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch (err) { /* storage unavailable */ }
  if (!saved || saved.path !== location.pathname || Date.now() - saved.at > 15000 || location.hash || !saved.top) return;
  function restore() {
    var list = blocks();
    var el = saved.idx >= 0 && list.length === saved.count ? list[saved.idx] : null;
    var y = el ? window.scrollY + el.getBoundingClientRect().top - topLine() - saved.offset : saved.ratio * scrollable();
    window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: 'instant' });
  }
  restore();
  // Once more after pictures and fonts have settled (they can change heights above the spot)
  if (document.readyState === 'complete') requestAnimationFrame(restore);
  else window.addEventListener('load', function () { requestAnimationFrame(restore); });
})();
