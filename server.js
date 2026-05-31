const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 2999;
const ACTIVE_THEME = 'mocha'; // Change this to 'latte', 'frappe', 'macchiato', or 'mocha'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

const LOGBOOK_FILE = path.join(__dirname, 'logbook.json');

let catppuccin = null;
try {
  catppuccin = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'catppuccin.json'), 'utf8'));
} catch (e) {
  console.log('Could not load assets/catppuccin.json');
}

// --- Anti-spam: simple in-memory rate limiter ---
const rateLimitMap = new Map(); // ip -> { count, resetTime }
const RATE_LIMIT = 3;           // max 3 posts per window
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

// --- Basic toxicity filter ---
const BLOCKED_WORDS = [
  'nigger','faggot','retard','kys','kill yourself','tranny','chink',
  'spic','wetback','cunt','whore','slut','bitch','fuck you',
];
function isToxic(text) {
  const lower = text.toLowerCase();
  return BLOCKED_WORDS.some(w => lower.includes(w));
}

// --- Logbook helpers ---
function readLogbook() {
  try {
    return JSON.parse(fs.readFileSync(LOGBOOK_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeLogbook(entries) {
  fs.writeFileSync(LOGBOOK_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

// --- Webring System ---
const WEBRING_FILE = path.join(__dirname, 'members.json');
let webringCache = [];
let webringLastMtime = 0;

function loadWebring() {
  try {
    const data = fs.readFileSync(WEBRING_FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      webringCache = parsed;
      console.log(`[webring] Loaded ${webringCache.length} members.`);
    }
  } catch (err) {
    console.error('[webring] Error loading:', err.message);
    // Retain previous cache on error for redundancy
  }
}

// Polling-based hot-reload: fs.watch is unreliable on many platforms
// (editors that write-then-rename, scp, git pull, NFS, etc.)
// We poll every 2s for mtime changes — cheap and bulletproof.
function pollWebring() {
  try {
    const stat = fs.statSync(WEBRING_FILE);
    const mtime = stat.mtimeMs;
    if (mtime !== webringLastMtime) {
      webringLastMtime = mtime;
      loadWebring();
    }
  } catch (err) {
    // File temporarily missing during a write-then-rename — ignore
  }
}

if (fs.existsSync(WEBRING_FILE)) {
  pollWebring(); // initial load
  setInterval(pollWebring, 2000);  // check every 2s
}

// --- Resolve a clean URL path to a file path ---
function resolveFilePath(urlPath) {
  // Remove query string
  urlPath = urlPath.split('?')[0];
  const safe = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[\\/])+/, '');

  // Direct root
  if (safe === '/') return path.join(__dirname, 'index.html');

  // Try exact path first (handles assets, .css, .js, etc.)
  const exact = path.join(__dirname, safe);
  if (fs.existsSync(exact) && fs.statSync(exact).isFile()) return exact;

  // Try as a directory with index.html (e.g. /energyboy -> energyboy/index.html)
  const asDir = path.join(__dirname, safe, 'index.html');
  if (fs.existsSync(asDir)) return asDir;

  // Try appending .html (clean URLs)
  const withHtml = path.join(__dirname, safe + '.html');
  if (fs.existsSync(withHtml)) return withHtml;

  return null;
}

http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const method = req.method.toUpperCase();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // --- API: GET /api/logbook ---
  if (parsed.pathname === '/api/logbook' && method === 'GET') {
    const entries = readLogbook();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify(entries));
  }

  // --- API: POST /api/logbook ---
  if (parsed.pathname === '/api/logbook' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'invalid json' }));
      }

      const name    = String(data.name    || '').trim().slice(0, 50);
      const site    = String(data.site    || '').trim().slice(0, 100);
      const message = String(data.message || '').trim().slice(0, 280);

      if (!name || !message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'name and message required' }));
      }

      if (isRateLimited(ip)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'slow down, you\'re posting too fast :p' }));
      }

      if (isToxic(name) || isToxic(message)) {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'hey, be nice :)' }));
      }

      const entries = readLogbook();
      entries.unshift({
        id: Date.now(),
        name,
        site: site || undefined,
        message,
        date: new Date().toISOString(),
      });
      // Keep max 200 entries
      if (entries.length > 200) entries.length = 200;
      writeLogbook(entries);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // --- API: Webring ---
  if (parsed.pathname.startsWith('/api/webring')) {
    const action = parsed.pathname.replace(/^\/api\/webring\/?/, ''); // '', 'list', 'next', 'prev', 'random'
    
    const reqReferer = req.headers.referer || req.headers.origin || '';
    let inferredMemberId = null;
    
    if (reqReferer) {
      // Sort by length to match more specific URLs first (e.g. /energyboy before /)
      const sortedMembers = [...webringCache].sort((a, b) => b.url.length - a.url.length);
      
      // 1. Try exact path prefix match
      let matchedMember = sortedMembers.find(m => reqReferer.startsWith(m.url));
      
      // 2. Try hostname and alias match (for people with multiple domains)
      if (!matchedMember) {
        try {
          const refHost = new URL(reqReferer).hostname;
          matchedMember = sortedMembers.find(m => {
            try {
              if (new URL(m.url).hostname === refHost) return true;
              if (Array.isArray(m.aliases)) {
                return m.aliases.some(alias => {
                  try { return new URL(alias).hostname === refHost || alias === refHost; } 
                  catch(e) { return alias === refHost; }
                });
              }
            } catch(e) {}
            return false;
          });
        } catch(e) {}
      }
      
      if (matchedMember) {
        inferredMemberId = matchedMember.id;
      }
    }

    // Fallback to query parameter if referer fails or is stripped
    const memberId = inferredMemberId || String(parsed.query.id || '').trim().slice(0, 50);
    
    // Prevent aggressive browser caching of redirects so the ring always routes correctly
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (webringCache.length === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Webring is empty or offline.' }));
    }

    if (!action || action === 'list') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      return res.end(JSON.stringify(webringCache));
    }

    let currentIndex = webringCache.findIndex(m => m.id === memberId);
    let targetMember;

    if (action === 'random') {
      // Exclude the requesting member so you never land on yourself
      const candidates = memberId
        ? webringCache.filter(m => m.id !== memberId)
        : webringCache;
      // If there's only one member total, fall back to full list
      const pool = candidates.length > 0 ? candidates : webringCache;
      targetMember = pool[Math.floor(Math.random() * pool.length)];
    } else {
      // Redundancy: if ID is invalid or missing, fallback to random instead of failing
      if (currentIndex === -1) {
        currentIndex = Math.floor(Math.random() * webringCache.length);
      }
      
      if (action === 'next') {
        targetMember = webringCache[(currentIndex + 1) % webringCache.length];
      } else if (action === 'prev') {
        targetMember = webringCache[(currentIndex - 1 + webringCache.length) % webringCache.length];
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid action. Use next, prev, random, or list.' }));
      }
    }

    if (targetMember && targetMember.url) {
      // Prevent URL injection/Open Redirect vulnerabilities by enforcing strict valid URLs
      try {
        const safeUrl = new URL(targetMember.url);
        if (safeUrl.protocol !== 'http:' && safeUrl.protocol !== 'https:') {
          throw new Error('Invalid protocol');
        }
        res.writeHead(307, { 'Location': safeUrl.href });
        return res.end();
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid target URL in webring configuration' }));
      }
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Webring data corrupted' }));
    }
  }

  // --- OPTIONS preflight ---
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // --- Static file serving ---
  const filePath = resolveFilePath(parsed.pathname);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<body style="font-family:monospace;padding:40px"><h1>404</h1><p>not found :p &mdash; <a href="/">go home</a></p></body>');
  }

  // Theme injection for any page under energyboy/
  const isEnergyboy = filePath.includes(path.join('energyboy')) && filePath.endsWith('.html');
  if (isEnergyboy && catppuccin && catppuccin[ACTIVE_THEME]) {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('500 server error');
      }

      const theme = catppuccin[ACTIVE_THEME];
      let cssVars = ':root {\n';
      for (const [k, v] of Object.entries(theme.colors)) {
        cssVars += `  --ctp-${k}: ${v.hex};\n`;
      }
      
      cssVars += `  --bg: var(--ctp-base);\n`;
      cssVars += `  --bg-card: var(--ctp-surface0);\n`;
      cssVars += `  --bg-input: var(--ctp-crust);\n`;
      cssVars += `  --nav-bg: var(--ctp-crust);\n`;
      cssVars += `  --footer-bg: var(--ctp-mantle);\n`;
      cssVars += `  --stat-bg: var(--ctp-mantle);\n`;
      cssVars += `  --fg: var(--ctp-text);\n`;
      cssVars += `  --fg-secondary: var(--ctp-subtext1);\n`;
      cssVars += `  --fg-tertiary: var(--ctp-overlay1);\n`;
      cssVars += `  --border: var(--ctp-surface1);\n`;
      cssVars += `  --border-focus: var(--ctp-mauve);\n`;
      cssVars += `  --accent: var(--ctp-mauve);\n`;
      cssVars += '}\n';

      const injectedHtml = data.replace('</head>', `\n<style>\n${cssVars}</style>\n</head>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injectedHtml);
    });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('500 server error');
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });

}).listen(PORT, () => console.log(`gayboi.club running at http://localhost:${PORT}/`));

process.on('SIGTERM', () => process.exit(0));
