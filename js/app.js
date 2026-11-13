/* ===== 围脖 - 逻辑 ===== */
const STORAGE_KEY = "weibo_posts_v1";
const LIMIT = 140;

/* ---------- 存取 ---------- */
function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (e) { /* 数据损坏则重置 */ }
  const seed = seedPosts();
  savePosts(seed);
  return seed;
}
function savePosts(posts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

/* ---------- 示例数据（首次访问） ---------- */
function seedPosts() {
  const now = Date.now();
  const mk = (minAgo, content) => ({
    id: "p" + (now - minAgo * 60000) + Math.random().toString(36).slice(2, 6),
    content,
    tags: extractTags(content),
    likes: 0,
    liked: false,
    createdAt: now - minAgo * 60000,
  });
  return [
    mk(5, "晚饭给自己煮了一碗热汤面，加了两颗蛋。#深夜食堂 #今日记录"),
    mk(45, "夜跑五公里完成，风很凉，心情很好。#夜跑路上"),
    mk(120, "读完了那本拖了半年的书，最后一章居然有点舍不得。#读书笔记"),
  ];
}

/* ---------- 工具 ---------- */
function extractTags(text) {
  const m = text.match(/#([^#\s]{1,20})#/g);
  return m ? [...new Set(m.map(t => t.slice(1, -1)))] : [];
}
function esc(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
  if (diff < 86400000 * 30) return Math.floor(diff / 86400000) + " 天前";
  return new Date(ts).toLocaleDateString("zh-CN");
}
/* 正文渲染：#xx# 变成可点击话题标签 */
function renderText(text) {
  return esc(text).replace(/#([^#\s]{1,20})#/g, (_, t) =>
    `<span class="topic-tag" data-topic="${t}">#${t}#</span>`
  );
}

/* ---------- 状态 ---------- */
let posts = loadPosts();
let tab = "all";          // all | hot
let activeTopic = null;   // 话题筛选
let keyword = "";         // 搜索关键词

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const feed = $("feed");
const composerInput = $("composerInput");
const btnPublish = $("btnPublish");
const charBar = $("charBar");
const charCount = $("charCount");

/* ---------- 渲染 ---------- */
function visiblePosts() {
  let list = [...posts];
  if (tab === "hot") list.sort((a, b) => b.likes - a.likes);
  if (activeTopic) list = list.filter(p => p.tags.includes(activeTopic));
  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter(p =>
      p.content.toLowerCase().includes(k) ||
      p.tags.some(t => t.toLowerCase().includes(k))
    );
  }
  return list;
}

function render() {
  const list = visiblePosts();
  if (!list.length) {
    feed.innerHTML = `<div class="empty">${
      activeTopic || keyword ? "这里空空的，换个筛选条件试试～" : "还没有围脖，写下第一条吧 ✏️"
    }</div>`;
  } else {
    feed.innerHTML = list.map(p => `
      <article class="post-card" data-id="${p.id}">
        <div class="avatar avatar-sm">围</div>
        <div class="post-body">
          <div class="post-meta">
            <span class="post-name">围脖</span>
            <span class="post-time">${relTime(p.createdAt)}</span>
          </div>
          <p class="post-text">${renderText(p.content)}</p>
          <div class="post-foot">
            <button class="like-btn ${p.liked ? "liked" : ""}" data-like="${p.id}">
              <span class="heart">❤</span><span>${p.likes}</span>
            </button>
          </div>
        </div>
      </article>
    `).join("");
  }

  // 筛选提示
  const pill = $("filterPill");
  if (activeTopic || keyword) {
    $("filterLabel").textContent = activeTopic ? `# ${activeTopic} #` : `搜索：${keyword}`;
    pill.hidden = false;
  } else pill.hidden = true;

  // 统计
  $("statPosts").textContent = posts.length;
  $("statLikes").textContent = posts.reduce((s, p) => s + p.likes, 0);
  const allTags = new Set(posts.flatMap(p => p.tags));
  $("statTags").textContent = allTags.size;

  // 热议榜：按话题条数排序
  const counts = {};
  posts.forEach(p => p.tags.forEach(t => counts[t] = (counts[t] || 0) + 1));
  const rank = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $("trendList").innerHTML = rank.length
    ? rank.map(([t, c]) => `
        <li><button class="trend-item" data-topic="${t}">
          <span class="trend-rank">热</span>
          <span class="trend-topic"># ${t} #</span>
          <span class="trend-count">${c} 条</span>
        </button></li>`).join("")
    : `<li class="trend-empty">暂无话题，发一条带 #话题# 的围脖吧</li>`;
}

/* ---------- 发布 ---------- */
function updateMeter() {
  const len = [...composerInput.value].length;
  const rest = LIMIT - len;
  charCount.textContent = rest;
  charBar.classList.toggle("over", rest < 0);
  charBar.classList.toggle("warn", rest >= 0 && rest <= 20);
  charBar.style.setProperty("--fill", Math.min(len / LIMIT, 1));
  btnPublish.disabled = composerInput.value.trim() === "" || len > LIMIT;
}

/* 发布动作 */
function publish() {
  const content = composerInput.value.trim();
  const len = [...content].length;
  if (!content || len > LIMIT) return;
  posts.unshift({
    id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
    content,
    tags: extractTags(content),
    likes: 0,
    liked: false,
    createdAt: Date.now(),
  });
  savePosts(posts);
  composerInput.value = "";
  updateMeter();
  tab = "all";
  setTabUI();
  render();
  composerInput.placeholder = "发布成功，再写一条？";
}

/* ---------- 事件 ---------- */
btnPublish.addEventListener("click", publish);
composerInput.addEventListener("input", updateMeter);
composerInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") publish();
});

