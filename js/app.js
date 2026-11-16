/* ===== 围脖 - 逻辑 ===== */
const STORAGE_KEY = "weibo_posts_v1";
const LIMIT = 140;
const AUTHOR = "一路小跑，天天洗澡";

/* ---------- 存取 ---------- */
function normalizePost(p) {
  if (!Array.isArray(p.comments)) p.comments = [];
  p.comments.forEach(c => { if (!Array.isArray(c.replies)) c.replies = []; });
  return p;
}
function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length) return arr.map(normalizePost);
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
  const list = [
    mk(5, "晚饭给自己煮了一碗热汤面，加了两颗蛋。#深夜食堂 #今日记录"),
    mk(45, "夜跑五公里完成，风很凉，心情很好。#夜跑路上"),
    mk(120, "读完了那本拖了半年的书，最后一章居然有点舍不得。#读书笔记"),
  ];
  const c1 = mkc(3, "旧友阿茶", "热汤面配两颗蛋，是顶配了。");
  c1.replies.push(mkr(2, AUTHOR, "下次再撒一把葱花，就更圆满了。"));
  list[0].comments.push(c1);
  const c3 = mkc(90, "楼下老周", "哪本书？说来听听。");
  list[2].comments.push(c3);
  return list;
}

/* 评论 / 回复 */
function mkc(minAgo, author, content) {
  return { id: "c" + Date.now() + Math.random().toString(36).slice(2, 6), author, content, createdAt: Date.now() - minAgo * 60000, replies: [] };
}
function mkr(minAgo, author, content) {
  return { id: "r" + Date.now() + Math.random().toString(36).slice(2, 6), author, content, createdAt: Date.now() - minAgo * 60000 };
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
let openComments = null;  // 展开评论区的围脖 id
let replyTarget = null;   // { postId, commentId, author } 回复目标

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

/* 评论 / 回复总数 */
function commentCount(p) {
  return p.comments.reduce((s, c) => s + 1 + c.replies.length, 0);
}

/* 评论头像字：自己为「跑」，他人为「友」 */
function avOf(author) {
  return author === AUTHOR ? "跑" : "友";
}

/* 渲染一条评论（含回复） */
function renderComment(c) {
  const replies = c.replies.map(r => `
    <div class="reply">
      <div class="avatar avatar-xs">${avOf(r.author)}</div>
      <div class="comment-main">
        <div class="comment-meta">
          <span class="comment-author">${esc(r.author)}</span>
          <span class="post-time">${relTime(r.createdAt)}</span>
        </div>
        <p class="comment-text">${renderText(r.content)}</p>
        <div class="comment-ops"><button data-reply="${c.id}" data-rto="${esc(r.author)}">回复</button></div>
      </div>
    </div>`).join("");
  return `
    <div class="comment" data-cid="${c.id}">
      <div class="avatar avatar-xs">${avOf(c.author)}</div>
      <div class="comment-main">
        <div class="comment-meta">
          <span class="comment-author">${esc(c.author)}</span>
          <span class="post-time">${relTime(c.createdAt)}</span>
        </div>
        <p class="comment-text">${renderText(c.content)}</p>
        <div class="comment-ops"><button data-reply="${c.id}" data-rto="${esc(c.author)}">回复</button></div>
        ${replies}
      </div>
    </div>`;
}

/* 渲染评论区 */
function renderCommentPanel(p) {
  if (openComments !== p.id) return "";
  const listHtml = p.comments.length
    ? p.comments.map(renderComment).join("")
    : `<p class="comment-empty">还没有评论，写下一句吧。</p>`;
  const tip = replyTarget && replyTarget.postId === p.id
    ? `<div class="replying-tip">回复 @${esc(replyTarget.author)}：<button data-cancel-reply>取消</button></div>`
    : "";
  const placeholder = replyTarget && replyTarget.postId === p.id
    ? `回复 @${replyTarget.author}：`
    : "说点什么…";
  return `
    <div class="comment-panel">
      ${tip}
      <div class="comment-list">${listHtml}</div>
      <div class="comment-input">
        <input class="comment-box" data-post="${p.id}" maxlength="60" placeholder="${placeholder}" />
        <button class="comment-submit" data-comment-submit="${p.id}">发送</button>
      </div>
    </div>`;
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
        <div class="avatar avatar-sm">跑</div>
        <div class="post-body">
          <div class="post-meta">
            <span class="post-name">${AUTHOR}</span>
            <span class="post-time">${relTime(p.createdAt)}</span>
          </div>
          <p class="post-text">${renderText(p.content)}</p>
          <div class="post-foot">
            <button class="like-btn ${p.liked ? "liked" : ""}" data-like="${p.id}">
              <span class="heart">❤</span><span>${p.likes}</span>
            </button>
            <button class="comment-btn ${openComments === p.id ? "open" : ""}" data-comment-toggle="${p.id}">
              💬 ${commentCount(p)}
            </button>
          </div>
          ${renderCommentPanel(p)}
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

  // 恢复评论输入焦点
  if (openComments) {
    const box = feed.querySelector(`.comment-box[data-post="${openComments}"]`);
    if (box) box.focus();
  }
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
    comments: [],
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

// 事件委托：点赞 / 评论展开 / 回复 / 发送评论 / 话题点击 / 热议榜
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
  const submitBtn = e.target.closest("[data-comment-submit]");
  if (submitBtn) {
    submitComment(submitBtn.dataset.commentSubmit);
    return;
  }
  const cancelBtn = e.target.closest("[data-cancel-reply]");
  if (cancelBtn) {
    replyTarget = null;
    render();
    return;
  }
  const replyBtn = e.target.closest("[data-reply]");
  if (replyBtn) {
    const card = replyBtn.closest(".post-card");
    replyTarget = {
      postId: card.dataset.id,
      commentId: replyBtn.dataset.reply,
      author: replyBtn.dataset.rto,
    };
    render();
    return;
  }
  const toggleBtn = e.target.closest("[data-comment-toggle]");
  if (toggleBtn) {
    openComments = openComments === toggleBtn.dataset.commentToggle ? null : toggleBtn.dataset.commentToggle;
    replyTarget = null;
    render();
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

// 评论输入框回车发送
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const box = e.target.closest(".comment-box");
  if (box && !e.shiftKey) {
    e.preventDefault();
    submitComment(box.dataset.post);
  }
});

/* 提交评论 / 回复 */
function submitComment(postId) {
  const p = posts.find(x => x.id === postId);
  if (!p) return;
  const box = feed.querySelector(`.comment-box[data-post="${postId}"]`);
  if (!box) return;
  const content = box.value.trim();
  if (!content) return;
  if (replyTarget && replyTarget.postId === postId) {
    const c = p.comments.find(c => c.id === replyTarget.commentId);
    if (c) c.replies.push(mkr(0, AUTHOR, content));
    replyTarget = null;
  } else {
    p.comments.push(mkc(0, AUTHOR, content));
  }
  savePosts(posts);
  openComments = postId;
  render();
}

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
