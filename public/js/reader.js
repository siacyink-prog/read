// 阅读页：分页、划线/写想法、气泡、边读边聊
const $ = (s) => document.querySelector(s);
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '出错了');
  return data;
};
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const bookId = new URLSearchParams(location.search).get('book');
let me = null;
let toc = null;
let cur = { chapter: 0, page: 0 };
let pageData = null; // { text, annotations, pageCount, chapterCount, ... }

async function init() {
  const { user } = await api('/api/me');
  if (!user) { location.href = '/'; return; }
  me = user;
  toc = await api(`/api/books/${bookId}/toc`);
  $('#tocBookTitle').textContent = toc.title;
  buildToc();
  await loadPage(0, 0);
  loadChatHistory();
}

function buildToc() {
  const list = $('#tocList');
  list.innerHTML = '';
  toc.chapters.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'ch';
    el.dataset.idx = c.index;
    el.textContent = c.title;
    el.onclick = () => { closeToc(); loadPage(c.index, 0); };
    list.appendChild(el);
  });
}

async function loadPage(chapter, page) {
  cur = { chapter, page };
  pageData = await api(`/api/books/${bookId}/page?chapter=${chapter}&page=${page}`);
  $('#chTitle').textContent = pageData.chapterTitle;
  $('#pageInfo').textContent = `${page + 1} / ${pageData.pageCount}`;
  renderText();
  updatePager();
  updateTocActive();
  updateReadingHint();
  window.scrollTo(0, 0);
}

// 把正文渲染出来，并按锚点贴上下划线 + 气泡圆点
function renderText() {
  const anns = pageData.annotations || [];
  let html = esc(pageData.text);

  // 给每条有锚点的批注，在正文里第一处匹配后插入圆点；锚点本身加下划线
  anns.forEach((a) => {
    if (!a.anchor) return;
    const anchorEsc = esc(a.anchor);
    const idx = html.indexOf(anchorEsc);
    if (idx === -1) return;
    const dot = `<span class="bubble-dot ${a.color}" data-ann="${a.id}">•</span>`;
    const wrapped = `<mark class="hl ${a.color}" data-ann="${a.id}">${anchorEsc}</mark>${dot}`;
    html = html.slice(0, idx) + wrapped + html.slice(idx + anchorEsc.length);
  });

  // 没锚点的（极少）放页末
  const orphan = anns.filter((a) => !a.anchor || pageData.text.indexOf(a.anchor) === -1);

  $('#pageText').innerHTML = html
    .split('\n')
    .map((line) => `<p>${line || '&nbsp;'}</p>`)
    .join('');

  if (orphan.length) {
    const box = document.createElement('p');
    box.innerHTML = orphan
      .map((a) => `<span class="bubble-dot ${a.color}" data-ann="${a.id}">•</span>`)
      .join(' ');
    $('#pageText').appendChild(box);
  }

  // 绑定气泡点击
  $('#pageText').querySelectorAll('[data-ann]').forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); showPopover(el, el.dataset.ann); };
  });
}

function annById(id) { return (pageData.annotations || []).find((a) => a.id === id); }

function updatePager() {
  // 全书层面的上/下一页：跨章节
  const firstOverall = cur.chapter === 0 && cur.page === 0;
  const lastOverall = cur.chapter === pageData.chapterCount - 1 && cur.page === pageData.pageCount - 1;
  $('#prev').disabled = firstOverall;
  $('#next').disabled = lastOverall;
}
function updateTocActive() {
  $('#tocList').querySelectorAll('.ch').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.idx) === cur.chapter);
  });
}
function updateReadingHint() {
  $('#readingHint').textContent = `正在读：${pageData.chapterTitle} · 第${cur.page + 1}页（聊天会带上这一页的原文）`;
}

$('#next').onclick = () => {
  if (cur.page < pageData.pageCount - 1) loadPage(cur.chapter, cur.page + 1);
  else if (cur.chapter < pageData.chapterCount - 1) loadPage(cur.chapter + 1, 0);
};
$('#prev').onclick = async () => {
  if (cur.page > 0) loadPage(cur.chapter, cur.page - 1);
  else if (cur.chapter > 0) {
    // 跳到上一章最后一页
    const prevCh = cur.chapter - 1;
    const meta = toc.chapters[prevCh];
    loadPage(prevCh, meta.pageCount - 1);
  }
};
$('#back').onclick = () => { location.href = '/'; };

// ---------- 目录抽屉 ----------
$('#tocBtn').onclick = () => $('#toc-drawer').classList.add('show');
function closeToc() { $('#toc-drawer').classList.remove('show'); }
$('#toc-drawer').onclick = (e) => { if (e.target.id === 'toc-drawer') closeToc(); };

// ---------- 选中文字 → 浮动条 ----------
let selection = { text: '' };
function handleSelection() {
  const sel = window.getSelection();
  const text = sel.toString().trim();
  const bar = $('#selbar');
  if (!text || !$('#pageText').contains(sel.anchorNode)) { bar.classList.remove('show'); return; }
  selection.text = text;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  bar.style.left = `${window.scrollX + rect.left + rect.width / 2 - 60}px`;
  bar.style.top = `${window.scrollY + rect.top - 46}px`;
  bar.classList.add('show');
}
document.addEventListener('mouseup', () => setTimeout(handleSelection, 10));
document.addEventListener('touchend', () => setTimeout(handleSelection, 10));
document.addEventListener('mousedown', (e) => {
  if (!$('#selbar').contains(e.target)) $('#selbar').classList.remove('show');
});

