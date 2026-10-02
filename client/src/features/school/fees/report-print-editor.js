// ═══════════════════════════════════════════════════════════════════════════
// ─── Editable print preview — runs INSIDE the report print window ──────────
// ═══════════════════════════════════════════════════════════════════════════
//
// Imported as a raw string (report-print.ts) and injected into every Reports
// Center print window, so it must stay plain browser JS with no imports.
//
// Lets school staff touch up a report before printing: edit any text, delete /
// add rows, delete columns or whole tables, remove blocks, add remarks, switch
// orientation and text size. Edits live in this window only — nothing is ever
// saved back to the school's records.
//
// Totals: at load every footer cell whose value already equals the sum of its
// column is marked as a "live total" and re-summed after every edit, so
// deleting a row keeps the printed totals right. Footer cells that are not a
// plain column sum (percentages, counts, labels) are never touched, and a
// total the user types over by hand stops auto-updating.
(function () {
  'use strict';
  if (window.__peReady) return;
  window.__peReady = true;

  var MM = 96 / 25.4;
  var PAGE_W = { portrait: 210, landscape: 297 };
  var body = document.body;
  var self = document.currentScript;

  // ── Measure the report's own page setup before our screen styles apply ──
  var pageMargin = 10;
  var orientation = 'portrait';
  (function readPageRule() {
    function walk(rules) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.type === 6 /* CSSRule.PAGE_RULE */) {
          var size = r.style.getPropertyValue('size') || '';
          if (/landscape/i.test(size)) orientation = 'landscape';
          var m = parseFloat(r.style.getPropertyValue('margin-left') || r.style.getPropertyValue('margin'));
          if (!isNaN(m)) pageMargin = m;
        } else if (r.cssRules) {
          walk(r.cssRules);
        }
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      try { walk(document.styleSheets[s].cssRules); } catch (e) { /* cross-origin sheet */ }
    }
  })();
  var bodyPadX = parseFloat(getComputedStyle(body).paddingLeft) || 0;

  // ── Wrap the report in an editable "paper" ──
  var doc = document.createElement('div');
  doc.id = 'pe-doc';
  doc.setAttribute('spellcheck', 'false');
  Array.prototype.slice.call(body.childNodes).forEach(function (n) {
    if (n !== self) doc.appendChild(n);
  });
  body.insertBefore(doc, self);
  // screen-only (see CSS): paper padding mirrors the report's own body padding
  doc.style.setProperty('--pe-pad', bodyPadX + 'px');

  var pageStyle = document.createElement('style');
  document.head.appendChild(pageStyle);

  // ── Toolbar ──
  var ICON = {
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }
  function btn(act, label, opts) {
    opts = opts || {};
    return '<button type="button" data-act="' + act + '" class="pe-btn' + (opts.cls ? ' ' + opts.cls : '') + '"'
      + (opts.title ? ' title="' + opts.title + '"' : '') + '>'
      + (opts.icon ? icon(opts.icon) : '') + (label ? '<span>' + label + '</span>' : '') + '</button>';
  }

  var bar = document.createElement('div');
  bar.id = 'pe-bar';
  bar.innerHTML =
    '<div class="pe-row">'
    + '<div class="pe-title"><strong>Print Preview</strong><span id="pe-hint">Click any text to change it. Changes apply to this printout only — school records are not changed.</span></div>'
    + '<div class="pe-group">'
    + btn('close', 'Close', { icon: 'x', cls: 'pe-ghost' })
    + btn('print', 'Print', { icon: 'print', cls: 'pe-primary', title: 'Print (Ctrl+P)' })
    + '</div></div>'
    + '<div class="pe-row pe-tools">'
    + '<div class="pe-group">' + btn('edit', 'Editing on', { icon: 'pen', cls: 'pe-toggle', title: 'Turn text editing on/off' }) + '</div>'
    + '<div class="pe-group" data-grp="table"><span class="pe-label">Row</span>'
    + btn('row-del', 'Delete', { icon: 'trash', title: 'Delete the selected row' })
    + btn('row-add', 'Add below', { icon: 'plus', title: 'Insert an empty row below the selected row' })
    + '<span class="pe-sep"></span><span class="pe-label">Column</span>'
    + btn('col-del', 'Delete', { icon: 'trash', title: 'Delete the selected column' })
    + '<span class="pe-sep"></span>'
    + btn('table-del', 'Delete table', { icon: 'trash', title: 'Delete the whole table and its heading' })
    + '</div>'
    + '<div class="pe-group">'
    + btn('block-del', 'Remove item', { icon: 'trash', title: 'Remove the selected heading, box, logo or line' })
    + btn('remarks', 'Add remarks', { icon: 'note', title: 'Add a remarks box above the signatures' })
    + '</div>'
    + '<div class="pe-group">'
    + btn('undo', '', { icon: 'undo', title: 'Undo (Ctrl+Z)' })
    + btn('redo', '', { icon: 'redo', title: 'Redo (Ctrl+Y)' })
    + btn('reset', 'Reset', { icon: 'reset', title: 'Discard all changes' })
    + '</div>'
    + '<div class="pe-group"><span class="pe-label">Page</span>'
    + '<div class="pe-seg">' + btn('orient-portrait', 'Portrait') + btn('orient-landscape', 'Landscape') + '</div>'
    + '<span class="pe-sep"></span><span class="pe-label">Text</span>'
    + btn('zoom-out', '−', { title: 'Smaller text', cls: 'pe-sq' }) + '<span id="pe-zoom" class="pe-val">100%</span>'
    + btn('zoom-in', '+', { title: 'Larger text', cls: 'pe-sq' })
    + '</div>'
    + '</div>';
  body.insertBefore(bar, doc);

  var toast = document.createElement('div');
  toast.id = 'pe-toast';
  body.appendChild(toast);

  function $(act) { return bar.querySelector('[data-act="' + act + '"]'); }

  // ── State ──
  var editing = true;
  var zoom = 1;
  var activeCell = null;
  var activeBlock = null;
  var undoStack = [];
  var redoStack = [];
  var lastTypeSnap = 0;
  var edited = false;
  var original;

  // ── Number helpers ──
  var NUM_RE = /^([^\d\-.]{0,6}?)(-?)(\d[\d,]*(?:\.\d+)?|\.\d+)([^\d]{0,5})$/;
  function parseCell(text) {
    var t = (text || '').replace(/ /g, ' ').trim();
    if (t === '' || t === '-' || t === '—' || t === '–') return { value: 0, blank: true };
    var m = t.match(NUM_RE);
    if (!m) return null;
    var n = parseFloat(m[3].replace(/,/g, ''));
    if (isNaN(n)) return null;
    var dot = m[3].indexOf('.');
    return {
      value: m[2] ? -n : n,
      prefix: m[1],
      suffix: m[4],
      decimals: dot >= 0 ? m[3].length - dot - 1 : 0,
    };
  }
  function formatLike(cell, value) {
    var decimals = parseInt(cell.getAttribute('data-pe-dec') || '0', 10);
    if (value === 0 && cell.hasAttribute('data-pe-zero')) return cell.getAttribute('data-pe-zero');
    var s = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return (cell.getAttribute('data-pe-pre') || '') + (value < 0 ? '-' : '') + s + (cell.getAttribute('data-pe-suf') || '');
  }

  // ── Table grid helpers (colspan-aware; reports don't use rowspan) ──
  function colOf(cell) {
    var c = 0, cells = cell.parentElement.cells;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] === cell) return c;
      c += cells[i].colSpan || 1;
    }
    return -1;
  }
  function cellAt(row, col) {
    var c = 0;
    for (var i = 0; i < row.cells.length; i++) {
      var span = row.cells[i].colSpan || 1;
      if (col >= c && col < c + span) return row.cells[i];
      c += span;
    }
    return null;
  }
  function isFooterRow(r) {
    if (r.parentElement.tagName === 'TFOOT') return true;
    if (r.classList.contains('frow') || r.querySelector('[data-pe-sum]')) return true;
    var first = r.cells[0];
    return !!first && /^\s*(grand\s+)?total\b/i.test(first.textContent || '');
  }
  function bodyRows(table) {
    var out = [];
    for (var b = 0; b < table.tBodies.length; b++) {
      var rows = table.tBodies[b].rows;
      for (var i = 0; i < rows.length; i++) if (!isFooterRow(rows[i])) out.push(rows[i]);
    }
    return out;
  }
  function footerRows(table) {
    var out = [];
    var all = table.querySelectorAll('tr');
    for (var i = 0; i < all.length; i++) {
      if (all[i].closest('table') === table && all[i].parentElement.tagName !== 'THEAD' && isFooterRow(all[i])) out.push(all[i]);
    }
    return out;
  }
  function columnSum(rows, col) {
    var sum = 0, any = false;
    for (var i = 0; i < rows.length; i++) {
      var c = cellAt(rows[i], col);
      if (!c || (c.colSpan || 1) > 1) continue;
      var p = parseCell(c.textContent);
      if (!p) return null; // a non-numeric value in the column → not a summed column
      if (!p.blank) any = true;
      sum += p.value;
    }
    return { sum: Math.round(sum * 100) / 100, any: any };
  }

  // Mark live totals + serial-number columns once, from the untouched report.
  function analyseTables() {
    var tables = doc.querySelectorAll('table');
    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      var rows = bodyRows(table);
      if (!rows.length) continue;

      // Serial column: first column reads 1, 2, 3 … down the body rows.
      var serial = rows.every(function (r, i) {
        var c = r.cells[0];
        return c && (c.colSpan || 1) === 1 && (c.textContent || '').trim() === String(i + 1);
      });
      if (serial && rows.length > 1) rows.forEach(function (r) { r.cells[0].setAttribute('data-pe-sn', ''); });

      footerRows(table).forEach(function (fr) {
        for (var i = 0; i < fr.cells.length; i++) {
          var fc = fr.cells[i];
          if ((fc.colSpan || 1) > 1) continue;
          var fp = parseCell(fc.textContent);
          if (!fp) continue;
          var col = colOf(fc);
          var s = columnSum(rows, col);
          if (!s || (!s.any && fp.blank)) continue;
          if (Math.abs(s.sum - fp.value) > 0.5) continue;
          fc.setAttribute('data-pe-sum', '');
          fc.setAttribute('data-pe-dec', String(fp.decimals || 0));
          fc.setAttribute('data-pe-pre', fp.prefix || '');
          fc.setAttribute('data-pe-suf', fp.suffix || '');
          if (fp.blank) fc.setAttribute('data-pe-zero', (fc.textContent || '').trim());
        }
      });
    }
  }

  function recalc() {
    var changed = false;
    var tables = doc.querySelectorAll('table');
    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      var rows = bodyRows(table);
      rows.forEach(function (r, i) {
        var sn = r.querySelector('[data-pe-sn]');
        if (sn && sn.textContent.trim() !== String(i + 1)) { sn.textContent = String(i + 1); changed = true; }
      });
      var marked = table.querySelectorAll('[data-pe-sum]');
      for (var i = 0; i < marked.length; i++) {
        var fc = marked[i];
        if (fc.closest('table') !== table) continue;
        var s = columnSum(rows, colOf(fc));
        if (!s) continue; // user typed text into the column — leave the total alone
        var next = formatLike(fc, s.sum);
        if ((fc.textContent || '').trim() !== next) { fc.textContent = next; changed = true; }
      }
    }
    return changed;
  }

  // ── History ──
  function snapshot() { return doc.innerHTML; }
  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    edited = true;
    syncButtons();
  }
  function restore(html) {
    doc.innerHTML = html;
    activeCell = null;
    activeBlock = null;
    syncButtons();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    lastTypeSnap = 0;
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    lastTypeSnap = 0;
  }

  // ── Selection tracking ──
  function clearMarks() {
    var marked = doc.querySelectorAll('.pe-active-cell,.pe-active-row,.pe-active-col,.pe-active-block');
    for (var i = 0; i < marked.length; i++) {
      marked[i].classList.remove('pe-active-cell', 'pe-active-row', 'pe-active-col', 'pe-active-block');
    }
  }
  var BLOCK_SEL = '.pe-remarks,.box,.sig-box,.sigs,.summary,.footer,h1,h2,h3,h4,h5,p,img,.header > div';
  function setActive(node) {
    if (!node || !doc.contains(node)) { activeCell = null; activeBlock = null; paintMarks(); return; }
    var el = node.nodeType === 1 ? node : node.parentElement;
    var cell = el && el.closest('td,th');
    activeCell = cell && doc.contains(cell) ? cell : null;
    var block = !activeCell && el ? el.closest(BLOCK_SEL) : null;
    activeBlock = block && doc.contains(block) && block !== doc ? block : null;
    paintMarks();
  }
  function paintMarks() {
    clearMarks();
    if (activeCell) {
      var row = activeCell.parentElement;
      var table = activeCell.closest('table');
      activeCell.classList.add('pe-active-cell');
      if (row.parentElement.tagName !== 'THEAD') row.classList.add('pe-active-row');
      var col = colOf(activeCell);
      var rows = table.rows;
      for (var i = 0; i < rows.length; i++) {
        var c = cellAt(rows[i], col);
        if (c && (c.colSpan || 1) === 1) c.classList.add('pe-active-col');
      }
    } else if (activeBlock) {
      activeBlock.classList.add('pe-active-block');
    }
    syncButtons();
  }

  function syncButtons() {
    var inTable = !!activeCell;
    var row = inTable ? activeCell.parentElement : null;
    var inHead = row && row.parentElement.tagName === 'THEAD';
    $('row-del').disabled = !inTable || inHead;
    $('row-add').disabled = !inTable || inHead || isFooterRow(row);
    $('col-del').disabled = !inTable;
    $('table-del').disabled = !inTable;
    $('block-del').disabled = !activeBlock;
    $('undo').disabled = !undoStack.length;
    $('redo').disabled = !redoStack.length;
    $('reset').disabled = !edited;
    var hint = document.getElementById('pe-hint');
    if (inTable) {
      hint.textContent = inHead
        ? 'Column heading selected — type to rename it, or delete the column.'
        : 'Row selected — edit the cell, delete or add rows, or delete the column. Totals update automatically.';
    } else if (activeBlock) {
      hint.textContent = 'Item selected — type to change it, or remove it from the printout.';
    } else {
      hint.textContent = editing
        ? 'Click any text to change it. Changes apply to this printout only — school records are not changed.'
        : 'Editing is off. Click a row or item to delete it, or turn editing on to change text.';
    }
  }

  function flash(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(flash.t);
    flash.t = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  // ── Structural actions ──
  function deleteRow() {
    if (!activeCell) return;
    var row = activeCell.parentElement;
    pushHistory();
    var next = row.nextElementSibling || row.previousElementSibling;
    row.parentNode.removeChild(row);
    recalc();
    setActive(next && next.cells && next.cells[0]);
    flash('Row deleted');
  }
  function addRow() {
    if (!activeCell) return;
    var row = activeCell.parentElement;
    pushHistory();
    var clone = row.cloneNode(true);
    clone.classList.remove('pe-active-row');
    for (var i = 0; i < clone.cells.length; i++) {
      var c = clone.cells[i];
      c.classList.remove('pe-active-cell', 'pe-active-col');
      c.innerHTML = '';
    }
    row.parentNode.insertBefore(clone, row.nextSibling);
    recalc();
    var target = clone.querySelector('td:not([data-pe-sn])') || clone.cells[0];
    placeCaret(target);
    setActive(target);
  }
  function deleteColumn() {
    if (!activeCell) return;
    var table = activeCell.closest('table');
    var col = colOf(activeCell);
    pushHistory();
    var rows = Array.prototype.slice.call(table.rows);
    rows.forEach(function (r) {
      var c = cellAt(r, col);
      if (!c) return;
      if ((c.colSpan || 1) > 1) c.colSpan = c.colSpan - 1;
      else r.removeChild(c);
    });
    recalc();
    activeCell = null;
    paintMarks();
    flash('Column deleted');
  }
  function deleteTable() {
    if (!activeCell) return;
    var table = activeCell.closest('table');
    pushHistory();
    var prev = table.previousElementSibling;
    if (prev && /^H[1-6]$/.test(prev.tagName)) prev.parentNode.removeChild(prev);
    table.parentNode.removeChild(table);
    activeCell = null;
    paintMarks();
    flash('Table deleted');
  }
  function deleteBlock() {
    if (!activeBlock) return;
    pushHistory();
    activeBlock.parentNode.removeChild(activeBlock);
    activeBlock = null;
    paintMarks();
    flash('Removed from printout');
  }
  function addRemarks() {
    pushHistory();
    var box = document.createElement('div');
    box.className = 'pe-remarks';
    box.innerHTML = '<div class="pe-remarks-h">Remarks</div><div class="pe-remarks-b">Write remarks here…</div>';
    var sigs = doc.querySelectorAll('.sigs');
    var footers = doc.querySelectorAll('.footer');
    var anchor = sigs.length ? sigs[sigs.length - 1] : footers.length ? footers[footers.length - 1] : null;
    if (anchor) anchor.parentNode.insertBefore(box, anchor);
    else doc.appendChild(box);
    if (!editing) setEditing(true);
    var b = box.querySelector('.pe-remarks-b');
    var range = document.createRange();
    range.selectNodeContents(b);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setActive(b);
  }
  function placeCaret(el) {
    if (!editing) return;
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ── Page setup ──
  function setOrientation(o) {
    orientation = o;
    pageStyle.textContent = '@page{size:A4 ' + o + '}';
    var w = (PAGE_W[o] - pageMargin * 2) * MM;
    doc.style.setProperty('--pe-w', w + 'px');
    $('orient-portrait').classList.toggle('on', o === 'portrait');
    $('orient-landscape').classList.toggle('on', o === 'landscape');
  }
  function setZoom(z) {
    zoom = Math.max(0.6, Math.min(1.5, Math.round(z * 100) / 100));
    doc.style.zoom = String(zoom);
    document.getElementById('pe-zoom').textContent = Math.round(zoom * 100) + '%';
  }
  function setEditing(on) {
    editing = on;
    doc.contentEditable = on ? 'true' : 'false';
    doc.classList.toggle('pe-editing', on);
    var b = $('edit');
    b.classList.toggle('on', on);
    b.querySelector('span').textContent = on ? 'Editing on' : 'Editing off';
    syncButtons();
  }
  function doPrint() {
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    clearMarks();
    setTimeout(function () { window.print(); paintMarks(); }, 50);
  }

  // ── Wire up ──
  bar.addEventListener('mousedown', function (e) {
    // keep the caret/selection in the report while clicking toolbar buttons
    if (e.target.closest('button')) e.preventDefault();
  });
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    switch (b.getAttribute('data-act')) {
      case 'print': doPrint(); break;
      case 'close':
        if (!edited || window.confirm('Close the preview? Your changes to this printout will be lost.')) window.close();
        break;
      case 'edit': setEditing(!editing); break;
      case 'row-del': deleteRow(); break;
      case 'row-add': addRow(); break;
      case 'col-del': deleteColumn(); break;
      case 'table-del': deleteTable(); break;
      case 'block-del': deleteBlock(); break;
      case 'remarks': addRemarks(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'reset':
        if (window.confirm('Discard all changes and restore the original report?')) {
          pushHistory();
          restore(original);
          flash('Original report restored');
        }
        break;
      case 'orient-portrait': setOrientation('portrait'); break;
      case 'orient-landscape': setOrientation('landscape'); break;
      case 'zoom-out': setZoom(zoom - 0.05); break;
      case 'zoom-in': setZoom(zoom + 0.05); break;
    }
  });

  doc.addEventListener('click', function (e) { setActive(e.target); });
  document.addEventListener('selectionchange', function () {
    if (!editing) return;
    var sel = window.getSelection();
    if (sel && sel.anchorNode && doc.contains(sel.anchorNode)) setActive(sel.anchorNode);
  });

  doc.addEventListener('beforeinput', function () {
    var now = Date.now();
    if (now - lastTypeSnap > 1200) pushHistory();
    lastTypeSnap = now;
  });
  var recalcTimer;
  doc.addEventListener('input', function () {
    edited = true;
    // Typing over a live total hands it to the user — stop auto-updating it.
    var sel = window.getSelection();
    var n = sel && sel.anchorNode;
    var el = n && (n.nodeType === 1 ? n : n.parentElement);
    var cell = el && el.closest('[data-pe-sum]');
    if (cell) cell.removeAttribute('data-pe-sum');
    clearTimeout(recalcTimer);
    recalcTimer = setTimeout(recalc, 250);
    syncButtons();
  });
  doc.addEventListener('paste', function (e) {
    // plain text only, so pasted content takes the report's own styling
    var text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text == null) return;
    e.preventDefault();
    document.execCommand('insertText', false, text);
  });
  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      if (e.key === 'Escape') { setActive(null); var s = window.getSelection(); if (s) s.removeAllRanges(); }
      return;
    }
    var k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === 'p') { e.preventDefault(); doPrint(); }
  });
  window.addEventListener('beforeprint', clearMarks);
  window.addEventListener('afterprint', paintMarks);

  // Keep the report clear of the fixed toolbar whatever its wrapped height.
  function fitBar() { body.style.setProperty('--pe-bar-h', bar.offsetHeight + 'px'); }
  window.addEventListener('resize', fitBar);

  analyseTables();
  original = snapshot();
  document.documentElement.classList.add('pe-ready');
  setOrientation(orientation);
  setZoom(1);
  setEditing(true);
  fitBar();
  window.focus();
})();
