const express = require('express');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const app = express();
const PORT = 3456;

const VAULT_PATH = path.join(require('os').homedir(), '.qclaw/workspace/knowledge');
const CARDS_FILE = path.join(__dirname, 'cards.json');

// Custom card metadata (manual curation)
let cardMeta = {};
if (fs.existsSync(CARDS_FILE)) {
  cardMeta = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf-8'));
}

function saveCardMeta() {
  fs.writeFileSync(CARDS_FILE, JSON.stringify(cardMeta, null, 2), 'utf-8');
}

// Parse markdown to extract structured info
function parseMarkdown(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const lines = content.split('\n');

  // Also extract inline metadata: > 字段：值
  const inlineMeta = {};
  for (let line of lines) {
    const m = line.trim().match(/^>\s*(.+?)[：:]\s*(.+)/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      if (!inlineMeta[key]) inlineMeta[key] = val;
    }
  }

  // Merge: YAML frontmatter first, inline meta as fallback
  const mergedMeta = { ...inlineMeta, ...data };

  // Extract first meaningful paragraph as summary
  let summary = '';
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('>') && !trimmed.startsWith('|')
        && !trimmed.startsWith('```') && !trimmed.startsWith('- ') && !trimmed.startsWith('* ')
        && trimmed !== '---' && !trimmed.startsWith('[')) {
      summary = trimmed.slice(0, 130);
      break;
    }
  }
  // Fallback: use first H2 section content
  if (!summary) {
    let inH2 = false;
    for (let line of lines) {
      if (line.trim().startsWith('## ') && !inH2) { inH2 = true; continue; }
      if (inH2 && line.trim() && !line.trim().startsWith('#') && !line.trim().startsWith('>')) {
        summary = line.trim().slice(0, 130);
        break;
      }
    }
  }

  // Extract key points (bullet items)
  const bullets = [];
  let inBullets = false;
  for (let line of lines) {
    const trimmed = line.trim();
    // Skip todo items (- [ ] and - [x])
    if (trimmed.startsWith('- [') || trimmed.startsWith('* [')) continue;

    if (trimmed.startsWith('- **') || trimmed.startsWith('- ')) {
      inBullets = true;
      let text = trimmed
        .replace(/^-\s+/, '')           // remove leading "- "
        .replace(/\*\*/g, '')           // remove bold markers
        .replace(/\[\[([^\]]+)\]\]/g, '$1') // convert wiki links to plain text
        .trim();
      if (text && text.length < 80) {
        bullets.push(text);
      }
    } else if (inBullets && trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('#')) {
      inBullets = false;
    }
  }

  return {
    frontMatter: mergedMeta,
    summary,
    bullets: bullets.slice(0, 5),
    rawContent: content
  };
}

// Scan vault for wiki content
function scanVault() {
  const cards = [];

  function scanDir(dir, category) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (let entry of entries) {
      // Skip system dirs and non-content files
      if (entry.name.startsWith('.')) continue;
      if (['raw', 'attachments', 'references'].includes(entry.name)) continue;

      if (entry.name.endsWith('.md')) {
        // Skip system files
        if (['WIKI.md', 'TEMPLATE.md', 'INDEX.md', '资料导入指南.md', 'log.md'].includes(entry.name)) continue;

        const filePath = path.join(dir, entry.name);
        const relativePath = path.relative(VAULT_PATH, filePath);
        const parsed = parseMarkdown(filePath);

        // Clean domain: remove pipe separators for display
        let domain = parsed.frontMatter['领域'] || parsed.frontMatter['分类'] || parsed.frontMatter['Domain'] || '';
        domain = domain.replace(/\s*\|\s*/g, ' / ');

        cards.push({
          id: relativePath.replace(/[/\\]/g, '--').replace('.md', ''),
          title: entry.name.replace('.md', ''),
          path: relativePath,
          category: category,
          domain: domain,
          summary: parsed.summary,
          bullets: parsed.bullets,
          createdAt: parsed.frontMatter['首次记录'] || parsed.frontMatter['创建'] || parsed.frontMatter['创建时间'] || '',
          updatedAt: parsed.frontMatter['最后更新'] || '',
          pinned: cardMeta[relativePath]?.pinned || false,
          reviewed: cardMeta[relativePath]?.reviewed || false,
          note: cardMeta[relativePath]?.note || '',
        });
      } else if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name), entry.name);
      }
    }
  }

  // Scan wiki directories
  scanDir(path.join(VAULT_PATH, 'wiki/concepts'), 'concept');
  scanDir(path.join(VAULT_PATH, 'wiki/topics'), 'topic');
  scanDir(path.join(VAULT_PATH, 'wiki/entities'), 'entity');
  scanDir(path.join(VAULT_PATH, 'life'), 'life');
  scanDir(path.join(VAULT_PATH, 'work'), 'work');

  return cards;
}

