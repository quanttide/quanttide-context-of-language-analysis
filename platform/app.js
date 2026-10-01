'use strict';

/* english-sentence-analyzer 工具逻辑
   工作数据结构与 example.json / 导出格式一致：
   { version, meta, units[], merge{}, kg[] } */

var STORE_KEY = 'esa.work.v1';

var PALETTE = [
  { c: '#2563eb', bg: '#eff6ff' },
  { c: '#7c3aed', bg: '#f5f3ff' },
  { c: '#059669', bg: '#ecfdf5' },
  { c: '#b45309', bg: '#fffbeb' }
];

var UNIT_TYPES = ['主干', '修饰', '嵌套'];
var ANALYSIS_KEYS = ['成分', '语法点', '关键词', '中译'];
var MERGE_KEYS = ['连接', '指代', '逻辑', '语气', '句意', '直译', '通顺版', '贯通解释'];

function palette(i) { return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]; }
function unitColorClass(i) { return 'u' + ((i % PALETTE.length) + 1); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}
function str(v) { return typeof v === 'string' ? v : ''; }
function trunc(s) { return s.length > 10 ? s.slice(0, 9) + '…' : s; }

function emptyWork() {
  return {
    version: 1,
    meta: { name: '', source: '', sentence: '' },
    units: [],
    merge: { '连接': '', '指代': '', '逻辑': '', '语气': '', '句意': '', '直译': '', '通顺版': '', '贯通解释': '' },
    kg: []
  };
}

function normalize(d) {
  var w = emptyWork();
  if (!d || typeof d !== 'object') return w;
  if (d.meta && typeof d.meta === 'object') {
    w.meta.name = str(d.meta.name);
    w.meta.source = str(d.meta.source);
    w.meta.sentence = str(d.meta.sentence);
  }
  if (Array.isArray(d.units)) {
    w.units = d.units.map(function (u, i) {
      u = u && typeof u === 'object' ? u : {};
      var a = u.analysis && typeof u.analysis === 'object' ? u.analysis : {};
      var unit = { id: str(u.id) || 'U' + (i + 1), type: str(u.type) || '主干', parent: str(u.parent), text: str(u.text), analysis: {} };
      ANALYSIS_KEYS.forEach(function (k) { unit.analysis[k] = str(a[k]); });
      return unit;
    });
  }
  if (d.merge && typeof d.merge === 'object') {
    MERGE_KEYS.forEach(function (k) { w.merge[k] = str(d.merge[k]); });
  }
  if (Array.isArray(d.kg)) {
    w.kg = d.kg.map(function (r) {
      r = r && typeof r === 'object' ? r : {};
      return { unit: str(r.unit), subject: str(r.subject), relation: str(r.relation), object: str(r.object) };
    });
  }
  return w;
}

var state = emptyWork();

function getPath(path) {
  return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, state);
}
function setPath(path, value) {
  var keys = path.split('.');
  var last = keys.pop();
  var target = keys.reduce(function (o, k) { return o[k]; }, state);
  target[last] = value;
}

function isDescendant(id, ancestorId) {
  var parent = {};
  state.units.forEach(function (u) { parent[u.id] = u.parent; });
  var cur = parent[id];
  var guard = 0;
  while (cur && guard++ < 100) {
    if (cur === ancestorId) return true;
    cur = parent[cur];
  }
  return false;
}