$('#selbar').querySelectorAll('button').forEach((b) => {
  b.onclick = async () => {
    const act = b.dataset.act;
    $('#selbar').classList.remove('show');
    if (act === 'highlight') {
      await createAnnotation({ anchor: selection.text, text: '', type: 'highlight' });
    } else {
      openNoteModal(selection.text);
    }
  };
});

async function createAnnotation({ anchor, text, type }) {
  await api(`/api/books/${bookId}/annotations`, {
    method: 'POST',
    body: JSON.stringify({ chapterIndex: cur.chapter, pageIndex: cur.page, anchor, text, type }),
  });
  await refreshAnnotations();
}

async function refreshAnnotations() {
  const data = await api(`/api/books/${bookId}/page?chapter=${cur.chapter}&page=${cur.page}`);
  pageData.annotations = data.annotations;
  renderText();
}

// ---------- 写想法弹窗 ----------
$('#noteCancel').onclick = () => $('#note-modal').classList.remove('show');
function openNoteModal(anchor) {
  $('#noteAnchor').textContent = anchor;
  $('#noteText').value = '';
  $('#note-modal').classList.add('show');
  $('#note-modal').dataset.anchor = anchor;
  setTimeout(() => $('#noteText').focus(), 50);
}
$('#noteOk').onclick = async () => {
  const text = $('#noteText').value.trim();
  if (!text) return;
  await createAnnotation({ anchor: $('#note-modal').dataset.anchor, text, type: 'note' });
  $('#note-modal').classList.remove('show');
};

// ---------- 气泡弹层 ----------
let curPopover = null;
function showPopover(el, annId) {
  closePopover();
  const a = annById(annId);
  if (!a) return;
  const pop = document.createElement('div');
  pop.className = `popover ${a.color}`;
  const tag = a.source === 'ai' ? ' (AI批注)' : '';
  pop.innerHTML = `
    <div class="who">${esc(a.authorName)}${tag}</div>
    ${a.anchor ? `<div class="anchor">${esc(a.anchor)}</div>` : ''}
    <div class="body">${a.text ? esc(a.text) : '<i style="color:#9a948c">只是划了线</i>'}</div>
    <button class="del-ann">删掉</button>`;
  document.body.appendChild(pop);
  const rect = el.getBoundingClientRect();
  let left = window.scrollX + rect.left;
  if (left + 290 > window.innerWidth) left = window.innerWidth - 300;
  pop.style.left = `${Math.max(8, left)}px`;
  pop.style.top = `${window.scrollY + rect.bottom + 8}px`;
  pop.querySelector('.del-ann').onclick = async () => {
    await api(`/api/books/${bookId}/annotations/${annId}?chapter=${cur.chapter}`, { method: 'DELETE' });
    closePopover();
    await refreshAnnotations();
  };
  curPopover = pop;
}
function closePopover() { if (curPopover) { curPopover.remove(); curPopover = null; } }
document.addEventListener('mousedown', (e) => {
  if (curPopover && !curPopover.contains(e.target) && !e.target.dataset.ann) closePopover();
});

// ---------- 聊天 ----------
$('#chatToggle').onclick = () => $('#chatPanel').classList.add('open');
$('#chatClose').onclick = () => $('#chatPanel').classList.remove('open');

function renderMsg(m) {
  const body = $('#chatBody');
  const div = document.createElement('div');
  // 栖（我）= 蓝色靠右；渡 = 粉色靠左
  const cls = m.authorId === me.id ? 'me' : 'them';
  div.className = `msg ${cls}`;
  div.innerHTML = `<div class="name">${esc(m.authorName || '渡')}</div>${esc(m.text)}`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return div;
}

async function loadChatHistory() {
  const { messages } = await api(`/api/chat/${bookId}`);
  $('#chatBody').innerHTML = '';
  messages.forEach(renderMsg);
}

async function sendChat() {
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  renderMsg({ role: 'user', authorId: me.id, authorName: me.name, text });

  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.textContent = 'AI 在想…';
  $('#chatBody').appendChild(typing);
  $('#chatBody').scrollTop = $('#chatBody').scrollHeight;

  try {
    const res = await api(`/api/chat/${bookId}`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        context: { chapterIndex: cur.chapter, pageIndex: cur.page },
      }),
    });
    typing.remove();
    renderMsg(res.aiMsg);
    // 如果 AI 留了批注，刷新本页气泡
    if (res.annotations && res.annotations.length) refreshAnnotations();
  } catch (e) {
    typing.remove();
    const err = document.createElement('div');
    err.className = 'typing';
    err.style.color = '#c0392b';
    err.textContent = '出错了：' + e.message;
    $('#chatBody').appendChild(err);
  }
}
$('#chatSend').onclick = sendChat;
$('#chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

init().catch((e) => { alert(e.message); location.href = '/'; });
