// Scheduled: every day at 7:30am Brisbane time.
// Emails a digest of
//   1. applications people started but did not finish (contact details captured), and
//   2. any completed application whose instant email failed.
// Each lead appears in a digest once.

import { sb, sendEmail, esc, money, ref, leadEmailHtml } from '../lib/leads.mjs';

export const config = { schedule: '30 21 * * *' }; // 21:30 UTC = 07:30 AEST (Brisbane has no daylight saving)

export default async () => {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // give people an hour to finish first
  const cols = 'id,first_name,mobile,email,suburb,state,path,asset,amount,percent,best_time,updated_at,summary,status';

  const partial = await sb(`leads?status=eq.in_progress&notified_partial_at=is.null&updated_at=lt.${cutoff}&select=${cols}&order=updated_at.asc&limit=100`);
  const missed = await sb(`leads?status=eq.complete&notified_complete_at=is.null&select=${cols}&order=updated_at.asc&limit=50`);

  for (const lead of missed || []) {
    await sendEmail({
      subject: `New application (delayed): ${lead.first_name} [${ref(lead.id)}]`,
      html: leadEmailHtml(lead, { heading: 'New online application' }),
      text: lead.summary?.notes || '',
      replyTo: lead.email,
    });
    await sb(`leads?id=eq.${lead.id}`, { method: 'PATCH', body: { notified_complete_at: new Date().toISOString() }, prefer: 'return=minimal' });
  }

  if (partial?.length) {
    const rows = partial.map(l => `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0"><b>${esc(l.first_name)}</b><br><span style="color:#64748b">${esc([l.suburb, l.state].filter(Boolean).join(', '))}</span></td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0"><a href="tel:${esc((l.mobile || '').replace(/[^\d+]/g, ''))}">${esc(l.mobile)}</a><br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0">${esc(l.path || '')}<br>${esc(l.asset || 'asset tbc')} ${esc(money(l.amount))}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap">${esc(l.percent ?? 0)}%<br><span style="color:#64748b">${esc(new Date(l.updated_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</span></td></tr>`).join('');
    const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;padding:24px 12px">
<div style="max-width:720px;margin:0 auto;background:#fff;border-top:4px solid #0ea5e9;padding:24px 24px 28px;font:14px/1.5 Arial,sans-serif;color:#0a0e1a">
<div style="font:800 13px/1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase">Elevate <span style="color:#0ea5e9">Asset Finance</span></div>
<h1 style="font:800 22px/1.2 Arial,sans-serif;margin:14px 0 4px">${partial.length} unfinished application${partial.length > 1 ? 's' : ''}</h1>
<p style="margin:0 0 16px;color:#64748b">These people gave their contact details but stopped before the end. A quick call often gets them over the line.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:14px/1.45 Arial,sans-serif">${rows}</table>
<p style="margin:16px 0 0;color:#64748b;font-size:12px">Full answers for each lead are in the Supabase leads table. Contains personal information. Do not forward outside Elevate.</p>
</div></body></html>`;
    const text = partial.map(l => `${l.first_name} | ${l.mobile} | ${l.email} | ${l.asset || 'asset tbc'} ${money(l.amount)} | ${l.percent ?? 0}% | Ref ${ref(l.id)}`).join('\n');
    const sent = await sendEmail({ subject: `${partial.length} unfinished application${partial.length > 1 ? 's' : ''} to follow up`, html, text });
    if (sent) {
      await sb(`leads?id=in.(${partial.map(l => l.id).join(',')})`, { method: 'PATCH', body: { notified_partial_at: new Date().toISOString() }, prefer: 'return=minimal' });
    }
  }
  return new Response(JSON.stringify({ partial: partial?.length || 0, missed: missed?.length || 0 }), { headers: { 'Content-Type': 'application/json' } });
};