// API: Get all cards
app.get('/api/cards', (req, res) => {
  const cards = scanVault();
  cards.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));
  res.json(cards);
});

// API: Get single card detail
app.get('/api/cards/:id', (req, res) => {
  const cards = scanVault();
  const card = cards.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(VAULT_PATH, card.path);
  const parsed = parseMarkdown(filePath);
  card.content = marked.parse(parsed.rawContent);
  res.json(card);
});

// API: Toggle pinned
app.post('/api/cards/:id/pin', express.json(), (req, res) => {
  const cards = scanVault();
  const card = cards.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'Not found' });

  if (!cardMeta[card.path]) cardMeta[card.path] = {};
  cardMeta[card.path].pinned = !cardMeta[card.path].pinned;
  saveCardMeta();
  res.json({ pinned: cardMeta[card.path].pinned });
});

// API: Toggle reviewed
app.post('/api/cards/:id/review', express.json(), (req, res) => {
  const cards = scanVault();
  const card = cards.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'Not found' });

  if (!cardMeta[card.path]) cardMeta[card.path] = {};
  cardMeta[card.path].reviewed = !cardMeta[card.path].reviewed;
  saveCardMeta();
  res.json({ reviewed: cardMeta[card.path].reviewed });
});

// API: Update note
app.post('/api/cards/:id/note', express.json(), (req, res) => {
  const cards = scanVault();
  const card = cards.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'Not found' });

  if (!cardMeta[card.path]) cardMeta[card.path] = {};
  cardMeta[card.path].note = req.body.note || '';
  saveCardMeta();
  res.json({ note: cardMeta[card.path].note });
});

// API: Create new card
app.post('/api/cards', express.json(), (req, res) => {
  const { title, category, domain, summary, bullets } = req.body;

  let dir;
  let fileName = title + '.md';
  switch (category) {
    case 'concept': dir = path.join(VAULT_PATH, 'wiki/concepts'); break;
    case 'topic': dir = path.join(VAULT_PATH, 'wiki/topics'); break;
    case 'entity': dir = path.join(VAULT_PATH, 'wiki/entities'); break;
    default: dir = path.join(VAULT_PATH, 'life'); break;
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `# ${title}

> 领域：${domain || ''}
> 首次记录：${today}
> 最后更新：${today}

## 概述

${summary || ''}

## 核心要点

${(bullets || []).map(b => `- ${b}`).join('\n')}

---

*最后更新：${today}*
`;

  fs.writeFileSync(path.join(dir, fileName), content, 'utf-8');
  res.json({ success: true, title });
});

// API: Delete card (move to trash)
app.delete('/api/cards/:id', (req, res) => {
  const cards = scanVault();
  const card = cards.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'Not found' });

  const trashDir = path.join(VAULT_PATH, '.trash');
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });

  const src = path.join(VAULT_PATH, card.path);
  const dest = path.join(trashDir, path.basename(card.path));
  fs.renameSync(src, dest);
  delete cardMeta[card.path];
  saveCardMeta();
  res.json({ success: true });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`🃏 知识卡服务启动: http://localhost:${PORT}`);
});