// 话题快捷标签：追加到输入框
document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const t = chip.dataset.topic;
    const tag = `#${t}#`;
    const v = composerInput.value;
    if (!v.includes(tag)) {
      composerInput.value = (v ? v.replace(/\s*$/, "") + " " : "") + tag + " ";
    }
    composerInput.focus();
    updateMeter();
  });
});

// 事件委托：点赞 / 话题点击 / 热议榜
document.addEventListener("click", (e) => {
  const likeBtn = e.target.closest("[data-like]");
  if (likeBtn) {
    const p = posts.find(x => x.id === likeBtn.dataset.like);
    if (p) {
      p.liked = !p.liked;
      p.likes += p.liked ? 1 : -1;
      savePosts(posts);
      render();
    }
    return;
  }
  const topicEl = e.target.closest("[data-topic]");
  if (topicEl) {
    const t = topicEl.dataset.topic;
    activeTopic = activeTopic === t ? null : t;
    if (activeTopic) {
      tab = "all";
      setTabUI();
    }
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

// Tab 切换
function setTabUI() {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );
}
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    tab = t.dataset.tab;
    activeTopic = null;
    setTabUI();
    render();
  });
});

// 清除筛选
$("filterClear").addEventListener("click", () => {
  activeTopic = null;
  keyword = "";
  $("searchInput").value = "";
  render();
});

// 搜索
$("searchInput").addEventListener("input", (e) => {
  keyword = e.target.value.trim();
  render();
});

// 导航（顶部 + 左侧）
document.querySelectorAll("[data-nav]").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const nav = a.dataset.nav;
    if (nav === "hot") { tab = "hot"; activeTopic = null; setTabUI(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (nav === "all") { tab = "all"; activeTopic = null; keyword = ""; $("searchInput").value = ""; setTabUI(); render(); }
    if (nav === "compose") {
      composerInput.scrollIntoView({ behavior: "smooth", block: "center" });
      composerInput.focus();
    }
  });
});
$("btnWrite").addEventListener("click", () => {
  composerInput.scrollIntoView({ behavior: "smooth", block: "center" });
  composerInput.focus();
});

/* ---------- 启动 ---------- */
setTabUI();
updateMeter();
render();
