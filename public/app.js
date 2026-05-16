// ═══════════════════════════════════
//  知识卡 — Frontend Logic
// ═══════════════════════════════════

const API = '/api/cards';
let cards = [];
let currentCardId = null;

// ═══════ Init ═══════
document.addEventListener('DOMContentLoaded', () => {
  loadCards();
  document.getElementById('searchInput').addEventListener('input', debounce(renderCards, 200));
});

// ═══════ Load Cards ═══════
async function loadCards() {
  try {
    const res = await fetch(API);
    cards = await res.json();
    renderCards();
    document.getElementById('cardCount').textContent = cards.length + ' 张';
  } catch (err) {
    console.error('加载失败:', err);
    document.getElementById('cardsGrid').innerHTML = '<div class="empty-state"><p>⚠️ 无法连接服务</p></div>';
  }
}

// ═══════ Render Cards ═══════
function renderCards() {
  const grid = document.getElementById('cardsGrid');
  const empty = document.getElementById('emptyState');
  const query = document.getElementById('searchInput').value.toLowerCase();

  let filtered = cards;
  if (query) {
    filtered = cards.filter(c =>
      c.title.toLowerCase().includes(query) ||
      c.summary.toLowerCase().includes(query) ||
      c.domain.toLowerCase().includes(query) ||
      c.bullets.some(b => b.toLowerCase().includes(query)) ||
      c.note.toLowerCase().includes(query)
    );
  }

  if (cards.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    document.getElementById('cardCount').textContent = '0 张';
    return;
  }

  empty.classList.add('hidden');
  document.getElementById('cardCount').textContent = filtered.length + ' / ' + cards.length + ' 张';

  grid.innerHTML = filtered.map(c => `
    <div class="card ${c.pinned ? 'pinned' : ''}" onclick="openDetail('${c.id}')">
      <div class="card-header">
        <span class="card-title">${escHtml(c.title)}</span>
        <span class="card-tag tag-${c.category}">${categoryLabel(c.category)}</span>
      </div>
      ${c.summary ? `<div class="card-summary">${escHtml(c.summary)}</div>` : ''}
      ${c.bullets.length ? `
        <div class="card-bullets">
          ${c.bullets.slice(0, 3).map(b => `<span class="card-bullet">${escHtml(b)}</span>`).join('')}
        </div>` : ''}
      <div class="card-footer">
        <span>${c.domain || '未分类'}${c.note ? ' 💬' : ''}</span>
        <div class="card-actions" onclick="event.stopPropagation()">
          ${c.reviewed ? '<span class="card-badge badge-reviewed">已复习</span>' : ''}
          ${c.pinned ? '<span class="card-badge badge-pinned">置顶</span>' : ''}
          <button class="btn-icon" onclick="togglePin('${c.id}')" title="${c.pinned ? '取消置顶' : '置顶'}">📌</button>
          <button class="btn-icon" onclick="openNote('${c.id}')" title="备注">📝</button>
          <button class="btn-icon" onclick="deleteCard('${c.id}')" title="删除" style="font-size:14px">🗑</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ═══════ Detail Modal ═══════
async function openDetail(id) {
  currentCardId = id;
  try {
    const res = await fetch(API + '/' + id);
    const card = await res.json();
    document.getElementById('detailTitle').textContent = card.title;
    document.getElementById('detailMeta').innerHTML = `
      <span class="card-tag tag-${card.category}">${categoryLabel(card.category)}</span>
      ${card.domain ? `<span class="tag">${escHtml(card.domain)}</span>` : ''}
      ${card.updatedAt ? `<span>更新于 ${card.updatedAt}</span>` : ''}
    `;
    document.getElementById('detailBody').innerHTML = card.content || '<p>暂无详细内容</p>';
    document.getElementById('btnToggleReview').textContent = card.reviewed ? '✅ 已复习' : '📖 标记已复习';
    document.getElementById('btnToggleReview').onclick = () => toggleReview(id);
    document.getElementById('btnTogglePin').textContent = card.pinned ? '📌 取消置顶' : '📌 置顶';
    document.getElementById('btnTogglePin').onclick = () => togglePin(id);
    showModal('detailModal');
  } catch (err) {
    console.error('加载详情失败:', err);
  }
}

// ═══════ Add Card ═══════
function openAddCard() {
  document.getElementById('addModalTitle').textContent = '新建知识卡';
  document.getElementById('addTitle').value = '';
  document.getElementById('addCategory').value = 'concept';
  document.getElementById('addDomain').value = '';
  document.getElementById('addSummary').value = '';
  document.getElementById('addBullets').value = '';
  showModal('addModal');
}

async function submitCard() {
  const title = document.getElementById('addTitle').value.trim();
  if (!title) return alert('请输入标题');

  const data = {
    title,
    category: document.getElementById('addCategory').value,
    domain: document.getElementById('addDomain').value.trim(),
    summary: document.getElementById('addSummary').value.trim(),
    bullets: document.getElementById('addBullets').value.split('\n').map(s => s.trim()).filter(Boolean)
  };

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('addModal');
      loadCards();
    }
  } catch (err) {
    console.error('创建失败:', err);
    alert('创建失败');
  }
}

// ═══════ Delete Card ═══════
async function deleteCard(id) {
  if (!confirm('确定要删除这张知识卡吗？（会移到回收站）')) return;
  try {
    await fetch(API + '/' + id, { method: 'DELETE' });
    loadCards();
  } catch (err) {
    console.error('删除失败:', err);
  }
}

// ═══════ Pin / Review Toggle ═══════
async function togglePin(id) {
  try {
    const res = await fetch(API + '/' + id + '/pin', { method: 'POST' });
    const data = await res.json();
    // Update local state
    const card = cards.find(c => c.id === id);
    if (card) card.pinned = data.pinned;
    renderCards();
  } catch (err) { console.error(err); }
}

async function toggleReview(id) {
  try {
    const res = await fetch(API + '/' + id + '/review', { method: 'POST' });
    const data = await res.json();
    const card = cards.find(c => c.id === id);
    if (card) card.reviewed = data.reviewed;
    renderCards();
    closeModal('detailModal');
  } catch (err) { console.error(err); }
}

// ═══════ Note ═══════
let noteCardId = null;
function openNote(id) {
  noteCardId = id;
  const card = cards.find(c => c.id === id);
  document.getElementById('noteText').value = card?.note || '';
  showModal('noteModal');
}

async function saveNote() {
  const note = document.getElementById('noteText').value.trim();
  try {
    await fetch(API + '/' + noteCardId + '/note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    const card = cards.find(c => c.id === noteCardId);
    if (card) card.note = note;
    renderCards();
    closeModal('noteModal');
  } catch (err) { console.error(err); }
}

// ═══════ Modal Helpers ═══════
function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});
// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => closeModal(m.id));
  }
});

// ═══════ Utils ═══════
function categoryLabel(cat) {
  const map = { concept: '概念', topic: '主题', entity: '实体', life: '生活', work: '工作' };
  return map[cat] || cat;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
