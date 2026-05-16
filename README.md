# 🃏 知识卡

基于 Obsidian 知识库的轻量化知识卡片系统。

## 特性

- 📇 **卡片化浏览** — 自动解析 Obsidian Markdown 为知识卡片
- 🔍 **实时搜索** — 全文搜索标题、摘要、要点、备注
- 📌 **置顶 & 标记** — 重要卡片置顶，已复习一键标记
- 📝 **维护界面** — 图形化创建、编辑、删除卡片
- 📂 **双向同步** — 新建卡片直接写入 Obsidian Vault

## 启动

```bash
npm install
node server.js
# → http://localhost:3456
```

## 目录结构

```
knowledge-cards/
├── server.js          # Node.js 服务端（读取 Obsidian Vault + API）
├── public/
│   ├── index.html     # 前端页面
│   ├── style.css      # 样式
│   └── app.js         # 前端逻辑
└── start.sh           # 一键启动脚本
```
