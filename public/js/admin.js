// Admin area behaviour: chart tooltips, confirmations, drag-and-drop ordering and small form helpers.
(function () {
  var I18N = window.ADMIN_I18N || { orderSaved: 'Saved', orderError: 'Error' };

  // ---- Motion shared by tabs, filtered lists and banner rows: ~0.4 s ease-out, shorter with "reduced motion" ----
  var ANIM = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim')) || 1;
  var MOTION = { duration: Math.round(180 + 220 * ANIM), easing: 'cubic-bezier(.2, .8, .3, 1)' };
  // Backstop: an animation that hasn't run by its end (a background tab, a page not being drawn) is jumped to its end,
  // so nothing is left half shown or invisible
  function settle(a, ms) {
    setTimeout(function () { if (a && a.playState === 'running') a.finish(); }, ms + 250);
  }
  // Newly shown content fades in and rises a little; items (e.g. table rows) follow one after another, the first 12
  function revealIn(el, items) {
    var frames = [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }];
    if (items) {
      Array.prototype.forEach.call(items, function (item, i) {
        var delay = Math.min(i, 11) * 20 * ANIM;
        if (item.animate) settle(item.animate(frames, { duration: MOTION.duration, easing: MOTION.easing, delay: delay, fill: 'backwards' }), MOTION.duration + delay);
      });
    } else if (el && el.animate) settle(el.animate(frames, MOTION), MOTION.duration);
  }
  // Slides a block open (shown first) or shut (hidden at the end), with its top/bottom padding; a new slide takes over
  // from where the last one was
  function slideTo(el, open) {
    var from = el.hidden ? 0 : el.getBoundingClientRect().height;
    if (el._slide) { el._slide.onfinish = null; el._slide.cancel(); el._slide = null; }
    if (!el.animate) { el.hidden = !open; return; }
    el.hidden = false;
    var full = el.scrollHeight || 1;
    var to = open ? full : 0;
    var cs = getComputedStyle(el);
    var pad = function (h, side) { return Math.min(parseFloat(cs[side]) || 0, h / 2) + 'px'; };
    var frame = function (h) { return { height: h + 'px', paddingTop: pad(h, 'paddingTop'), paddingBottom: pad(h, 'paddingBottom'), opacity: Math.min(1, h / full) }; };
    el.classList.add('is-sliding');
    el._slide = el.animate([frame(from), frame(to)], MOTION);
    el._slide.onfinish = function () {
      el._slide = null;
      el.classList.remove('is-sliding');
      if (!open) el.hidden = true;
    };
    settle(el._slide, MOTION.duration);
  }

  // ---- Notifications: green (success) / red (error), with icon, close button and auto-hide ----
  var toast = document.getElementById('adminToast');
  var toastTimer = null;
  var toastAction = null; // { label, run }: an optional button in the notification ("Hoàn tác")
  var ICONS = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
  };
  var toastStay = 4000;
  var toastHideTimer = null; // hides it once it has slid off the screen
  function hideToast() {
    if (!toast) return;
    toast.classList.remove('is-visible'); // slides out (admin.css)
    toastAction = null;
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(function () { toast.hidden = true; }, 1000); // in case transitionend doesn't come
  }
  function toastGone(e) {
    if (e.target !== toast || e.propertyName !== 'transform' || toast.classList.contains('is-visible')) return; // shown again meanwhile
    clearTimeout(toastHideTimer);
    toast.hidden = true;
  }
  // The countdown waits while the pointer is on the notification or one of its buttons has focus ("Hoàn tác")
  function holdToast() { clearTimeout(toastTimer); }
  function resumeToast() {
    if (!toast.classList.contains('is-visible') || toast.matches(':hover') || toast.contains(document.activeElement)) return;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, toastStay);
  }
  // On a page with a Save bar, the notification sits just above the bar wherever it is (it is only pinned to the
  // bottom of the window once the page is scrolled), so Save stays clickable while a notification shows
  var saveBar = document.querySelector('.page-form-actions');
  function placeToast() {
    if (!toast || !saveBar || toast.hidden) return;
    toast.style.bottom = '';
    var top = saveBar.getBoundingClientRect().top;
    var base = parseFloat(getComputedStyle(toast).bottom) || 20;
    if (top < window.innerHeight) toast.style.bottom = Math.max(base, window.innerHeight - top + 12) + 'px';
  }
  if (saveBar) {
    window.addEventListener('scroll', placeToast, { passive: true });
    window.addEventListener('resize', placeToast);
  }

  function showToast(text, type, action) {
    if (!toast || !text) return;
    var isError = type === 'error';
    var actionBtn = toast.querySelector('.toast-action');
    toastAction = action || null;
    if (actionBtn) {
      actionBtn.hidden = !action;
      actionBtn.textContent = action ? action.label : '';
    }
    toast.querySelector('.toast-text').textContent = text;
    toast.querySelector('.toast-icon').innerHTML = ICONS[isError ? 'error' : 'success'];
    toast.classList.toggle('is-error', isError);
    toast.setAttribute('role', isError ? 'alert' : 'status');
    clearTimeout(toastHideTimer);
    var wasHidden = toast.hidden;
    toast.hidden = false;
    placeToast();
    clearTimeout(toastTimer);
    if (wasHidden) void toast.offsetWidth; // start the slide-in from off the screen
    toast.classList.add('is-visible'); // already showing: only the text changes, no second slide
    toastStay = isError || action ? 7000 : 4000;
    toastTimer = setTimeout(hideToast, toastStay);
  }
  if (toast) {
    toast.addEventListener('transitionend', toastGone);
    toast.addEventListener('mouseenter', holdToast);
    toast.addEventListener('mouseleave', resumeToast);
    toast.addEventListener('focusin', holdToast);
    toast.addEventListener('focusout', function () { setTimeout(resumeToast, 0); });
    toast.querySelector('.toast-close').addEventListener('click', hideToast);
    var toastActionBtn = toast.querySelector('.toast-action');
    if (toastActionBtn) toastActionBtn.addEventListener('click', function () {
      var action = toastAction;
      hideToast();
      if (action) action.run();
    });
    // Message from the server (previous action's result, or a form error)
    if (toast.dataset.text) showToast(toast.dataset.text, toast.dataset.type);
  }

  // ---- Charts follow the mouse only: a click never focuses (and so never pins) a column, slice or row.
  // They stay reachable with Tab, and keyboard focus still shows the same highlight and tooltip. ----
  var keyFocus = function (el) { try { return el.matches(':focus-visible'); } catch (err) { return true; } };
  document.querySelectorAll('.chart-col, .pie-slice, .hbar-row, .legend-row[data-drill]').forEach(function (el) {
    el.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });

  // ---- Chart tooltip: any [data-tip] element shows its text on hover or keyboard focus ----
  var tip = document.getElementById('chartTooltip');
  if (tip) {
    var show = function (el, x, y) {
      tip.textContent = el.getAttribute('data-tip');
      tip.hidden = false;
      var r = tip.getBoundingClientRect();
      var left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8);
      var top = y - r.height - 12;
      if (top < 8) top = y + 16;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    };
    var focused = null; // the element whose tooltip keyboard focus opened
    var hide = function () { tip.hidden = true; };
    var showAtFocus = function () { var r = focused.getBoundingClientRect(); show(focused, r.left + r.width / 2, r.top); };
    document.querySelectorAll('[data-tip]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) { show(el, e.clientX, e.clientY); });
      el.addEventListener('mouseleave', function () { if (focused !== el) hide(); });
      el.addEventListener('focus', function () {
        if (!keyFocus(el)) return;
        focused = el;
        showAtFocus();
      });
      el.addEventListener('blur', function () { if (focused === el) focused = null; hide(); });
    });
    // Scrolling hides a mouse tooltip; one opened by keyboard focus follows its element instead (Tab can scroll the
    // page smoothly to the next column, which would otherwise hide the tooltip it just opened)
    window.addEventListener('scroll', function () {
      if (focused && document.activeElement === focused && !tip.hidden) showAtFocus(); else hide();
    }, { passive: true });
  }

  // ---- Dashboard charts: hovering a month lights up its point on the line too ----
  document.querySelectorAll('.chart-col[data-i]').forEach(function (col) {
    var svg = col.ownerSVGElement;
    var pt = svg && svg.querySelector('.chart-pt[data-i="' + col.getAttribute('data-i') + '"]');
    if (!pt) return;
    var on = function () { pt.classList.add('is-hot'); };
    var off = function () { pt.classList.remove('is-hot'); };
    col.addEventListener('mouseenter', on);
    col.addEventListener('mouseleave', function () { if (document.activeElement !== col) off(); });
    col.addEventListener('focus', function () { if (keyFocus(col)) on(); });
    col.addEventListener('blur', off);
  });

  // ---- Pies: a slice and its legend row highlight together; the slice slides out, the others dim ----
  document.querySelectorAll('[data-pie]').forEach(function (wrap) {
    var pie = wrap.querySelector('.pie');
    var setHot = function (key) {
      wrap.querySelectorAll('[data-key]').forEach(function (el) { el.classList.toggle('is-hot', el.getAttribute('data-key') === key); });
      pie.classList.toggle('has-hot', !!key && !!pie.querySelector('.pie-slice[data-key="' + key + '"]'));
    };
    wrap.querySelectorAll('.pie-slice, .legend-row').forEach(function (el) {
      var key = el.getAttribute('data-key');
      el.addEventListener('mouseenter', function () { setHot(key); });
      el.addEventListener('mouseleave', function () { setHot(null); });
      el.addEventListener('focus', function () { if (keyFocus(el)) setHot(key); });
      el.addEventListener('blur', function () { setHot(null); });
    });
  });

  // ---- Interest pie: a group's slice (or legend row) opens that group's own pie; "← Tất cả mục quan tâm" (or Esc)
  // goes back. The opened slice grows out while the others fade, then the new pie plays the same opening as on load ----
  var interestPanel = document.querySelector('[data-interest-panel]');
  if (interestPanel) {
    var pieViews = Array.prototype.slice.call(interestPanel.querySelectorAll('[data-pie-view]'));
    var pieView = function (name) { return interestPanel.querySelector('[data-pie-view="' + name + '"]'); };
    var anim = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim')) || 1;
    var zoomMs = Math.round(160 + 140 * anim); // matches .pie-slice.is-zooming in admin.css
    var pieBusy = false;
    var openedKey = null;
    var showPie = function (name) {
      pieViews.forEach(function (v) { v.hidden = v.getAttribute('data-pie-view') !== name; });
      var wrap = pieView(name);
      var svg = wrap.querySelector('.pie');
      wrap.querySelectorAll('.is-hot, .is-zooming').forEach(function (el) { el.classList.remove('is-hot', 'is-zooming'); });
      svg.classList.remove('has-hot', 'is-leaving', 'chart-anim');
      void svg.getBoundingClientRect(); // restart the opening animation (sweep + grow)
      svg.classList.add('chart-anim');
      if (tip) tip.hidden = true;
    };
    var drillInto = function (key) {
      if (pieBusy || !pieView(key)) return;
      pieBusy = true;
      openedKey = key;
      var pie = pieView('top').querySelector('.pie');
      var slice = pie.querySelector('.pie-slice[data-key="' + key + '"]');
      pie.classList.add('is-leaving');
      if (slice) slice.classList.add('is-zooming');
      setTimeout(function () {
        showPie(key);
        pieView(key).querySelector('[data-pie-back]').focus();
        pieBusy = false;
      }, zoomMs);
    };
    var backToTop = function () {
      if (pieBusy || !pieView('top').hidden) return;
      showPie('top');
      var slice = openedKey && pieView('top').querySelector('.pie-slice[data-key="' + openedKey + '"]');
      if (slice) slice.focus({ preventScroll: true });
    };
    interestPanel.querySelectorAll('[data-drill]').forEach(function (el) {
      el.addEventListener('click', function () { drillInto(el.getAttribute('data-drill')); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillInto(el.getAttribute('data-drill')); }
      });
    });
    interestPanel.querySelectorAll('[data-pie-back]').forEach(function (btn) { btn.addEventListener('click', backToTop); });
    interestPanel.addEventListener('keydown', function (e) { if (e.key === 'Escape') backToTop(); });
  }

  // ---- Pie panel tabs ("Theo mục quan tâm" / "Thiết bị, học liệu, Robot STEM"): the same tabs as Cài đặt chung;
  // switching replays the opening (sweep + grow) of the pie now shown. An opened interest group stays open. ----
  var piePanel = document.querySelector('[data-pie-panel]');
  if (piePanel) {
    piePanel.addEventListener('tabchange', function (e) {
      var panel = piePanel.querySelector('[data-panel="' + e.detail + '"]');
      var wrap = panel && Array.prototype.filter.call(panel.querySelectorAll('[data-pie]'), function (w) { return !w.hidden; })[0];
      var svg = wrap && wrap.querySelector('.pie');
      if (!svg) return;
      svg.classList.remove('chart-anim');
      void svg.getBoundingClientRect();
      svg.classList.add('chart-anim');
      if (tip) tip.hidden = true;
    });
    initTabs(piePanel);
  }

  // ---- Forms with data-confirm (deleting items/users) ask first in a centred dialog ----
  var confirmBox = document.getElementById('confirmDialog');
  if (confirmBox) {
    var confirmDialog = confirmBox.querySelector('.confirm-dialog');
    var confirmText = confirmBox.querySelector('.confirm-text');
    var confirmOk = confirmBox.querySelector('[data-confirm-ok]');
    var confirmCancel = confirmBox.querySelector('.confirm-cancel');
    var pendingForm = null;
    var openerButton = null;
    var closeTimer = null;

    var openConfirm = function (form, opener) {
      clearTimeout(closeTimer);
      pendingForm = form;
      openerButton = opener;
      confirmText.textContent = form.getAttribute('data-confirm');
      // Optional custom heading (e.g. "Restore default content"); deletions keep the default "Confirm deletion"
      var titleEl = confirmBox.querySelector('.confirm-title');
      if (!titleEl.hasAttribute('data-default')) titleEl.setAttribute('data-default', titleEl.textContent);
      titleEl.textContent = form.getAttribute('data-confirm-title') || titleEl.getAttribute('data-default');
      confirmOk.disabled = false;
      confirmBox.classList.remove('is-open');
      confirmBox.hidden = false;
      document.body.classList.add('confirm-lock');
      void confirmDialog.offsetWidth; // start the expand animation from scale(0)
      confirmBox.classList.add('is-open');
      confirmCancel.focus();
    };

    var closeConfirm = function () {
      if (confirmBox.hidden || !confirmBox.classList.contains('is-open')) return;
      confirmBox.classList.remove('is-open'); // shrinks back to the centre
      document.body.classList.remove('confirm-lock');
      pendingForm = null;
      closeTimer = setTimeout(function () { confirmBox.hidden = true; }, 200);
      if (openerButton) openerButton.focus();
    };

    document.querySelectorAll('form[data-confirm]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        openConfirm(form, e.submitter || form.querySelector('[type="submit"]'));
      });
    });

    confirmOk.addEventListener('click', function () {
      if (!pendingForm) return;
      confirmOk.disabled = true; // no double submit
      pendingForm.submit(); // submit() does not fire the submit event again
    });
    confirmBox.querySelectorAll('[data-confirm-cancel]').forEach(function (btn) {
      btn.addEventListener('click', closeConfirm);
    });
    window.addEventListener('pageshow', function (e) {
      // Coming back with the browser's Back button: don't restore a half-used dialog
      if (e.persisted) { confirmBox.classList.remove('is-open'); confirmBox.hidden = true; document.body.classList.remove('confirm-lock'); pendingForm = null; }
    });
    confirmBox.addEventListener('mousedown', function (e) {
      if (e.target !== confirmBox) return;
      e.preventDefault(); // keep focus on the Delete button we return it to
      closeConfirm(); // click on the dimmed backdrop
    });
    document.addEventListener('keydown', function (e) {
      if (confirmBox.hidden || !confirmBox.classList.contains('is-open')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeConfirm(); return; }
      if (e.key !== 'Tab') return;
      // Keep keyboard focus inside the dialog
      var items = Array.prototype.filter.call(confirmBox.querySelectorAll('button'), function (b) { return !b.disabled; });
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!confirmBox.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    });
  }

  // ---- Selects that save on change (request status) ----
  document.querySelectorAll('select[data-autosubmit]').forEach(function (select) {
    select.addEventListener('change', function () { select.form.submit(); });
  });

  // ---- Repeatable rows (product specs): add from a <template>, remove with a button ----
  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add-row]');
    if (add) {
      var template = document.getElementById(add.getAttribute('data-add-row'));
      var target = document.getElementById(add.getAttribute('data-target'));
      if (template && target) {
        target.appendChild(template.content.cloneNode(true));
        var field = target.lastElementChild && target.lastElementChild.querySelector('input:not([type="hidden"]):not([type="checkbox"]), textarea');
        if (field) field.focus();
      }
      return;
    }
    var remove = e.target.closest('[data-remove-row]');
    if (remove) (remove.closest('[data-row]') || remove.parentElement).remove();
  });

  // ---- Editor tabs (service editor, solution-page editor): click or ←/→ to switch panels ----
  function initTabs(form) {
    if (!form.querySelector('[data-tabs]')) return function () {};
    var tabs = Array.prototype.slice.call(form.querySelectorAll('[data-tab]'));
    var panels = Array.prototype.slice.call(form.querySelectorAll('[data-panel]'));
    var first = true;
    function openTab(key) {
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('data-tab') === key;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
      });
      panels.forEach(function (panel) {
        var on = panel.getAttribute('data-panel') === key;
        if (on && panel.hidden && !first) revealIn(panel); // the opened tab's content fades in (not on the first load)
        panel.hidden = !on;
      });
      first = false;
      form.dispatchEvent(new CustomEvent('tabchange', { detail: key }));
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { openTab(tab.getAttribute('data-tab')); });
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        openTab(next.getAttribute('data-tab'));
      });
    });
    openTab(form.querySelector('[data-tabs]').getAttribute('data-open') || 'content');
    return openTab;
  }

  // ---- Plain tabbed forms (Cài đặt chung): remember the open tab so saving comes back to it ----
  document.querySelectorAll('[data-tabbed-form]').forEach(function (form) {
    var current = form.querySelector('[data-current-tab]');
    var saveBar = form.querySelector('[data-save-bar]');
    // "Khôi phục mặc định" has its own button, so "Lưu cài đặt" is hidden there
    form.addEventListener('tabchange', function (e) {
      current.value = e.detail;
      if (saveBar) saveBar.hidden = e.detail === 'reset';
    });
    initTabs(form);
    // A link to one banner (#banner-workshop) lands on the Banners tab (the banner list then opens that row)
    if (location.hash.indexOf('#banner-') === 0 && document.getElementById(location.hash.slice(1))) {
      var tabBtn = form.querySelector('[data-tab="banners"]');
      if (tabBtn) tabBtn.click();
    }
  });

  // ---- Người dùng: clicking a profile photo shows it larger; ×, Escape or a click outside closes it ----
  var avatarDialog = document.querySelector('[data-avatar-dialog]');
  if (avatarDialog && avatarDialog.showModal) {
    var avatarOpener = null;
    document.querySelectorAll('[data-avatar-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        avatarOpener = btn;
        var img = avatarDialog.querySelector('[data-avatar-img]');
        img.src = btn.getAttribute('data-src');
        img.alt = btn.getAttribute('aria-label');
        avatarDialog.querySelector('[data-avatar-name]').textContent = btn.getAttribute('data-name');
        avatarDialog.querySelector('[data-avatar-email]').textContent = btn.getAttribute('data-email');
        avatarDialog.showModal();
      });
    });
    avatarDialog.querySelector('[data-avatar-close]').addEventListener('click', function () { avatarDialog.close(); });
    avatarDialog.addEventListener('click', function (e) { if (e.target === avatarDialog) avatarDialog.close(); }); // the dimmed backdrop
    avatarDialog.addEventListener('close', function () { if (avatarOpener) avatarOpener.focus(); });
  }

  // ---- Cài đặt chung → Khôi phục mặc định: tick pages, then one button (enabled once a page is ticked) asks to confirm ----
  document.querySelectorAll('[data-reset-pages]').forEach(function (card) {
    var boxes = Array.prototype.slice.call(card.querySelectorAll('[data-reset-page]'));
    var all = card.querySelector('[data-reset-all]');
    var button = card.querySelector('[data-reset-submit]');
    var picked = card.querySelector('[data-reset-picked]');
    var resetForm = document.getElementById(button.getAttribute('form'));
    function update() {
      var chosen = boxes.filter(function (b) { return b.checked; });
      var names = chosen.map(function (b) { return '“' + b.getAttribute('data-name') + '”'; }).join(', ');
      button.disabled = !chosen.length;
      all.checked = chosen.length === boxes.length;
      all.indeterminate = chosen.length > 0 && chosen.length < boxes.length;
      picked.textContent = chosen.length ? card.getAttribute('data-picked').replace('{n}', chosen.length) : '';
      boxes.forEach(function (b) { b.closest('.reset-row').classList.toggle('is-picked', b.checked); });
      resetForm.setAttribute('data-confirm', card.getAttribute(chosen.length > 1 ? 'data-confirm-many' : 'data-confirm-one')
        .replace('{n}', chosen.length).replace('{names}', names));
    }
    all.addEventListener('change', function () {
      boxes.forEach(function (b) { b.checked = all.checked; });
      update();
    });
    boxes.forEach(function (b) { b.addEventListener('change', update); });
    update();
  });

  // ---- Cài đặt chung → Banner các trang: one short row per page; "Sửa" opens it (one at a time) with a live preview ----
  // The row line shows the Vietnamese line; the preview shows the language of the box being typed in (Vietnamese first).
  document.querySelectorAll('[data-banner-list]').forEach(function (listEl) {
    var rows = Array.prototype.slice.call(listEl.querySelectorAll('[data-banner-row]'));
    function textBox(row, lang) { return row.querySelector('[data-banner-text="' + lang + '"]'); }
    function lineFor(row, lang) { return textBox(row, lang).value.trim() || row.getAttribute('data-default-' + lang); }

    // Row summary, badges and the preview follow what is typed or picked
    function update(row) {
      var lang = row._lang || 'vi';
      var ownVi = textBox(row, 'vi').value.trim();
      var custom = !!(ownVi || textBox(row, 'en').value.trim());
      var summary = row.querySelector('[data-banner-summary]');
      summary.textContent = lineFor(row, 'vi') || I18N.bannerNoLine;
      summary.classList.toggle('is-default', !ownVi);
      row.querySelector('[data-banner-live-line]').textContent = lineFor(row, lang);
      row.querySelectorAll('[data-live-title]').forEach(function (el) { el.hidden = el.getAttribute('data-live-title') !== lang; });
      var file = row.querySelector('[data-banner-file]');
      var remove = row.querySelector('[data-banner-remove]');
      var image = file._preview || (remove && remove.checked ? '' : row.getAttribute('data-saved-image'));
      [row.querySelector('[data-banner-live]'), row.querySelector('[data-banner-thumb]')].forEach(function (el) {
        if (image) el.style.setProperty('--hero-image', "url('" + image + "')"); else el.style.removeProperty('--hero-image');
      });
      row.querySelector('[data-badge="default"]').hidden = custom;
      row.querySelector('[data-badge="custom"]').hidden = !custom;
      row.querySelector('[data-badge="image"]').hidden = !image;
      file.closest('.page-media-pick').classList.toggle('has-image', !!image);
      row.querySelector('[data-banner-default]').hidden = !custom;
    }

    // Opens one row and closes the others; clicking the open row's head closes it. animate: the editors slide open and
    // shut (a click; not when a link opens a row on arrival)
    function toggle(row, focus, animate) {
      var opening = !row.classList.contains('is-open');
      rows.forEach(function (other) {
        var on = other === row && opening;
        var was = other.classList.contains('is-open');
        other.classList.toggle('is-open', on);
        other.querySelector('[data-banner-toggle]').setAttribute('aria-expanded', on ? 'true' : 'false');
        var editor = other.querySelector('.banner-editor');
        if (animate && was !== on) slideTo(editor, on);
        else if (!animate) editor.hidden = !on;
      });
      if (opening && focus) textBox(row, 'vi').focus({ preventScroll: true });
    }

    rows.forEach(function (row) {
      update(row);
      row.querySelector('[data-banner-toggle]').addEventListener('click', function () { toggle(row, true, true); });
      row.addEventListener('input', function () { update(row); });
      row.addEventListener('focusin', function (e) {
        var box = e.target.closest('[data-banner-text]');
        if (box && row._lang !== box.getAttribute('data-banner-text')) { row._lang = box.getAttribute('data-banner-text'); update(row); }
      });
      row.addEventListener('change', function (e) {
        var file = e.target.closest('[data-banner-file]');
        if (file) {
          if (file._preview) URL.revokeObjectURL(file._preview);
          var picked = file.files && file.files[0];
          file._preview = picked ? URL.createObjectURL(picked) : '';
          row.querySelector('[data-banner-file-name]').textContent = picked ? picked.name : '';
        }
        update(row);
      });
      // Both lines back to the default text
      row.querySelector('[data-banner-default]').addEventListener('click', function () {
        textBox(row, 'vi').value = '';
        textBox(row, 'en').value = '';
        update(row);
        textBox(row, 'vi').focus();
      });
    });

    // A link to one banner (#banner-workshop, from a Giải pháp editor) opens that row
    var target = location.hash.indexOf('#banner-') === 0 && document.getElementById(location.hash.slice(1));
    if (target && rows.indexOf(target) !== -1) {
      toggle(target, false);
      target.scrollIntoView({ block: 'center' });
    }
  });

  // ---- Service editor: tabs, numbered/draggable item cards, checkboxes inside repeatable rows ----
  document.querySelectorAll('[data-service-form]').forEach(function (form) {
    initTabs(form);

    // Number the cards ("Bước 1, 2…") and keep each tab's count in step with what's on screen.
    // Text is only written when it changes, so these updates don't wake the observer again.
    function setText(el, text) { if (el.textContent !== String(text)) el.textContent = text; }
    function refresh() {
      form.querySelectorAll('[data-row-list]').forEach(function (list) {
        Array.prototype.forEach.call(list.querySelectorAll(':scope > [data-row]'), function (row, i) {
          var num = row.querySelector('[data-row-num]');
          if (num) setText(num, i + 1);
        });
      });
      form.querySelectorAll('[data-tab-count]').forEach(function (badge) {
        var panel = form.querySelector('[data-panel="' + badge.getAttribute('data-tab-count') + '"]');
        setText(badge, panel.querySelectorAll('[data-row]').length + panel.querySelectorAll('.media-thumb').length);
      });
    }
    refresh();
    // Only card lists change shape (add / remove / drag), so watch just those
    var observer = new MutationObserver(refresh);
    form.querySelectorAll('[data-row-list]').forEach(function (list) { observer.observe(list, { childList: true }); });

    // Cards reorder by drag; the order is saved with the form
    if (window.Sortable) {
      form.querySelectorAll('[data-row-list]').forEach(function (list) {
        window.Sortable.create(list, { handle: '.row-drag', animation: 150, forceFallback: true, fallbackOnBody: true, ghostClass: 'sortable-ghost' });
      });
    }

    form.addEventListener('change', function (e) {
      // A checkbox inside a repeatable row writes 1/0 into its hidden field, so every row always posts a value
      var box = e.target.closest('[data-mirror]');
      if (box) {
        if (box.checked && box.getAttribute('data-exclusive')) {
          form.querySelectorAll('[data-exclusive="' + box.getAttribute('data-exclusive') + '"]').forEach(function (other) {
            if (other !== box && other.checked) {
              other.checked = false;
              other.closest('[data-mirror-wrap]').querySelector('input[type="hidden"]').value = '0';
            }
          });
        }
        box.closest('[data-mirror-wrap]').querySelector('input[type="hidden"]').value = box.checked ? '1' : '0';
      }
      // Choice questions show their option lists
      var type = e.target.closest('[data-question-type]');
      if (type) type.closest('[data-row]').querySelector('[data-question-options]').hidden = type.value !== 'choice';
    });

    // Keep the button from being pressed twice while files upload
    form.addEventListener('submit', function () {
      var button = form.querySelector('button[type="submit"]');
      setTimeout(function () { button.disabled = true; }, 0);
    });
  });

  // ---- Solution-page editor: an outline of sections; one opens at a time. Sections, items and photos reorder by
  // drag or ▲/▼ and are removed with an undo; Vietnamese and English boxes sit side by side ----
  document.querySelectorAll('[data-page-form]').forEach(function (form) {
    var list = form.querySelector('[data-section-list]');
    var badge = form.querySelector('[data-section-count]');
    var tplSection = document.getElementById('tpl-page-section');
    var tplItem = document.getElementById('tpl-page-item');
    var picker = form.querySelector('[data-type-picker]');
    var addBtn = form.querySelector('[data-add-section]');
    var unsaved = form.querySelector('[data-unsaved]');
    var sortableOpts = { animation: 150, forceFallback: true, fallbackOnBody: true, ghostClass: 'sortable-ghost', onEnd: function () { markDirty(); } };
    var dirty = false;
    var sending = false;
    function children(parent, selector) {
      return Array.prototype.filter.call(parent.children, function (el) { return el.matches(selector); });
    }
    function sectionsOnScreen() { return children(list, '[data-section]'); }
    // The items the admin sees (not the developer's hidden link buttons)
    function itemsOf(section) { return children(section.querySelector('[data-item-list]'), '[data-item]:not([data-link-item])'); }
    function setText(el, text) { if (el && el.textContent !== String(text)) el.textContent = text; }
    function val(scope, sel) { var el = scope.querySelector(sel); return el ? el.value.trim() : ''; }
    function own(section, sel) { // the section's own field, not one inside its items or photos
      var el = section.querySelector(sel);
      return el && el.closest('[data-section]') === section ? el : null;
    }

    function markDirty() {
      dirty = true;
      if (unsaved) unsaved.hidden = false;
    }
    window.addEventListener('beforeunload', function (e) {
      if (!dirty || sending) return;
      e.preventDefault();
      e.returnValue = I18N.leave || '';
    });

    // Each item is labelled after its section's type ("Thẻ 2", "Bước 3"…)
    function applyItemKind(item, kind, section) {
      // A link button in a numbers section (e.g. "Khám phá VEX Robotics") is set by the developer: kept, not shown
      if (kind === 'stats' && item.querySelector('[data-item-field="url"]').value) {
        item.hidden = true;
        item.setAttribute('data-link-item', '');
      }
      item.querySelectorAll('[data-item-kinds]').forEach(function (el) {
        el.hidden = el.getAttribute('data-item-kinds').split(' ').indexOf(kind) === -1;
      });
      var labelKind = kind === 'text' ? 'buttons' : kind;
      item.querySelectorAll('[data-swap-label]').forEach(function (label) {
        setText(label, label.getAttribute('data-label-' + labelKind) || label.getAttribute('data-label-default'));
      });
      setText(item.querySelector('[data-item-label]'), section.getAttribute('data-item-label-' + kind) || '');
    }

    // Show only the fields the section's type uses (the type itself is set by the developer, or picked when adding)
    function applyKind(section) {
      var kind = section.querySelector('[data-section-kind]').value;
      section.setAttribute('data-kind', kind);
      setText(section.querySelector('[data-kind-label]'), section.getAttribute('data-kind-name-' + kind) || kind);
      section.querySelectorAll('[data-kinds]').forEach(function (el) {
        el.hidden = el.getAttribute('data-kinds').split(' ').indexOf(kind) === -1;
      });
      ['[data-items-title]', '[data-add-item]', '[data-media-title]'].forEach(function (sel) {
        var el = section.querySelector(sel);
        if (el && el.getAttribute('data-label-' + kind)) setText(el, el.getAttribute('data-label-' + kind));
      });
      section.querySelectorAll('[data-item]').forEach(function (item) { applyItemKind(item, kind, section); });
    }

    // English boxes show the Vietnamese text as a grey hint
    function syncHints(scope) {
      scope.querySelectorAll('[data-field$="En"], [data-item-field$="En"], [data-media-field$="En"]').forEach(function (en) {
        var attr = en.hasAttribute('data-field') ? 'data-field' : en.hasAttribute('data-item-field') ? 'data-item-field' : 'data-media-field';
        var name = en.getAttribute(attr);
        var holder = en.closest(attr === 'data-field' ? '[data-section]' : attr === 'data-item-field' ? '[data-item]' : '[data-media]');
        var vi = holder && holder.querySelector('[' + attr + '="' + name.slice(0, -2) + 'Vi"]');
        if (!vi) return;
        if (en._hint === undefined) en._hint = en.getAttribute('placeholder') || '';
        en.placeholder = vi.value.trim() || en._hint;
      });
    }

    // A box filled in Vietnamese but empty in English, in a section or one item (only boxes its type uses;
    // a closed section or item still counts)
    function missingEnglish(scope) {
      return Array.prototype.some.call(scope.querySelectorAll('[data-field$="Vi"], [data-item-field$="Vi"], [data-media-field$="Vi"]'), function (vi) {
        if (!vi.value.trim() || vi.closest('[data-kinds][hidden], [data-item-kinds][hidden], [data-link-item]')) return false;
        var attr = vi.hasAttribute('data-field') ? 'data-field' : vi.hasAttribute('data-item-field') ? 'data-item-field' : 'data-media-field';
        var name = vi.getAttribute(attr);
        if (name === 'navVi') return false; // optional: the title is used when it is empty
        var holder = vi.closest(attr === 'data-field' ? '[data-section]' : attr === 'data-item-field' ? '[data-item]' : '[data-media]');
        var en = holder.querySelector('[' + attr + '="' + name.slice(0, -2) + 'En"]');
        return en && !en.value.trim();
      });
    }

    // The closed section's line: the Vietnamese title (else the English one), and what it holds
    function summarise(section) {
      var L = 'Vi', O = 'En';
      var kind = section.getAttribute('data-kind');
      var items = itemsOf(section);
      var media = children(section.querySelector('[data-media-list]'), '[data-media]').length;
      var pending = section.querySelector('[data-media-input]').files.length;
      var title = val(section, '[data-field="title' + L + '"]') || val(section, '[data-field="title' + O + '"]');
      if (kind === 'buttons' || (!title && items.length && kind !== 'text')) { // a text section's buttons are not shown
        title = items.map(function (it) { return val(it, '[data-item-field="title' + L + '"]') || val(it, '[data-item-field="title' + O + '"]'); }).filter(Boolean).join(' · ');
      }
      // No title: the start of the text, in grey
      var excerpt = title ? '' : (val(section, '[data-field="text' + L + '"]') || val(section, '[data-field="text' + O + '"]')).split('\n')[0].slice(0, 120);
      var titleEl = section.querySelector('[data-summary-title]');
      setText(titleEl, title || excerpt || form.getAttribute('data-untitled'));
      titleEl.classList.toggle('is-excerpt', !title && !!excerpt);
      titleEl.classList.toggle('is-empty', !title && !excerpt);
      var meta = [];
      var itemKind = { cards: 'cards', steps: 'steps', stats: 'stats', buttons: 'buttons' }[kind];
      if (itemKind && items.length) meta.push(form.getAttribute('data-meta-' + itemKind).replace('{n}', items.length));
      if ((kind === 'gallery' || kind === 'text') && media + pending) meta.push(form.getAttribute('data-meta-' + (kind === 'text' ? 'image' : 'media')).replace('{n}', media + pending));
      setText(section.querySelector('[data-summary-meta]'), meta.join(' · '));
      items.forEach(function (item) { summariseItem(item, kind); });
      section.querySelector('[data-flag-en]').hidden = !missingEnglish(section);
      section.querySelector('[data-flag-continued]').hidden = !(section.previousElementSibling && own(section, '[data-field="continued"]').value === '1');
    }

    // A closed item's line (Vietnamese, else English): "Lắp ráp & chế tạo" (cards, steps, buttons), "120+ · trường học" (numbers)
    function summariseItem(item, kind) {
      var L = 'Vi', O = 'En';
      var title = val(item, '[data-item-field="title' + L + '"]') || val(item, '[data-item-field="title' + O + '"]');
      var text = (val(item, '[data-item-field="text' + L + '"]') || val(item, '[data-item-field="text' + O + '"]')).split('\n')[0];
      var hasText = kind === 'cards' || kind === 'steps';
      var line = kind === 'stats' ? [title, text].filter(Boolean).join(' · ') : title || (hasText ? text.slice(0, 120) : '');
      var el = item.querySelector('[data-item-summary]');
      setText(el, line || form.getAttribute('data-item-empty'));
      el.classList.toggle('is-excerpt', hasText && !title && !!text);
      el.classList.toggle('is-empty', !line);
      item.querySelector('[data-item-flag-en]').hidden = !missingEnglish(item);
    }

    // Opens one item and closes the others in the same section; clicking the open one again closes it.
    // animate: the bodies slide open and shut (a click); without it they switch at once (opened after a failed save)
    function toggleItem(item, open, animate) {
      var opening = open === undefined ? !item.classList.contains('is-open') : open;
      children(item.parentNode, '[data-item]').forEach(function (other) {
        var on = other === item && opening;
        if (other.classList.contains('is-open') === on) return;
        other.classList.toggle('is-open', on);
        if (animate) slideTo(other.querySelector('.pi-body'), on); else other.querySelector('.pi-body').hidden = !on;
        other.querySelectorAll('[data-item-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
      });
    }

    function summariseAll() {
      sectionsOnScreen().forEach(summarise);
    }

    // Opens one section and closes the others; clicking the open one again closes it. animate: as for toggleItem
    function toggleSection(section, open, animate) {
      var opening = open === undefined ? !section.classList.contains('is-open') : open;
      sectionsOnScreen().forEach(function (other) {
        var on = other === section && opening;
        if (other.classList.contains('is-open') === on) return;
        other.classList.toggle('is-open', on);
        if (animate) slideTo(other.querySelector('.ps-body'), on); else other.querySelector('.ps-body').hidden = !on;
        other.querySelectorAll('[data-section-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
      });
      // Brought into view once the slides have ended (a section above may still be shrinking until then)
      if (opening) {
        setTimeout(function () {
          var r = section.getBoundingClientRect();
          if (r.top < 0 || r.top > window.innerHeight - 120) section.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, animate ? MOTION.duration + 20 : 0);
      }
    }

    function initSection(section) {
      var uid = section.querySelector('[data-field="uid"]');
      if (!uid.value) uid.value = 's' + Math.random().toString(36).slice(2, 10);
      applyKind(section);
      syncHints(section);
      if (window.Sortable) {
        window.Sortable.create(section.querySelector('[data-item-list]'), Object.assign({ handle: '.item-drag' }, sortableOpts));
        window.Sortable.create(section.querySelector('[data-media-list]'), Object.assign({ handle: '.media-drag' }, sortableOpts));
      }
    }

    // Numbers, the section count, ▲/▼ at the ends, and "attach to the section above" (not for the first section)
    function refresh() {
      var sections = sectionsOnScreen();
      sections.forEach(function (section, i) {
        setText(section.querySelector('[data-row-num]'), i + 1);
        section.querySelector('.ps-tools [data-move="up"]').disabled = i === 0;
        section.querySelector('.ps-tools [data-move="down"]').disabled = i === sections.length - 1;
        var items = itemsOf(section);
        items.forEach(function (item, j) {
          setText(item.querySelector('[data-row-num]'), j + 1);
          item.querySelector('[data-move="up"]').disabled = j === 0;
          item.querySelector('[data-move="down"]').disabled = j === items.length - 1;
        });
        // Photos: their number on the preview, and "6 ảnh · 1 video" in the header
        var photos = 0, videos = 0;
        children(section.querySelector('[data-media-list]'), '[data-media]').forEach(function (media, k) {
          setText(media.querySelector('[data-media-num]'), k + 1);
          if (media.querySelector('[data-media-field="type"]').value === 'video') videos++; else photos++;
        });
        var count = section.querySelector('[data-media-count]');
        var parts = [];
        if (photos) parts.push(count.getAttribute('data-photos').replace('{n}', photos));
        if (videos) parts.push(count.getAttribute('data-videos').replace('{n}', videos));
        setText(count, parts.join(' · ') || count.getAttribute('data-none'));
      });
      setText(badge, sections.length);
      summariseAll();
    }

    // Take an element off the page, with "Hoàn tác" in the notification to put it back where it was
    function removeWithUndo(el, message) {
      var parent = el.parentNode;
      var next = el.nextElementSibling;
      el.remove();
      markDirty();
      showToast(message, 'success', {
        label: I18N.undo,
        run: function () {
          parent.insertBefore(el, next && next.parentNode === parent ? next : null);
          var focusable = el.querySelector('[data-section-toggle], [data-item-toggle], input:not([type="hidden"])');
          if (focusable) focusable.focus();
        },
      });
    }

    function closePicker() {
      picker.hidden = true;
      addBtn.setAttribute('aria-expanded', 'false');
    }

    sectionsOnScreen().forEach(initSection);
    refresh();
    new MutationObserver(refresh).observe(list, { childList: true, subtree: true });
    if (window.Sortable) window.Sortable.create(list, Object.assign({ handle: '.section-drag', draggable: '[data-section]' }, sortableOpts));

    // After a failed save, mark the sections and items the messages name; open the first section, and every named item
    var firstError = null;
    document.querySelectorAll('[data-error-section]').forEach(function (li) {
      var s = sectionsOnScreen()[+li.getAttribute('data-error-section') - 1];
      if (!s) return;
      s.classList.add('has-error');
      s.querySelector('[data-flag-error]').hidden = false;
      var item = li.hasAttribute('data-error-item') ? children(s.querySelector('[data-item-list]'), '[data-item]')[+li.getAttribute('data-error-item') - 1] : null;
      if (item) { item.classList.add('has-error'); toggleItem(item, true); }
      if (!firstError) firstError = s;
    });
    if (firstError) toggleSection(firstError, true);

    form.addEventListener('click', function (e) {
      if (e.target.closest('[data-add-section]')) {
        var show = picker.hidden;
        picker.hidden = !show;
        addBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
        if (show) {
          revealIn(picker); // the type picker fades and slides in
          picker.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          picker.querySelector('[data-add-kind]').focus({ preventScroll: true });
        }
        return;
      }
      var addKind = e.target.closest('[data-add-kind]');
      if (addKind) {
        closePicker();
        list.appendChild(tplSection.content.cloneNode(true));
        var section = list.lastElementChild;
        section.querySelector('[data-section-kind]').value = addKind.getAttribute('data-add-kind');
        initSection(section);
        refresh();
        markDirty();
        toggleSection(section, true, true);
        var first = section.querySelector('.ps-body input:not([type="hidden"]):not([type="checkbox"]), .ps-body textarea');
        var visible = Array.prototype.filter.call(section.querySelectorAll('.ps-body input:not([type="hidden"]):not([type="checkbox"]):not([type="file"]), .ps-body textarea'), function (el) { return el.offsetParent !== null; })[0];
        if (visible || first) (visible || first).focus({ preventScroll: true });
        return;
      }
      var toggle = e.target.closest('[data-section-toggle]');
      if (toggle) { toggleSection(toggle.closest('[data-section]'), undefined, true); return; }
      var itemToggle = e.target.closest('[data-item-toggle]');
      if (itemToggle) { toggleItem(itemToggle.closest('[data-item]'), undefined, true); return; }
      var move = e.target.closest('[data-move]');
      if (move) {
        var row = move.closest('[data-item]') || move.closest('[data-section]');
        var up = move.getAttribute('data-move') === 'up';
        var sibling = up ? row.previousElementSibling : row.nextElementSibling;
        if (!sibling) return;
        row.parentNode.insertBefore(row, up ? sibling : sibling.nextElementSibling);
        move.focus();
        markDirty();
        return;
      }
      var removeSection = e.target.closest('[data-remove-section]');
      if (removeSection) {
        var sec = removeSection.closest('[data-section]');
        removeWithUndo(sec, form.getAttribute('data-removed-section').replace('{name}', sec.querySelector('[data-summary-title]').textContent));
        return;
      }
      var removeItem = e.target.closest('[data-remove-item]');
      if (removeItem) { removeWithUndo(removeItem.closest('[data-item]'), form.getAttribute('data-removed-item')); return; }
      var removeMedia = e.target.closest('[data-remove-media]');
      if (removeMedia) { removeWithUndo(removeMedia.closest('[data-media]'), form.getAttribute('data-removed-media')); return; }
      var addItem = e.target.closest('[data-add-item]');
      if (addItem) {
        var sectionEl = addItem.closest('[data-section]');
        var items = sectionEl.querySelector('[data-item-list]');
        // New items go after the visible ones (before a hidden link button), so their numbers match the saved order
        var fresh = tplItem.content.firstElementChild.cloneNode(true);
        items.insertBefore(fresh, children(items, '[data-link-item]')[0] || null);
        applyItemKind(fresh, sectionEl.getAttribute('data-kind'), sectionEl);
        toggleItem(fresh, true, true);
        markDirty();
        var box = fresh.querySelector('.pi-body input');
        if (box) box.focus();
      }
    });

    // The type picker closes with Escape or a click elsewhere
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !picker.hidden) { closePicker(); addBtn.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (!picker.hidden && !e.target.closest('.page-add')) closePicker();
    });

    // Captions are one line each: Enter does nothing, pasted line breaks become spaces; the box grows with the text
    var growsByItself = window.CSS && CSS.supports && CSS.supports('field-sizing', 'content');
    function fitCaption(box) {
      if (growsByItself) return;
      box.style.height = 'auto';
      box.style.height = box.scrollHeight + 2 + 'px';
    }
    form.querySelectorAll('[data-one-line]').forEach(fitCaption);
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('[data-one-line]')) e.preventDefault();
    });

    form.addEventListener('input', function (e) {
      if (e.target.matches('[data-one-line]')) {
        if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' ');
        fitCaption(e.target);
      }
      markDirty();
      var section = e.target.closest('[data-section]');
      if (section) { syncHints(section); summarise(section); }
      summariseAll();
    });

    form.addEventListener('change', function (e) {
      markDirty();
      // Picked files are listed until the page is saved
      var input = e.target.closest('[data-media-input]');
      if (input) {
        var pending = input.closest('[data-section]').querySelector('[data-media-pending]');
        var names = Array.prototype.map.call(input.files, function (f) { return f.name; });
        pending.hidden = !names.length;
        pending.querySelector('[data-media-pending-list]').textContent = names.join(', ');
      }
      summariseAll();
    });

    // Give every field its sections[i][…] name in the on-screen order, then send
    form.addEventListener('submit', function () {
      sending = true;
      sectionsOnScreen().forEach(function (section, i) {
        var base = 'sections[' + i + ']';
        section.querySelectorAll('[data-field]').forEach(function (field) {
          if (field.closest('[data-section]') === section) field.name = base + '[' + field.getAttribute('data-field') + ']';
        });
        children(section.querySelector('[data-item-list]'), '[data-item]').forEach(function (item, j) {
          item.querySelectorAll('[data-item-field]').forEach(function (field) {
            field.name = base + '[items][' + j + '][' + field.getAttribute('data-item-field') + ']';
          });
        });
        children(section.querySelector('[data-media-list]'), '[data-media]').forEach(function (media, k) {
          media.querySelectorAll('[data-media-field]').forEach(function (field) {
            field.name = base + '[media][' + k + '][' + field.getAttribute('data-media-field') + ']';
          });
        });
        section.querySelector('[data-media-input]').name = 'media__' + section.querySelector('[data-field="uid"]').value;
      });
      var button = form.querySelector('button[type="submit"]');
      setTimeout(function () { button.disabled = true; }, 0);
    });
  });

  // ---- Equipment group: picking a known Vietnamese group fills in its English (unless typed by hand) ----
  document.querySelectorAll('[data-group-pairs]').forEach(function (row) {
    var pairs = JSON.parse(row.getAttribute('data-group-pairs') || '[]');
    var vi = row.querySelector('[name="subcategory"]');
    var en = row.querySelector('[name="subcategoryEn"]');
    var autoValue = null; // last value we filled in, so we only replace our own suggestion
    vi.addEventListener('input', function () {
      var match = pairs.filter(function (p) { return p.vi === vi.value.trim() && p.en; })[0];
      if (en.value && en.value !== autoValue) return;
      autoValue = match ? match.en : null;
      en.value = match ? match.en : '';
    });
  });

  // ---- Drag-and-drop ordering: rows reorder by dragging the handle, saved immediately ----
  function rowIds(tbody) {
    return Array.prototype.map.call(tbody.querySelectorAll('tr[data-id]'), function (tr) { return tr.getAttribute('data-id'); });
  }

  function restoreOrder(tbody, ids) {
    ids.forEach(function (id) {
      var row = tbody.querySelector('tr[data-id="' + id + '"]');
      if (row) tbody.appendChild(row);
    });
  }

  function saveOrder(tbody, previousIds) {
    var ids = rowIds(tbody);
    if (ids.join() === previousIds.join()) return;
    fetch('/admin/thu-tu/' + encodeURIComponent(tbody.getAttribute('data-sortable')), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids }),
      credentials: 'same-origin',
    })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('not ok');
        showToast(I18N.orderSaved, 'success');
      })
      .catch(function () {
        restoreOrder(tbody, previousIds);
        showToast(I18N.orderError, 'error');
      });
  }

  document.querySelectorAll('tbody[data-sortable]').forEach(function (tbody) {
    var before = null;
    if (window.Sortable) {
      tbody._sortable = window.Sortable.create(tbody, {
        handle: '.drag-handle',
        animation: 150,
        forceFallback: true, // same pointer-driven behaviour in every browser and on touch screens
        fallbackOnBody: true,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onStart: function () { before = rowIds(tbody); document.body.classList.add('is-sorting'); },
        onEnd: function () { document.body.classList.remove('is-sorting'); saveOrder(tbody, before); },
      });
    }

    // Keyboard alternative: focus a handle, then ↑ / ↓ moves the row
    tbody.addEventListener('keydown', function (e) {
      var handle = e.target.closest('.drag-handle');
      if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      if (tbody.classList.contains('is-filtered')) return; // reordering is paused while a search hides rows
      e.preventDefault();
      var row = handle.closest('tr');
      var sibling = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling) return;
      var previous = rowIds(tbody);
      if (e.key === 'ArrowUp') tbody.insertBefore(row, sibling);
      else tbody.insertBefore(sibling, row);
      handle.focus();
      saveOrder(tbody, previous);
    });
  });

  // ---- Name search for long lists: Google-style, every typed word must start a word of the name ----
  // Folding ignores case and Vietnamese accents ("thiet" finds "Thiết", "dien" finds "điện")
  function fold(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');
  }
  function words(text) {
    return fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  }
  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, function (m, name) { return vars[name] !== undefined ? vars[name] : m; });
  }

  // Marks the matched start of each word in the visible name; built from text nodes, never parsed as HTML
  function highlight(cell, query) {
    var text = cell._originalText;
    cell.textContent = text;
    if (!query.length) return;
    var folded = '';
    var map = []; // folded index -> original index
    for (var i = 0; i < text.length; i++) {
      var f = fold(text[i]);
      for (var k = 0; k < f.length; k++) { folded += f[k]; map.push(i); }
    }
    var ranges = [];
    var re = /[a-z0-9]+/g;
    var m;
    while ((m = re.exec(folded))) {
      var best = 0;
      query.forEach(function (q) { if (q.length > best && m[0].indexOf(q) === 0) best = q.length; });
      if (best) ranges.push([map[m.index], map[m.index + best - 1] + 1]);
    }
    if (!ranges.length) return;
    cell.textContent = '';
    var pos = 0;
    ranges.forEach(function (r) {
      if (r[0] > pos) cell.appendChild(document.createTextNode(text.slice(pos, r[0])));
      var mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = text.slice(r[0], r[1]);
      cell.appendChild(mark);
      pos = r[1];
    });
    if (pos < text.length) cell.appendChild(document.createTextNode(text.slice(pos)));
  }

  // One controller per list: the search box and/or the filter chips that target it (data-list-search / data-list-filter)
  var listTypes = [];
  document.querySelectorAll('[data-list-search], [data-list-filter]').forEach(function (el) {
    var type = el.getAttribute('data-list-search') || el.getAttribute('data-list-filter');
    if (listTypes.indexOf(type) === -1) listTypes.push(type);
  });
  listTypes.forEach(function (type) {
    var tbody = document.querySelector('tbody[data-sortable="' + type + '"], tbody[data-list="' + type + '"]');
    if (!tbody) return;
    var box = document.querySelector('[data-list-search="' + type + '"]');
    var chips = document.querySelector('[data-list-filter="' + type + '"]');
    var input = box && box.querySelector('input');
    var clearBtn = box && box.querySelector('.list-search-clear');
    var count = box && box.querySelector('.list-search-count');
    var none = document.querySelector('[data-list-search-none="' + type + '"]');
    var hint = document.querySelector('.sort-hint span');
    var hintText = hint ? hint.textContent : '';
    var param = chips ? chips.getAttribute('data-param') : '';
    var chipButtons = chips ? Array.prototype.slice.call(chips.querySelectorAll('.filter-chip')) : [];
    var filterValue = '';
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-id]'));
    // "Tìm theo" box (users list): the search looks in one field (ten / email / ngay) and sorts the list by it.
    // Until the person types or picks a field, the list keeps the server's order (owners first, then newest).
    var fieldSelect = box && box.querySelector('[data-search-field]');
    var picked = false;
    rows.forEach(function (tr, i) {
      tr._order = i;
      tr._searchWords = words(tr.getAttribute('data-search'));
      tr._nameCell = tr.querySelector('[data-search-name]');
      if (tr._nameCell) tr._nameCell._originalText = tr._nameCell.textContent.normalize('NFC');
      if (!fieldSelect) return;
      tr._emailCell = tr.querySelector('[data-search-email]');
      if (tr._emailCell) tr._emailCell._originalText = tr._emailCell.textContent.normalize('NFC');
      tr._emailWords = words(tr._emailCell ? tr._emailCell._originalText : '');
      tr._joined = (tr.getAttribute('data-joined') || '').split('/'); // [DD, MM, YYYY]
      tr._joinedTime = +tr.getAttribute('data-joined-time') || 0;
    });

    // "Ngày tham gia" takes one format, DD/MM/YYYY (the date column's), and only numbers and "/".
    // The box tidies it while typing: "2/" becomes "02/" (so 2/7/2026 ends as 02/07/2026), a "/" comes by itself
    // after 2 digits of day or month (15032024 → 15/03/2024), the year stops at 4 digits, anything else is dropped.
    function formatDate(text) {
      var parts = [''];
      String(text).split('').forEach(function (ch) {
        var i = parts.length - 1;
        if (ch === '/') {
          if (i < 2 && parts[i]) { if (parts[i].length === 1) parts[i] = '0' + parts[i]; parts.push(''); }
        } else if (ch >= '0' && ch <= '9') {
          if (i < 2 && parts[i].length === 2) parts.push(ch);
          else if (i < 2 || parts[i].length < 4) parts[i] += ch;
        }
      });
      return parts.join('/');
    }
    // Finished parts must match exactly; the part still being typed matches as a start
    // (a lone "2" in the day: 02 or 20–29; a lone "1" in the month: 01 or 10–12)
    function dateMatch(tr, raw) {
      var typed = raw.split('/');
      return typed.every(function (p, i) {
        var row = tr._joined[i] || '';
        if (!p) return i === typed.length - 1;
        if (i < typed.length - 1 || p.length === (i === 2 ? 4 : 2)) return row === p;
        return row.indexOf(p) === 0 || (i < 2 && row === '0' + p);
      });
    }
    var dateMode = function () { return !!fieldSelect && fieldSelect.value === 'ngay'; };
    // Rewrites the box in the tidy format, the cursor moving with the text (it stays at the end when typing there)
    function tidyDate() {
      var before = input.value;
      var after = formatDate(before);
      if (after === before) return;
      var caret = input.selectionStart;
      input.value = after;
      var pos = caret === null || caret >= before.length ? after.length : Math.max(0, Math.min(after.length, caret + after.length - before.length));
      try { input.setSelectionRange(pos, pos); } catch (e) { /* not focused */ }
    }
    // Phones show the number keypad for a date; Tên / Email get the normal keyboard back
    function setDateMode() {
      if (!fieldSelect) return;
      if (dateMode()) { input.setAttribute('inputmode', 'numeric'); tidyDate(); } else input.removeAttribute('inputmode');
    }

    var collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });
    var textOf = function (cell) { return cell ? cell._originalText : ''; };
    function sortRows(by) {
      var sorted = rows.slice().sort(function (a, b) {
        var diff = 0;
        if (by === 'ngay') diff = a._joinedTime - b._joinedTime;
        else if (by === 'email') diff = collator.compare(textOf(a._emailCell), textOf(b._emailCell));
        else if (by === 'ten') diff = collator.compare(textOf(a._nameCell), textOf(b._nameCell));
        return diff || a._order - b._order;
      });
      var current = Array.prototype.slice.call(tbody.querySelectorAll('tr[data-id]'));
      if (sorted.some(function (tr, i) { return tr !== current[i]; })) sorted.forEach(function (tr) { tbody.appendChild(tr); });
    }
    function setPlaceholder() {
      input.placeholder = fieldSelect.options[fieldSelect.selectedIndex].getAttribute('data-placeholder');
    }
    // × and Esc: empty box, back to the first field and the server's order
    function resetField() {
      if (!fieldSelect) return;
      picked = false;
      fieldSelect.selectedIndex = 0;
      setPlaceholder();
      setDateMode();
    }

    // changes: { key: value } (an empty value removes the key). One address update per change, and none when it is
    // the same: Chrome ignores updates past ~200 in 10 seconds, which fast typing would otherwise reach.
    function setUrl(changes) {
      var put = function (params) {
        Object.keys(changes).forEach(function (key) { if (changes[key]) params.set(key, changes[key]); else params.delete(key); });
      };
      var url = new URL(window.location.href);
      put(url.searchParams);
      var next = url.pathname + url.search + url.hash;
      if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, '', next);
      // ...and through the admin VI/EN switch and the links marked data-keep-query (request status tabs)
      document.querySelectorAll('a[href*="alang="], a[data-keep-query]').forEach(function (a) {
        var link = new URL(a.href);
        put(link.searchParams);
        a.href = link.pathname + link.search;
      });
    }

    function apply() {
      var raw = input ? input.value.trim() : '';
      var query = words(raw);
      var searching = query.length > 0;
      var active = searching || !!filterValue;
      var field = fieldSelect ? fieldSelect.value : '';
      var shown = 0;
      rows.forEach(function (tr) {
        var inFilter = !filterValue || tr.getAttribute('data-filter') === filterValue;
        var match = inFilter && (!searching || (field === 'ngay' ? dateMatch(tr, raw) : query.every(function (q) {
          return (field === 'email' ? tr._emailWords : tr._searchWords).some(function (w) { return w.indexOf(q) === 0; });
        })));
        tr.hidden = !match;
        if (tr._nameCell) highlight(tr._nameCell, match && field !== 'email' && field !== 'ngay' ? query : []);
        if (tr._emailCell) highlight(tr._emailCell, match && field === 'email' ? query : []);
        if (match) shown++;
      });
      var sorting = !!fieldSelect && (searching || picked);
      if (fieldSelect) sortRows(sorting ? field : '');

      chipButtons.forEach(function (b) {
        var on = b.getAttribute('data-value') === filterValue;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (box) {
        clearBtn.hidden = !input.value && !picked;
        count.textContent = active ? fill(box.getAttribute('data-count'), { shown: shown, total: rows.length }) : '';
      }
      if (none) {
        none.hidden = !active || shown > 0;
        none.textContent = searching ? fill(box.getAttribute('data-none'), { q: raw }) : (box ? box.getAttribute('data-none-filter') : '');
      }

      // Reordering a partial list would move items relative to hidden ones, so pause it while filtering
      tbody.classList.toggle('is-filtered', active);
      if (tbody._sortable) tbody._sortable.option('disabled', active);
      if (hint) hint.textContent = active && box ? box.getAttribute('data-drag-paused') : hintText;
      if (hint) hint.parentElement.classList.toggle('is-paused', active);

      // Keep the search and the chip in the URL so Back from an edit page brings them back
      var changes = {};
      if (input) changes.q = searching ? raw : '';
      if (fieldSelect) changes.theo = sorting ? field : '';
      if (param) changes[param] = filterValue;
      setUrl(changes);
    }

    if (input) {
      // A date takes numbers and "/" only: other keys are refused, a paste is cleaned by tidyDate
      input.addEventListener('beforeinput', function (e) {
        if (dateMode() && e.inputType === 'insertText' && e.data && /[^0-9/]/.test(e.data)) e.preventDefault();
      });
      input.addEventListener('input', function () { if (dateMode()) tidyDate(); apply(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && (input.value || picked)) { e.preventDefault(); input.value = ''; resetField(); apply(); }
      });
      clearBtn.addEventListener('click', function () { input.value = ''; resetField(); apply(); input.focus(); });
    }
    if (fieldSelect) {
      fieldSelect.addEventListener('change', function () { picked = true; setPlaceholder(); setDateMode(); apply(); });
    }
    // A chip click fades the rows it shows in (typing in the search box stays instant: a fade on every key would flicker)
    var shownRows = function () { return rows.filter(function (tr) { return !tr.hidden; }); };
    chipButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        var changed = filterValue !== b.getAttribute('data-value');
        filterValue = b.getAttribute('data-value');
        apply();
        if (changed) revealIn(null, shownRows());
      });
    });
    // Yêu cầu tư vấn: the status tabs (Tất cả / Mới / …) load a new page, which then fades its rows in the same way
    var REVEAL_NOTE = 'mtg-reveal-rows';
    document.querySelectorAll('.admin-topbar a[data-keep-query]').forEach(function (a) {
      a.addEventListener('click', function () { try { sessionStorage.setItem(REVEAL_NOTE, type); } catch (e) { /* storage blocked */ } });
    });

    var params = new URLSearchParams(window.location.search);
    var initialQ = input ? params.get('q') : '';
    var initialF = param ? params.get(param) : '';
    if (initialF && chipButtons.some(function (b) { return b.getAttribute('data-value') === initialF; })) filterValue = initialF;
    var initialField = fieldSelect ? params.get('theo') : '';
    if (initialField && Array.prototype.some.call(fieldSelect.options, function (o) { return o.value === initialField; })) {
      fieldSelect.value = initialField;
      picked = true;
      setPlaceholder();
    } else initialField = '';
    if (initialQ) input.value = initialQ;
    setDateMode();
    if (initialQ || filterValue || initialField) apply();
    try {
      if (sessionStorage.getItem(REVEAL_NOTE) === type) { sessionStorage.removeItem(REVEAL_NOTE); revealIn(null, shownRows()); }
    } catch (e) { /* storage blocked: the page just appears */ }
  });
})();

