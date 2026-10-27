// POST /.netlify/functions/lead
// Receives answers from apply.html, upserts them into Supabase, and emails the
// handover to the broker the first time an application is marked complete.

import { sb, sendEmail, leadEmailHtml, ref } from '../lib/leads.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 60_000;

const json = (status, obj, origin) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  },
});

function allowedOrigin(req) {
  const origin = req.headers.get('origin');
  const list = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return { ok: true, origin: null };           // not configured: same-origin only in practice
  if (!origin) return { ok: true, origin: null };                 // sendBeacon from same origin may omit it
  return { ok: list.includes(origin), origin };
}

// Keep only short string answers with sensible keys. Anything else is dropped.
function cleanAnswers(a) {
  const out = {};
  if (!a || typeof a !== 'object') return out;
  for (const [k, v] of Object.entries(a).slice(0, 150)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    out[k] = String(v).slice(0, 300);
  }
  return out;
}

const str = (v, n = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };

export default async (req) => {
  const o = allowedOrigin(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: o.ok ? 204 : 403, headers: o.origin ? {
      'Access-Control-Allow-Origin': o.origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {} });
  }
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!o.ok) return json(403, { error: 'Origin not allowed' });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json(413, { error: 'Too large' }, o.origin);
  let p;
  try { p = JSON.parse(raw); } catch { return json(400, { error: 'Invalid JSON' }, o.origin); }

  if (p.hp) return json(200, { ok: true }, o.origin);               // honeypot filled: quietly drop bots
  if (!UUID.test(p.id || '')) return json(400, { error: 'Invalid id' }, o.origin);
  if (!['progress', 'complete'].includes(p.stage)) return json(400, { error: 'Invalid stage' }, o.origin);

  const a = cleanAnswers(p.answers);
  if (!a.name || !a.mobile || !a.email) return json(400, { error: 'Contact details required' }, o.origin);
  const summary = p.summary && typeof p.summary === 'object' ? p.summary : {};
  const meta = p.meta && typeof p.meta === 'object' ? p.meta : {};

  const row = {
    id: p.id,
    updated_at: new Date().toISOString(),
    path: str(a.path, 20),
    first_name: str(a.name, 60),
    mobile: str(a.mobile, 20),
    email: str(a.email, 120),
    suburb: str(a.suburb, 60),
    state: str(a.state, 3),
    asset: str(a.asset === 'Other' ? a.assetOther : a.asset, 80),
    amount: num(a.amount),
    best_time: str(a.call, 20),
    answers: a,
    summary,
    percent: Number.isFinite(+summary.percent) ? Math.max(0, Math.min(100, Math.round(+summary.percent))) : null,
    consent_at: str(meta.consentAt, 40),
    source: str(meta.source, 60),
    source_page: str(p.page, 120),
    referrer: str(p.referrer, 300),
    user_agent: str(req.headers.get('user-agent'), 300),
  };
  if (p.stage === 'complete') { row.status = 'complete'; row.completed_at = row.updated_at; }

  try {
    // Never let a late "progress" save downgrade a completed lead.
    if (p.stage === 'progress') {
      const existing = await sb(`leads?id=eq.${p.id}&select=status`);
      if (existing?.[0]?.status === 'complete') return json(200, { ok: true }, o.origin);
    }
    await sb('leads?on_conflict=id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });

    if (p.stage === 'complete') {
      // Claim the notification so a double submit only emails once.
      const claimed = await sb(`leads?id=eq.${p.id}&notified_complete_at=is.null`, {
        method: 'PATCH', body: { notified_complete_at: new Date().toISOString() }, prefer: 'return=representation' });
      if (claimed?.length) {
        const lead = claimed[0];
        try {
          await sendEmail({
            subject: `New application: ${lead.first_name}, ${lead.asset || 'asset tbc'}${lead.amount ? ' $' + Number(lead.amount).toLocaleString('en-AU') : ''} (${lead.state || '?'}) [${ref(lead.id)}]`,
            html: leadEmailHtml(lead, { heading: 'New online application' }),
            text: summary.notes || '',
            replyTo: lead.email,
          });
        } catch (e) {
          // Release the claim so the daily digest picks it up instead.
          await sb(`leads?id=eq.${p.id}`, { method: 'PATCH', body: { notified_complete_at: null }, prefer: 'return=minimal' });
          console.error(e);
        }
      }
    }
    return json(200, { ok: true }, o.origin);
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Could not save' }, o.origin);
  }
};
