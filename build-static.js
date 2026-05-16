const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

const VAULT = require('os').homedir() + '/.qclaw/workspace/knowledge';

// Read card data
const cards = JSON.parse(fs.readFileSync('/tmp/cards.json', 'utf-8'));

// Sanitize secrets from strings before embedding
function sanitize(str) {
  return str
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-xxx[已隐藏]')
    .replace(/ghp_[a-zA-Z0-9]{20,}/g, 'ghp_xxx[已隐藏]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '***@***');
}

// Attach HTML content to each card
for (let card of cards) {
  card.summary = sanitize(card.summary || '');
  card.bullets = (card.bullets || []).map(sanitize);
  card.domain = sanitize(card.domain || '');

  const filePath = path.join(VAULT, card.path);
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { content } = matter(raw);
    card.content = sanitize(marked.parse(content));
  } else {
    card.content = '<p>内容不可用</p>';
  }
}

// Build a self-contained HTML file
const css = fs.readFileSync(path.join(__dirname, 'public/style.css'), 'utf-8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🃏 知识卡</title>
<style>${css}</style>
</head>
<body>

<header>
  <div class="header-left">
    <span class="logo">🃏</span>
    <span class="title">知识卡</span>
    <span class="count" id="cardCount">0 张</span>
  </div>
  <div class="header-right">
    <input type="text" id="searchInput" placeholder="搜索..." autocomplete="off">
  </div>
</header>

<main id="mainContent">
  <div class="cards-grid" id="cardsGrid"></div>
  <div id="emptyState" class="empty-state hidden">
    <div class="empty-icon">📭</div>
    <p>还没有知识卡</p>
  </div>
</main>

<div class="modal-overlay hidden" id="detailModal">
  <div class="modal-detail">
    <div class="modal-header">
      <h2 id="detailTitle"></h2>
      <button class="btn-icon close-btn" onclick="closeModal('detailModal')">✕</button>
    </div>
    <div class="modal-meta" id="detailMeta"></div>
    <div class="modal-body" id="detailBody"></div>
    <div class="modal-footer">
      <button class="btn btn-sm" id="btnToggleReview"></button>
      <button class="btn btn-sm" id="btnTogglePin"></button>
    </div>
  </div>
</div>

<div class="modal-overlay hidden" id="noteModal">
  <div class="modal-form modal-sm">
    <div class="modal-header">
      <h2>📝 备注</h2>
      <button class="btn-icon close-btn" onclick="closeModal('noteModal')">✕</button>
    </div>
    <div class="modal-body">
      <textarea id="noteText" rows="4" placeholder="写点备注..."></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-cancel" onclick="closeModal('noteModal')">取消</button>
      <button class="btn btn-primary" onclick="saveNote()">保存</button>
    </div>
  </div>
</div>

<script>
// ═══════ CARD DATA ═══════
const CARD_DATA = ${JSON.stringify(cards)};

// ═══════ APP LOGIC ═══════
let cards = [];
let currentCardId = null;
let noteCardId = null;

function loadCards() {
  cards = [...CARD_DATA];
  loadLocalMeta();
  renderCards();
  document.getElementById('cardCount').textContent = cards.length + ' 张';
}

function loadLocalMeta() {
  try {
    const saved = JSON.parse(localStorage.getItem('kc_meta') || '{}');
    cards.forEach(c => {
      if (saved[c.id]) {
        if (saved[c.id].pinned) c.pinned = true;
        if (saved[c.id].reviewed) c.reviewed = true;
        if (saved[c.id].note) c.note = saved[c.id].note;
      }
    });
  } catch(e) {}
}

function saveLocalMeta() {
  const meta = {};
  cards.forEach(c => {
    meta[c.id] = { pinned: !!c.pinned, reviewed: !!c.reviewed, note: c.note || '' };
  });
  localStorage.setItem('kc_meta', JSON.stringify(meta));
}

function renderCards() {
  const grid = document.getElementById('cardsGrid');
  const empty = document.getElementById('emptyState');
  const query = (document.getElementById('searchInput').value || '').toLowerCase();

  let filtered = cards;
  if (query) {
    filtered = cards.filter(c =>
      c.title.toLowerCase().includes(query) ||
      (c.summary||'').toLowerCase().includes(query) ||
      (c.domain||'').toLowerCase().includes(query) ||
      c.bullets.some(b => b.toLowerCase().includes(query)) ||
      (c.note||'').toLowerCase().includes(query)
    );
  }

  if (cards.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  document.getElementById('cardCount').textContent = filtered.length + ' / ' + cards.length + ' 张';

  grid.innerHTML = filtered.map(c => '<div class="card ' + (c.pinned ? 'pinned' : '') + '" onclick="openDetail(\\'' + c.id + '\\')"><div class="card-header"><span class="card-title">' + escHtml(c.title) + '</span><span class="card-tag tag-' + c.category + '">' + categoryLabel(c.category) + '</span></div>' + (c.summary ? '<div class="card-summary">' + escHtml(c.summary) + '</div>' : '') + (c.bullets.length ? '<div class="card-bullets">' + c.bullets.slice(0,3).map(b => '<span class="card-bullet">' + escHtml(b) + '</span>').join('') + '</div>' : '') + '<div class="card-footer"><span>' + (c.domain || '未分类') + (c.note ? ' 💬' : '') + '</span><div class="card-actions" onclick="event.stopPropagation()">' + (c.reviewed ? '<span class="card-badge badge-reviewed">已复习</span>' : '') + (c.pinned ? '<span class="card-badge badge-pinned">置顶</span>' : '') + '<button class="btn-icon" onclick="togglePin(\\'' + c.id + '\\')">📌</button><button class="btn-icon" onclick="openNote(\\'' + c.id + '\\')">📝</button></div></div></div>').join('');
}

function openDetail(id) {
  currentCardId = id;
  const card = cards.find(c => c.id === id);
  if (!card) return;
  document.getElementById('detailTitle').textContent = card.title;
  document.getElementById('detailMeta').innerHTML = '<span class="card-tag tag-' + card.category + '">' + categoryLabel(card.category) + '</span>' + (card.domain ? ' <span class="tag">' + escHtml(card.domain) + '</span>' : '') + (card.updatedAt ? ' <span>更新于 ' + card.updatedAt + '</span>' : '');
  document.getElementById('detailBody').innerHTML = card.content || '<p>暂无详细内容</p>';
  document.getElementById('btnToggleReview').textContent = card.reviewed ? '✅ 已复习' : '📖 标记已复习';
  document.getElementById('btnToggleReview').onclick = function() { toggleReview(id); };
  document.getElementById('btnTogglePin').textContent = card.pinned ? '📌 取消置顶' : '📌 置顶';
  document.getElementById('btnTogglePin').onclick = function() { togglePin(id); };
  showModal('detailModal');
}

function togglePin(id) {
  const card = cards.find(c => c.id === id);
  if (card) card.pinned = !card.pinned;
  saveLocalMeta();
  renderCards();
}

function toggleReview(id) {
  const card = cards.find(c => c.id === id);
  if (card) card.reviewed = !card.reviewed;
  saveLocalMeta();
  renderCards();
  closeModal('detailModal');
}

function openNote(id) {
  noteCardId = id;
  const card = cards.find(c => c.id === id);
  document.getElementById('noteText').value = card ? (card.note || '') : '';
  showModal('noteModal');
}

function saveNote() {
  const note = document.getElementById('noteText').value.trim();
  const card = cards.find(c => c.id === noteCardId);
  if (card) card.note = note;
  saveLocalMeta();
  renderCards();
  closeModal('noteModal');
}

function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function categoryLabel(cat) {
  var map = { concept: '概念', topic: '主题', entity: '实体', life: '生活', work: '工作' };
  return map[cat] || cat;
}

function escHtml(str) {
  var div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Init
document.addEventListener('DOMContentLoaded', function() {
  loadCards();
  document.getElementById('searchInput').addEventListener('input', debounce(renderCards, 200));
});

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// Close on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(function(m) { closeModal(m.id); });
  }
});

function debounce(fn, ms) {
  var timer;
  return function() {
    var args = arguments;
    var ctx = this;
    clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(ctx, args); }, ms);
  };
}
</script>
</body>
</html>`;

const outDir = path.join(__dirname, 'docs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('✅ 静态版已生成: docs/index.html');
console.log('📦 文件大小:', (fs.statSync(path.join(outDir, 'index.html')).size / 1024).toFixed(0) + 'KB');
