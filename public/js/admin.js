// Admin area behaviour: chart tooltips, confirmations, drag-and-drop ordering and small form helpers.
(function () {
  var I18N = window.ADMIN_I18N || { orderSaved: 'Saved', orderError: 'Error' };

  // ---- Notifications: green (success) / red (error), with icon, close button and auto-hide ----
  var toast = document.getElementById('adminToast');
  var toastTimer = null;
  var ICONS = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
  };
  function hideToast() {
    if (!toast) return;
    toast.classList.remove('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 250);
  }
  function showToast(text, type) {
    if (!toast || !text) return;
    var isError = type === 'error';
    toast.querySelector('.toast-text').textContent = text;
    toast.querySelector('.toast-icon').innerHTML = ICONS[isError ? 'error' : 'success'];
    toast.classList.toggle('is-error', isError);
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.hidden = false;
    clearTimeout(toastTimer);
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });
    toastTimer = setTimeout(hideToast, isError ? 7000 : 4000);
  }
  if (toast) {
    toast.querySelector('.toast-close').addEventListener('click', hideToast);
    // Message from the server (previous action's result, or a form error)
    if (toast.dataset.text) showToast(toast.dataset.text, toast.dataset.type);
  }

  // ---- Charts follow the mouse only: a click never focuses (and so never pins) a column, slice or row.
  // They stay reachable with Tab, and keyboard focus still shows the same highlight and tooltip. ----
  var keyFocus = function (el) { try { return el.matches(':focus-visible'); } catch (err) { return true; } };
  document.querySelectorAll('.chart-col, .pie-slice, .hbar-row').forEach(function (el) {
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
    var hide = function () { tip.hidden = true; };
    document.querySelectorAll('[data-tip]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) { show(el, e.clientX, e.clientY); });
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', function () {
        if (!keyFocus(el)) return;
        var r = el.getBoundingClientRect();
        show(el, r.left + r.width / 2, r.top);
      });
      el.addEventListener('blur', hide);
    });
    window.addEventListener('scroll', hide, { passive: true });
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

  // ---- Status pie: a slice and its legend row highlight together; the slice slides out, the others dim ----
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
    function openTab(key) {
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('data-tab') === key;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
      });
      panels.forEach(function (panel) { panel.hidden = panel.getAttribute('data-panel') !== key; });
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
    initTabs(form);
    var current = form.querySelector('[data-current-tab]');
    form.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { current.value = tab.getAttribute('data-tab'); });
    });
    // A link to one banner (#banner-workshop) lands on the Banners tab with that card in view
    if (location.hash.indexOf('#banner-') === 0) {
      var card = document.getElementById(location.hash.slice(1));
      if (card) {
        var tabBtn = form.querySelector('[data-tab="banners"]');
        if (tabBtn) tabBtn.click();
        card.scrollIntoView({ block: 'center' });
      }
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

  // ---- Solution-page editor: sections (type, nested items, photos/videos), all reorderable by drag ----
  document.querySelectorAll('[data-page-form]').forEach(function (form) {
    initTabs(form);
    var list = form.querySelector('[data-section-list]');
    var badge = form.querySelector('[data-section-count]');
    var tplSection = document.getElementById('tpl-page-section');
    var tplItem = document.getElementById('tpl-page-item');
    var sortableOpts = { animation: 150, forceFallback: true, fallbackOnBody: true, ghostClass: 'sortable-ghost' };
    function children(parent, selector) {
      return Array.prototype.filter.call(parent.children, function (el) { return el.matches(selector); });
    }
    function sectionsOnScreen() { return children(list, '[data-section]'); }
    function setText(el, text) { if (el && el.textContent !== String(text)) el.textContent = text; }

    // Each item is labelled after its section's type ("Thẻ 2", "Bước 3"…)
    function applyItemKind(item, kind, section) {
      item.querySelectorAll('[data-item-kinds]').forEach(function (el) {
        el.hidden = el.getAttribute('data-item-kinds').split(' ').indexOf(kind) === -1;
      });
      var labelKind = kind === 'text' ? 'buttons' : kind;
      item.querySelectorAll('[data-swap-label]').forEach(function (label) {
        setText(label, label.getAttribute('data-label-' + labelKind) || label.getAttribute('data-label-default'));
      });
      setText(item.querySelector('[data-item-label]'), section.getAttribute('data-item-label-' + kind) || '');
    }

    // Show only the fields the chosen section type uses
    function applyKind(section) {
      var select = section.querySelector('[data-section-kind]');
      var kind = select.value;
      section.setAttribute('data-kind', kind);
      setText(section.querySelector('[data-kind-label]'), select.options[select.selectedIndex].text);
      section.querySelectorAll('[data-kinds]').forEach(function (el) {
        el.hidden = el.getAttribute('data-kinds').split(' ').indexOf(kind) === -1;
      });
      // A display style the new type doesn't offer falls back to "normal"
      var display = section.querySelector('[data-field="display"]');
      if (display && display.selectedIndex > 0 && display.options[display.selectedIndex].hidden) display.value = '';
      ['[data-items-title]', '[data-add-item]', '[data-media-title]'].forEach(function (sel) {
        var el = section.querySelector(sel);
        if (el && el.getAttribute('data-label-' + kind)) setText(el, el.getAttribute('data-label-' + kind));
      });
      section.querySelectorAll('[data-item]').forEach(function (item) { applyItemKind(item, kind, section); });
    }

    function initSection(section) {
      var uid = section.querySelector('[data-field="uid"]');
      if (!uid.value) uid.value = 's' + Math.random().toString(36).slice(2, 10);
      applyKind(section);
      if (window.Sortable) {
        window.Sortable.create(section.querySelector('[data-item-list]'), Object.assign({ handle: '.item-drag' }, sortableOpts));
        window.Sortable.create(section.querySelector('[data-media-list]'), Object.assign({ handle: '.media-drag' }, sortableOpts));
      }
    }

    // Numbers, the tab count, and "attach to the section above" (not offered for the first section)
    function refresh() {
      var sections = sectionsOnScreen();
      sections.forEach(function (section, i) {
        setText(section.querySelector('[data-row-num]'), i + 1);
        section.querySelector('.page-continued').hidden = i === 0;
        children(section.querySelector('[data-item-list]'), '[data-item]').forEach(function (item, j) {
          setText(item.querySelector('[data-row-num]'), j + 1);
        });
      });
      setText(badge, sections.length);
    }

    sectionsOnScreen().forEach(initSection);
    refresh();
    new MutationObserver(refresh).observe(list, { childList: true, subtree: true });
    if (window.Sortable) window.Sortable.create(list, Object.assign({ handle: '.section-drag', draggable: '[data-section]' }, sortableOpts));

    form.addEventListener('click', function (e) {
      if (e.target.closest('[data-add-section]')) {
        list.appendChild(tplSection.content.cloneNode(true));
        var section = list.lastElementChild;
        initSection(section);
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        section.querySelector('[data-section-kind]').focus();
        return;
      }
      var addItem = e.target.closest('[data-add-item]');
      if (addItem) {
        var sectionEl = addItem.closest('[data-section]');
        var items = sectionEl.querySelector('[data-item-list]');
        items.appendChild(tplItem.content.cloneNode(true));
        applyItemKind(items.lastElementChild, sectionEl.getAttribute('data-kind'), sectionEl);
        items.lastElementChild.querySelector('input').focus();
        return;
      }
      var removeMedia = e.target.closest('[data-remove-media]');
      if (removeMedia) removeMedia.closest('[data-media]').remove();
    });

    form.addEventListener('change', function (e) {
      var box = e.target.closest('[data-mirror]');
      if (box) box.closest('[data-mirror-wrap]').querySelector('input[type="hidden"]').value = box.checked ? '1' : '0';
      var kindSelect = e.target.closest('[data-section-kind]');
      if (kindSelect) applyKind(kindSelect.closest('[data-section]'));
      // Picked files are listed until the page is saved
      var input = e.target.closest('[data-media-input]');
      if (input) {
        var pending = input.closest('[data-section]').querySelector('[data-media-pending]');
        var names = Array.prototype.map.call(input.files, function (f) { return f.name; });
        pending.hidden = !names.length;
        pending.querySelector('[data-media-pending-list]').textContent = names.join(', ');
      }
    });

    // Give every field its sections[i][…] name in the on-screen order, then send
    form.addEventListener('submit', function () {
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
    var tbody = document.querySelector('tbody[data-sortable="' + type + '"]');
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
    rows.forEach(function (tr) {
      tr._searchWords = words(tr.getAttribute('data-search'));
      tr._nameCell = tr.querySelector('[data-search-name]');
      if (tr._nameCell) tr._nameCell._originalText = tr._nameCell.textContent.normalize('NFC');
    });

    function setUrl(key, value) {
      var url = new URL(window.location.href);
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      // ...and through the admin VI/EN switch
      document.querySelectorAll('a[href*="alang="]').forEach(function (a) {
        var link = new URL(a.href);
        if (value) link.searchParams.set(key, value); else link.searchParams.delete(key);
        a.href = link.pathname + link.search;
      });
    }

    function apply() {
      var raw = input ? input.value.trim() : '';
      var query = words(raw);
      var searching = query.length > 0;
      var active = searching || !!filterValue;
      var shown = 0;
      rows.forEach(function (tr) {
        var inFilter = !filterValue || tr.getAttribute('data-filter') === filterValue;
        var match = inFilter && (!searching || query.every(function (q) {
          return tr._searchWords.some(function (w) { return w.indexOf(q) === 0; });
        }));
        tr.hidden = !match;
        if (tr._nameCell) highlight(tr._nameCell, match ? query : []);
        if (match) shown++;
      });

      chipButtons.forEach(function (b) {
        var on = b.getAttribute('data-value') === filterValue;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (box) {
        clearBtn.hidden = !input.value;
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
      if (input) setUrl('q', searching ? raw : '');
      if (param) setUrl(param, filterValue);
    }

    if (input) {
      input.addEventListener('input', apply);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; apply(); }
      });
      clearBtn.addEventListener('click', function () { input.value = ''; apply(); input.focus(); });
    }
    chipButtons.forEach(function (b) {
      b.addEventListener('click', function () { filterValue = b.getAttribute('data-value'); apply(); });
    });

    var params = new URLSearchParams(window.location.search);
    var initialQ = input ? params.get('q') : '';
    var initialF = param ? params.get(param) : '';
    if (initialF && chipButtons.some(function (b) { return b.getAttribute('data-value') === initialF; })) filterValue = initialF;
    if (initialQ) input.value = initialQ;
    if (initialQ || filterValue) apply();
  });
})();