function nextUnitId() {
  var max = 0;
  state.units.forEach(function (u) {
    var m = /^U(\d+)$/.exec(u.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'U' + (max + 1);
}

function unitIdx(id) {
  for (var i = 0; i < state.units.length; i++) if (state.units[i].id === id) return i;
  return 0;
}

/* ---------- 渲染 ---------- */

function renderBound() {
  var nodes = document.querySelectorAll('[data-path^="meta."],[data-path^="merge."]');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].value = getPath(nodes[i].getAttribute('data-path')) || '';
  }
}

function renderUnits() {
  var box = document.getElementById('units');
  if (!state.units.length) {
    box.innerHTML = '<p class="hint">还没有单元。点「添加单元」开始拆分，或点「加载示例」看一个完整案例。</p>';
    return;
  }
  box.innerHTML = state.units.map(function (u, i) {
    var note = u.parent ? (u.id + ' ⊂ ' + u.parent + ' · ' + u.type) : (u.id + ' · ' + u.type);
    return '<div class="unit" style="border-top-color:' + palette(i).c + '">' +
      '<div class="unit-head">' +
        '<span class="mini ' + unitColorClass(i) + '">' + esc(u.id) + '</span>' +
        '<select data-path="units.' + i + '.type">' +
          UNIT_TYPES.map(function (t) {
            return '<option' + (t === u.type ? ' selected' : '') + '>' + t + '</option>';
          }).join('') +
        '</select>' +
        '<select data-path="units.' + i + '.parent">' +
          '<option value=""' + (u.parent ? '' : ' selected') + '>无（不嵌套）</option>' +
          state.units.map(function (o, j) {
            if (j === i || isDescendant(o.id, u.id)) return '';
            return '<option value="' + esc(o.id) + '"' + (o.id === u.parent ? ' selected' : '') + '>' + esc(o.id) + '</option>';
          }).join('') +
        '</select>' +
        '<button class="mini-btn del" data-action="del-unit" data-index="' + i + '">删除</button>' +
      '</div>' +
      '<label>单元文本（主谓齐全、可独立分析）</label>' +
      '<textarea class="short" data-path="units.' + i + '.text">' + esc(u.text) + '</textarea>' +
      '<div class="auto-note">' + esc(note) + '</div>' +
    '</div>';
  }).join('');
}

function renderAnalysis() {
  var box = document.getElementById('analysis-cards');
  if (!state.units.length) {
    box.innerHTML = '<p class="hint">先在「拆分单句」中添加单元。</p>';
    return;
  }
  box.innerHTML = state.units.map(function (u, i) {
    return '<div class="card" style="border-top:3px solid ' + palette(i).c + '">' +
      '<h3><span class="mini ' + unitColorClass(i) + '">' + esc(u.id) + '</span>' + esc(u.type) + '</h3>' +
      ANALYSIS_KEYS.map(function (k) {
        return '<label>' + k + '</label>' +
          '<textarea class="short" data-path="units.' + i + '.analysis.' + k + '">' + esc(u.analysis[k]) + '</textarea>';
      }).join('') +
    '</div>';
  }).join('');
}

function renderKgRows() {
  var box = document.getElementById('kg-rows');
  box.innerHTML = state.kg.map(function (r, i) {
    return '<div class="kg-row">' +
      '<select data-path="kg.' + i + '.unit">' +
        '<option value=""></option>' +
        state.units.map(function (u) {
          return '<option value="' + esc(u.id) + '"' + (u.id === r.unit ? ' selected' : '') + '>' + esc(u.id) + '</option>';
        }).join('') +
      '</select>' +
      '<input type="text" data-path="kg.' + i + '.subject" placeholder="主语/实体" value="' + esc(r.subject) + '">' +
      '<input type="text" data-path="kg.' + i + '.relation" placeholder="关系（推断请注明）" value="' + esc(r.relation) + '">' +
      '<input type="text" data-path="kg.' + i + '.object" placeholder="客体/实体" value="' + esc(r.object) + '">' +
      '<button class="mini-btn" data-action="del-kg" data-index="' + i + '">×</button>' +
    '</div>';
  }).join('');
}

function renderKgSvg() {
  var box = document.getElementById('kg-svg');
  var rows = state.kg.filter(function (r) { return r.subject && r.object; });
  if (!rows.length) {
    box.innerHTML = '<p class="hint">添加实体与关系后在此生成对照图，逐条对回译文核对句意。</p>';
    return;
  }

  function uniq(list) {
    var out = [], seen = {};
    list.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  var subjects = uniq(rows.map(function (r) { return r.subject; }));
  var objects = uniq(rows.map(function (r) { return r.object; }));

  var W = 920, BOX = 170, LX = 40, RX = W - 40 - BOX;
  var rowH = 64, nodeH = 44, padY = 26;
  var H = Math.max(subjects.length, objects.length) * rowH + padY * 2;

  function centerY(n) {
    var start = (H - n * rowH) / 2 + rowH / 2;
    return function (i) { return start + i * rowH; };
  }
  var yL = centerY(subjects.length), yR = centerY(objects.length);
  var sIndex = {}, oIndex = {};
  subjects.forEach(function (s, i) { sIndex[s] = i; });
  objects.forEach(function (o, i) { oIndex[o] = i; });

  function nodeColor(name, side) {
    for (var k = 0; k < rows.length; k++) {
      if ((side === 's' ? rows[k].subject : rows[k].object) === name) {
        return palette(unitIdx(rows[k].unit));
      }
    }
    return palette(0);
  }

  var defs = '<defs>' + PALETTE.map(function (p, i) {
    return '<marker id="arr' + i + '" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto">' +
      '<path d="M0,0 L9,4 L0,8 z" fill="' + p.c + '"/></marker>';
  }).join('') + '</defs>';

  var pairCount = {}, pairSeen = {};
  rows.forEach(function (r) {
    var k = r.subject + ' ' + r.object;
    pairCount[k] = (pairCount[k] || 0) + 1;
  });

  var edges = rows.map(function (r) {
    var k = r.subject + ' ' + r.object;
    var seen = pairSeen[k] || 0;
    pairSeen[k] = seen + 1;
    var dy = (seen - (pairCount[k] - 1) / 2) * 16;
    var ci = unitIdx(r.unit) % PALETTE.length;
    var p = palette(ci);
    var x1 = LX + BOX, y1 = yL(sIndex[r.subject]) + dy;
    var x2 = RX, y2 = yR(oIndex[r.object]) + dy;
    var dash = r.relation.indexOf('推断') >= 0 ? ' dash' : '';
    return '<path class="edge' + dash + '" stroke="' + p.c + '" ' +
      'd="M' + x1 + ',' + y1 + ' C' + (x1 + 90) + ',' + y1 + ' ' + (x2 - 90) + ',' + y2 + ' ' + x2 + ',' + y2 + '" ' +
      'marker-end="url(#arr' + ci + ')"/>' +
      '<text class="el" x="' + ((x1 + x2) / 2) + '" y="' + ((y1 + y2) / 2 - 8) + '" text-anchor="middle">' + esc(r.relation) + '</text>';
  }).join('');

  function nodeSvg(name, x, y, p) {
    return '<rect x="' + x + '" y="' + (y - nodeH / 2) + '" width="' + BOX + '" height="' + nodeH + '" rx="8" ' +
      'fill="' + p.bg + '" stroke="' + p.c + '" stroke-width="1.5"/>' +
      '<text class="nt" x="' + (x + BOX / 2) + '" y="' + (y + 5) + '" text-anchor="middle">' + esc(trunc(name)) + '</text>';
  }

  var nodes = subjects.map(function (s, i) { return nodeSvg(s, LX, yL(i), nodeColor(s, 's')); }).join('') +
    objects.map(function (o, i) { return nodeSvg(o, RX, yR(i), nodeColor(o, 'o')); }).join('');

  box.innerHTML = '<svg class="kg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="知识图谱对照图">' +
    defs + edges + nodes + '</svg>';
}

function renderAll() {
  renderBound();
  renderUnits();
  renderAnalysis();
  renderKgRows();
  renderKgSvg();
}

/* ---------- 保存与载入 ---------- */

var saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    var d = new Date();
    showStatus('已自动保存 ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2));
  } catch (e) {
    showStatus('自动保存失败（本地存储不可用）');
  }
}
function showStatus(msg) {
  document.getElementById('status').textContent = msg;
}
function loadWork(data) {
  state = normalize(data);
  renderAll();
}

function loadExample(silent) {
  fetch('example.json').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (data) {
    loadWork(data);
    save();
    showStatus('已加载示例');
  }).catch(function () {
    if (silent) return;
    alert('读取 example.json 失败。本地以 file:// 打开时浏览器可能禁止读取：请改用「导入」选择 platform/example.json，或用本地 HTTP 服务打开。');
  });
}

