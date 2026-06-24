// 书库页：登录 + 书架 + 上传
const $ = (s) => document.querySelector(s);
const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '出错了');
  return data;
};

let me = null;

async function init() {
  try {
    const { user } = await api('/api/me');
    if (user) { me = user; showApp(); }
    else showLogin();
  } catch { showLogin(); }
}

function showLogin() {
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

async function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  const colorHex = me.color === 'pink' ? '#e87ea6' : '#5b8def';
  $('#who').innerHTML = `<span class="dot" style="background:${colorHex}"></span>${me.name} · <a href="#" id="logout">退出</a>`;
  $('#logout').onclick = async (e) => { e.preventDefault(); await api('/api/logout', { method: 'POST' }); location.reload(); };
  loadShelf();
}

async function loadShelf() {
  const { books } = await api('/api/books');
  const shelf = $('#shelf');
  shelf.innerHTML = '';
  $('#empty').classList.toggle('hidden', books.length > 0);
  for (const b of books) {
    const el = document.createElement('div');
    el.className = 'book';
    el.innerHTML = `
      <div class="title">${esc(b.title)}</div>
      <div class="meta">${esc(b.author || '')}${b.author ? ' · ' : ''}${b.chapterCount}章 · ${b.totalPages}页</div>
      <button class="del" title="删除">×</button>`;
    el.onclick = () => { location.href = `/reader.html?book=${b.id}`; };
    el.querySelector('.del').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`删除《${b.title}》？批注和聊天记录也会一起删掉。`)) return;
      await api(`/api/books/${b.id}`, { method: 'DELETE' });
      loadShelf();
    };
    shelf.appendChild(el);
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 登录
$('#loginBtn').onclick = async () => {
  $('#loginErr').textContent = '';
  try {
    const { user } = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ name: $('#name').value.trim(), password: $('#password').value }),
    });
    me = user; showApp();
  } catch (e) { $('#loginErr').textContent = e.message; }
};
$('#password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });

// 上传
$('#uploadBtn').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  $('#uploadBtn').textContent = '解析中…';
  try {
    const res = await fetch('/api/books', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loadShelf();
  } catch (err) { alert('导入失败：' + err.message); }
  $('#uploadBtn').textContent = '+ 加一本书';
  e.target.value = '';
};

// 历史数据旧名字兼容
const displayName = (n) => (n === '渡' ? '凝' : (n || '凝'));

// ---------- 划线索引 ----------
$('#ann-index-btn').onclick = async () => {
  const drawer = $('#ann-index-drawer');
  const content = $('#annIndexContent');
  content.innerHTML = '<div class="ann-index-empty">加载中…</div>';
  drawer.classList.add('show');
  try {
    const { books } = await api('/api/annotations/all');
    content.innerHTML = '';
    if (!books || books.length === 0) {
      content.innerHTML = '<div class="ann-index-empty">还没有任何划线</div>';
      return;
    }
    books.forEach((b) => {
      const humanAnns = b.annotations.filter((a) => a.source !== 'ai');
      const aiAnns = b.annotations.filter((a) => a.source === 'ai');

      const section = document.createElement('div');
      section.className = 'ai-book-section';
      section.innerHTML = `<div class="ai-book-title">《${esc(b.bookTitle)}》</div>`;

      function renderGroup(anns, label, groupClass) {
        if (!anns.length) return;
        const g = document.createElement('div');
        g.innerHTML = `<div class="ai-group-title ${groupClass}">${label}</div>`;
        anns.forEach((a) => {
          const item = document.createElement('div');
          item.className = `ann-idx-item ${groupClass === 'human' ? 'human-item' : 'ai-item'}`;
          item.innerHTML = `
            ${a.anchor ? `<div class="ann-idx-anchor">"${esc(a.anchor)}"</div>` : ''}
            ${a.text ? `<div class="ann-idx-note">${esc(a.text)}</div>` : ''}
            <div class="ann-idx-loc">${esc(displayName(a.authorName))} · 第${a.chapterIndex + 1}章 第${a.pageIndex + 1}页</div>`;
          item.onclick = () => {
            drawer.classList.remove('show');
            location.href = `/reader.html?book=${b.bookId}&chapter=${a.chapterIndex}&page=${a.pageIndex}`;
          };
          g.appendChild(item);
        });
        section.appendChild(g);
      }

      renderGroup(humanAnns, '人类', 'human');
      renderGroup(aiAnns, 'AI', 'ai');
      content.appendChild(section);
    });
  } catch (e) {
    content.innerHTML = `<div class="ann-index-empty">加载失败：${esc(e.message)}</div>`;
  }
};

$('#ann-index-drawer').onclick = (e) => {
  if (e.target.id === 'ann-index-drawer') $('#ann-index-drawer').classList.remove('show');
};

init();
