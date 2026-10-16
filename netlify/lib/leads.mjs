// Shared helpers for the lead functions: Supabase (REST, no SDK) and Resend email.
// All secrets come from Netlify environment variables. Nothing here runs in the browser.

const env = (k, fallback) => {
  const v = process.env[k];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing environment variable ${k}`);
  }
  return v;
};

/* ---------- Supabase ---------- */
export async function sb(path, { method = 'GET', body, prefer } = {}) {
  const url = `${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${path}`;
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${method} ${path} failed: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/* ---------- Email ---------- */
export async function sendEmail({ subject, html, text, replyTo }) {
  const key = env('RESEND_API_KEY', '');
  if (!key) { console.warn('RESEND_API_KEY not set, skipping email:', subject); return false; }
  const to = env('LEAD_EMAIL_TO').split(',').map(s => s.trim()).filter(Boolean);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('LEAD_EMAIL_FROM'), to, subject, html, text, reply_to: replyTo || undefined }),
  });
  if (!r.ok) throw new Error(`Resend failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return true;
}

/* ---------- Rendering ---------- */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => (n == null || n === '' || isNaN(+n)) ? '' : Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
export const ref = id => String(id).slice(0, 8).toUpperCase();

export function leadEmailHtml(lead, { heading }) {
  const s = lead.summary || {};
  const rows = s.rows || {};
  const flags = Array.isArray(s.flags) ? s.flags : [];
  const todo = Array.isArray(s.todo) ? s.todo : [];
  const sec = (title, inner) => `<tr><td style="padding:18px 0 6px;font:700 11px/1 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#0369a1">${esc(title)}</td></tr><tr><td>${inner}</td></tr>`;
  const table = pairs => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:14px/1.5 Arial,sans-serif;color:#0a0e1a">${
    pairs.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}</table>`;
  const body = Object.entries(rows).map(([k, pairs]) => Array.isArray(pairs) ? sec(k, table(pairs)) : '').join('')
    + (flags.length ? sec('Flags for review', flags.map(f => `<div style="margin:0 0 6px;padding:8px 10px;font:14px/1.45 Arial,sans-serif;background:${f[0] === 'warn' ? '#fff4dd;color:#8a5200' : '#eef6fd;color:#0b4f75'}">${esc(f[1])}</div>`).join('')) : '')
    + (todo.length ? sec('Collect on the call', `<ul style="margin:0;padding-left:18px;font:14px/1.7 Arial,sans-serif;color:#0a0e1a">${todo.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`) : '');
  const tel = (lead.mobile || '').replace(/[^\d+]/g, '');
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fff;border-top:4px solid #0ea5e9">
<tr><td style="padding:24px 28px 8px;background:#0a0e1a">
  <div style="font:800 13px/1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#f1f5f9">Elevate <span style="color:#0ea5e9">Asset Finance</span></div>
  <div style="font:800 24px/1.15 Arial,sans-serif;color:#fff;margin:14px 0 6px">${esc(heading)}</div>
  <div style="font:14px/1.5 Arial,sans-serif;color:#94a3b8;padding-bottom:18px">${esc(lead.first_name || 'Unnamed')} · ${esc(lead.path || '')} · ${esc(lead.asset || 'asset tbc')}${lead.amount ? ' · ' + esc(money(lead.amount)) : ''} · Ref ${esc(ref(lead.id))}</div>
</td></tr>
<tr><td style="padding:16px 28px 0">${tel ? `<a href="tel:${esc(tel)}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font:700 14px/1 Arial,sans-serif;padding:12px 18px;margin-right:8px">Call ${esc(lead.mobile)}</a>` : ''}${lead.email ? `<a href="mailto:${esc(lead.email)}" style="display:inline-block;border:1px solid #cbd5e1;color:#0a0e1a;text-decoration:none;font:700 14px/1 Arial,sans-serif;padding:11px 18px">Email</a>` : ''}</td></tr>
<tr><td style="padding:0 28px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr>
</table>
<p style="max-width:620px;margin:12px auto 0;font:12px/1.5 Arial,sans-serif;color:#64748b">Captured by the online application at ${esc(new Date(lead.updated_at || Date.now()).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' }))} (Brisbane time). Contains personal information. Do not forward outside Elevate.</p>
</body></html>`;
}