function exportJson() {
  var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'esa-work.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  showStatus('已导出 esa-work.json');
}

/* ---------- 事件 ---------- */

function onInput(e) {
  var el = e.target;
  if (!el.getAttribute) return;
  var path = el.getAttribute('data-path');
  if (!path) return;
  setPath(path, el.value);
  if (/^units\.\d+\.(type|parent)$/.test(path)) renderAll();
  else if (/^kg\.\d+\./.test(path)) renderKgSvg();
  scheduleSave();
}

function onClick(e) {
  var el = e.target.closest ? e.target.closest('[data-action]') : null;
  if (!el) return;
  var action = el.getAttribute('data-action');
  var index = parseInt(el.getAttribute('data-index'), 10);

  if (action === 'add-unit') {
    state.units.push({
      id: nextUnitId(),
      type: state.units.length ? '修饰' : '主干',
      parent: '',
      text: '',
      analysis: { '成分': '', '语法点': '', '关键词': '', '中译': '' }
    });
    renderAll();
    scheduleSave();
  } else if (action === 'del-unit') {
    var removed = state.units.splice(index, 1)[0];
    if (removed) {
      state.units.forEach(function (u) { if (u.parent === removed.id) u.parent = ''; });
    }
    renderAll();
    scheduleSave();
  } else if (action === 'add-kg') {
    state.kg.push({ unit: '', subject: '', relation: '', object: '' });
    renderKgRows();
    scheduleSave();
  } else if (action === 'del-kg') {
    state.kg.splice(index, 1);
    renderKgRows();
    renderKgSvg();
    scheduleSave();
  } else if (action === 'load-example') {
    loadExample(false);
  } else if (action === 'import') {
    document.getElementById('file-input').click();
  } else if (action === 'export') {
    exportJson();
  } else if (action === 'clear') {
    if (confirm('清空当前工作？此操作不可撤销，建议先导出备份。')) {
      state = emptyWork();
      try { localStorage.removeItem(STORE_KEY); } catch (e2) {}
      renderAll();
      showStatus('已清空');
    }
  }
}

function init() {
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('click', onClick);

  document.getElementById('file-input').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        loadWork(JSON.parse(String(reader.result)));
        save();
        showStatus('已导入 ' + f.name);
      } catch (err) {
        alert('JSON 解析失败：' + err.message);
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  var saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
  if (saved) {
    try {
      loadWork(JSON.parse(saved));
      showStatus('已恢复上次的工作');
      return;
    } catch (e) {}
  }
  loadExample(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
