// Minimal server for the ACP website templates. No dependencies (Node 18+).
//   - Serves the static site from the repository root.
//   - POST /api/lead  ->  Bitrix24 crm.lead.add through an inbound webhook.
// The webhook URL stays on the server. Never put it in browser code: it gives full CRM access.
//
// Env:
//   BITRIX_WEBHOOK_URL  e.g. https://acp.bitrix24.com/rest/<user>/<token>/   (needs "crm" scope)
//   BITRIX_ASSIGNED_BY_ID  optional, user ID who receives new leads
//   PORT  default 8080

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const WEBHOOK = (process.env.BITRIX_WEBHOOK_URL || '').replace(/\/?$/, '/');
const ASSIGNED_BY_ID = process.env.BITRIX_ASSIGNED_BY_ID;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json'
};

const INTERESTS = {
  crm: 'CRM', automation: 'Business automation', consulting: 'Consulting & MOS',
  apps: 'Apps & connectors', unsure: 'Not sure yet'
};

// 5 submissions per IP per 10 minutes.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function handleLead(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) return send(res, 429, { ok: false });

  let d;
  try { d = await readJson(req); } catch { return send(res, 400, { ok: false }); }

  // Honeypot: bots fill the hidden "website" field. Answer OK and drop the lead.
  if (d.website) return send(res, 200, { ok: true });

  const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const lead = {
    name: str(d.name), company: str(d.company), email: str(d.email), phone: str(d.phone, 40),
    country: str(d.country, 80), interest: INTERESTS[d.interest] || '', team: str(d.team, 20),
    message: str(d.message, 3000)
  };
  if (!lead.name || !lead.company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) || !lead.phone || !lead.country || d.consent !== true) {
    return send(res, 422, { ok: false });
  }
  if (!WEBHOOK || WEBHOOK === '/') {
    console.error('BITRIX_WEBHOOK_URL is not set. Lead not saved:', lead.email);
    return send(res, 503, { ok: false });
  }

  const utm = d.utm && typeof d.utm === 'object' ? d.utm : {};
  const fields = {
    TITLE: `Website: ${lead.company}${lead.interest ? ' - ' + lead.interest : ''}`,
    NAME: lead.name,
    COMPANY_TITLE: lead.company,
    EMAIL: [{ VALUE: lead.email, VALUE_TYPE: 'WORK' }],
    PHONE: [{ VALUE: lead.phone, VALUE_TYPE: 'WORK' }],
    SOURCE_ID: 'WEB',
    SOURCE_DESCRIPTION: `acp-24.com ${str(d.page, 200)} (template ${str(d.template, 10) || '-'})`,
    COMMENTS: [
      `Country: ${lead.country}`,
      `Interest: ${lead.interest || '-'}`,
      `Team size: ${lead.team || '-'}`,
      '',
      lead.message || '(no message)'
    ].join('<br>'),
    UTM_SOURCE: str(utm.utm_source, 100), UTM_MEDIUM: str(utm.utm_medium, 100),
    UTM_CAMPAIGN: str(utm.utm_campaign, 100), UTM_CONTENT: str(utm.utm_content, 100),
    UTM_TERM: str(utm.utm_term, 100)
  };
  if (ASSIGNED_BY_ID) fields.ASSIGNED_BY_ID = ASSIGNED_BY_ID;

  try {
    const r = await fetch(WEBHOOK + 'crm.lead.add.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, params: { REGISTER_SONET_EVENT: 'Y' } })
    });
    const out = await r.json();
    if (!r.ok || !out.result) throw new Error(JSON.stringify(out).slice(0, 300));
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error('Bitrix24 crm.lead.add failed:', e.message);
    return send(res, 502, { ok: false });
  }
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || /[\\/](server|\.git)([\\/]|$)/.test(rel)) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  if (req.url === '/api/lead' && req.method === 'POST') return handleLead(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`ACP site on http://localhost:${PORT}`));