// ---- Narrow screens (960px and below): the menu is hidden and slides in from the left with the round ☰ button
// above the page title. ×, the dark backdrop, Esc or choosing a page close it; the page behind can't be reached
// (inert) while it is open, and focus goes back to ☰. ----
(function () {
  var menu = document.getElementById('adminSidebar');
  var openBtn = document.querySelector('.admin-menu-btn');
  var scrim = document.querySelector('.admin-scrim');
  var main = document.querySelector('.admin-main');
  if (!menu || !openBtn || !scrim) return;
  var closeBtn = menu.querySelector('.admin-menu-close');
  var hideTimer = null;

  function isOpen() { return menu.classList.contains('is-open'); }
  function open() {
    clearTimeout(hideTimer);
    scrim.hidden = false;
    void scrim.offsetWidth; // start the backdrop's fade from transparent
    scrim.classList.add('is-visible');
    menu.classList.add('is-open');
    document.documentElement.classList.add('has-admin-menu');
    openBtn.setAttribute('aria-expanded', 'true');
    if (main) main.inert = true;
    var current = menu.querySelector('.admin-nav a.active') || menu.querySelector('.admin-nav a');
    if (current) current.focus({ preventScroll: true });
  }
  function close(returnFocus) {
    if (!isOpen()) return;
    menu.classList.remove('is-open');
    scrim.classList.remove('is-visible');
    document.documentElement.classList.remove('has-admin-menu');
    openBtn.setAttribute('aria-expanded', 'false');
    if (main) main.inert = false;
    hideTimer = setTimeout(function () { scrim.hidden = true; }, 400); // after the fade
    if (returnFocus) openBtn.focus();
  }

  openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', function () { close(true); });
  scrim.addEventListener('click', function () { close(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(true); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a[href]')) close(false); });
  // Widening the window past 960px puts the menu back on the left: nothing may stay locked
  var narrow = window.matchMedia('(max-width: 960px)');
  if (narrow.addEventListener) narrow.addEventListener('change', function (e) { if (!e.matches) close(false); });
  // Coming back with the browser's Back button shows the page as it was left: closed
  window.addEventListener('pageshow', function (e) { if (e.persisted) close(false); });
})();
