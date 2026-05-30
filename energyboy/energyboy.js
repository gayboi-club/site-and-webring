'use strict';

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  steamId: '76561199524488999',

  // Blog posts — add new ones at the top
  blogPosts: [
    {
      date: '2026-05-30',
      title: 'hello world :3',
      body: 'hey!! this is my little corner of gayboi.club. still setting things up but glad you found it. come back later for more stuff :3c',
    },
    // adding more posts format:
    // { date: '2026-06-01', title: 'my title', body: 'my post body...' },
  ],

  // Friend sites
  friends: [
    {
      name: 'Glitchy',
      url: 'amcalledglitchy.dev',
      href: 'https://amcalledglitchy.dev',
      desc: 'my boyfriend\'s site :3',
    },
  ],
};

// ============================================================
// LEETIFY / CS2 STATS
// ============================================================
(function leetify() {
  const API = 'https://api-public.cs-prod.leetify.com';
  const steamId = CONFIG.steamId;

  // badge is handled by the theme switcher now

  fetch(`${API}/v3/profile?steam64_id=${steamId}`)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      const loading = document.getElementById('leetify-loading');
      const content = document.getElementById('leetify-content');
      if (!loading || !content) return;

      loading.style.display = 'none';
      content.style.display = 'block';

      const r = data.rating || {};
      const ranks = data.ranks || {};

      const stats = [];
      if (data.winrate != null) stats.push({ label: 'Win Rate', val: (data.winrate * 100).toFixed(1) + '%' });
      if (ranks.premier) stats.push({ label: 'Premier Rating', val: ranks.premier.toLocaleString() });
      if (ranks.leetify != null) stats.push({ label: 'Leetify Rating', val: ranks.leetify.toFixed(2) });
      if (r.aim != null) stats.push({ label: 'Aim', val: r.aim.toFixed(1) });
      if (r.positioning != null) stats.push({ label: 'Positioning', val: r.positioning.toFixed(1) });
      if (r.utility != null) stats.push({ label: 'Utility', val: r.utility.toFixed(1) });

      let html = '<div class="stats-overview">';
      stats.forEach(s => {
        html += `<div class="stat-item"><div class="stat-label">${s.label}</div><div class="stat-value">${s.val}</div></div>`;
      });
      html += '</div>';
      html += `<a href="https://leetify.com/app/profile/${steamId}" target="_blank" rel="noopener" class="leetify-link">View full profile on Leetify →</a>`;
      content.innerHTML = html;
    })
    .catch(err => {
      console.error('Leetify error:', err);
      const loading = document.getElementById('leetify-loading');
      if (loading) {
        loading.innerHTML = '<span style="color:var(--ctp-pink);font-family:var(--mono);font-size:0.8rem">couldn\'t load stats right now — try again later</span>';
      }
    });
})();

// ============================================================
// BLOG POSTS
// ============================================================
(function renderBlog() {
  const container = document.getElementById('blog-posts');
  if (!container) return;

  if (!CONFIG.blogPosts.length) {
    container.innerHTML = '<div class="blog-empty">nothing here yet... check back soon :3</div>';
    return;
  }

  container.innerHTML = CONFIG.blogPosts.map(p => {
    const dateStr = new Date(p.date).toLocaleDateString('en-GB', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    // Sanitise body — convert newlines to <br>, no raw HTML
    const safeBody = p.body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br />');

    return `
      <article class="blog-post">
        <div class="blog-post-date">${dateStr}</div>
        <div class="blog-post-title">${escHtml(p.title)}</div>
        <div class="blog-post-body">${safeBody}</div>
      </article>
    `;
  }).join('');
})();

// ============================================================
// FRIENDS
// ============================================================
(function renderFriends() {
  const grid = document.getElementById('friends-grid');
  if (!grid) return;

  if (!CONFIG.friends.length) {
    grid.innerHTML = '<p style="color:var(--fg-tertiary);font-size:0.85rem;font-family:var(--mono)">no friends yet... (jk)</p>';
    return;
  }

  grid.innerHTML = CONFIG.friends.map(f => `
    <a href="${escAttr(f.href)}" target="_blank" rel="noopener noreferrer" class="friend-card" id="friend-${slugify(f.name)}">
      <div class="friend-info">
        <span class="friend-name">${escHtml(f.name)}</span>
        <span class="friend-url">${escHtml(f.url)}</span>
        <span class="friend-desc">${escHtml(f.desc)}</span>
      </div>
    </a>
  `).join('');
})();

// ============================================================
// LOGBOOK
// ============================================================
(function logbook() {
  const entriesEl = document.getElementById('logbook-entries');
  const form = document.getElementById('logbook-form');
  const nameInput = document.getElementById('lb-name');
  const siteInput = document.getElementById('lb-site');
  const msgInput = document.getElementById('lb-message');
  const charCount = document.getElementById('char-count');
  const submitBtn = document.getElementById('lb-submit');
  const statusEl = document.getElementById('form-status');
  const honeypot = document.getElementById('lb-honeypot');

  // --- Char counter ---
  if (msgInput && charCount) {
    msgInput.addEventListener('input', () => {
      charCount.textContent = `${msgInput.value.length} / 280`;
    });
  }

  // --- Load entries ---
  function loadEntries() {
    fetch('/api/logbook')
      .then(r => r.json())
      .then(entries => {
        if (!entriesEl) return;
        if (!entries.length) {
          entriesEl.innerHTML = '<div class="logbook-empty">no entries yet — be the first :3</div>';
          return;
        }
        entriesEl.innerHTML = entries.map(e => {
          let nameHtml = `<span class="entry-name">${escHtml(e.name)}</span>`;
          if (e.site) {
            let url = e.site;
            if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
            nameHtml = `<a href="${escAttr(url)}" target="_blank" rel="noopener" class="entry-name">${escHtml(e.name)}</a>`;
          }
          return `
            <div class="logbook-entry" id="entry-${e.id}">
              <div class="entry-header">
                ${nameHtml}
                <span class="entry-date">${formatDate(e.date)}</span>
              </div>
              <div class="entry-message">${escHtml(e.message)}</div>
            </div>
          `;
        }).join('');
      })
      .catch(() => {
        if (entriesEl) entriesEl.innerHTML = '<div class="logbook-empty">couldn\'t load entries... try refreshing :p</div>';
      });
  }
  loadEntries();

  // --- Submit ---
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Honeypot check
      if (honeypot && honeypot.value) return;

      const name = nameInput?.value.trim();
      const message = msgInput?.value.trim();
      if (!name || !message) return;

      submitBtn.disabled = true;
      setStatus('', '');

      try {
        const res = await fetch('/api/logbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, message, site: siteInput?.value.trim() }),
        });
        const json = await res.json();

        if (res.ok) {
          setStatus('signed! thanks for stopping by :3', 'ok');
          form.reset();
          if (charCount) charCount.textContent = '0 / 280';
          await loadEntries();
          document.getElementById('logbook-entries')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          setStatus(json.error || 'something went wrong :/', 'err');
        }
      } catch {
        setStatus('network error — try again', 'err');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function setStatus(msg, cls) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'form-status' + (cls ? ' ' + cls : '');
  }
})();

// ============================================================
// HELPERS
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escAttr(str) {
  // Allow only http/https URLs
  const s = String(str).trim();
  if (!/^https?:\/\//i.test(s)) return '#';
  return s.replace(/"/g, '%22');
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}
