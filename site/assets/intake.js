/* W&Co Finance application assistant.
   Usage: const app = BrokerIntake.mount(element, { onState(state) {}, canFocus() { return true; } });
   The same code powers the floating panel on the homepage and the full page at /apply.
   Progress is shared between them (stored in this browser), and saved to the broker system
   through /.netlify/functions/lead once contact details are in. */
(() => {
'use strict';

/* ---------- Config ---------- */
const API = '/.netlify/functions/lead';
const SITE_DOMAIN = 'your-domain.com.au'; // set to the live domain once it's registered
const LIVE_HOSTS = new RegExp(`(^|\\.)${SITE_DOMAIN.replace(/\./g, '\\.')}$|\\.netlify\\.app$|^localhost$|^127\\.0\\.0\\.1$`);
const PREVIEW = !LIVE_HOSTS.test(location.hostname);
const DOCS = { privacy: '/privacy', creditGuide: '/credit-guide.pdf' };
const STORE = 'wco-apply-v1';

/* ---------- Helpers ---------- */
const STATES = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
const TEN = { 'Under 1 year': 0.5, '1 to 2 years': 1.5, '2 to 3 years': 2.5, '3 years or more': 3 };
const TENOPTS = Object.keys(TEN);
const DONE = "That's everything";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const monthFmt = v => { if (!v) return ''; const [y, m] = v.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }); };
const isC = a => a.path === 'Personal use';
const isB = a => a.path === 'Business use';
const pmt = (P, rate, n) => { const r = rate / 12; return P * r / (1 - Math.pow(1 + r, -n)); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/* ---------- The question flow ----------
   Rebuilt from the answers every time, so branches and loops stay consistent
   and "change last answer" is simply removing one answer. */
function steps(a) {
  const S = []; const add = o => { S.push(o); return o.id in a; };
  const sAbout = 'About you', sFin = 'The finance', sBiz = 'Business', sRes = 'Residency', sWork = 'Work', sInc = 'Income', sCom = 'Loans', sCred = 'Credit', sEnd = 'Wrap up';

  if (!add({ id: 'path', sec: sAbout, type: 'choice', ask: "First up, is this finance for personal use or for a business?", opts: ['Personal use', 'Business use'] })) return S;

  // Privacy collection notice and consent come before any personal details.
  add({ id: 'consent', sec: sAbout, type: 'choice', opts: ['I agree, let’s start'], primary: true,
    ask: a => `Before we start, a quick note on your information.
      <ul><li>We collect it to assess what finance may suit you and to contact you about it.</li>
      <li>We'll only share it with lenders and our aggregator if you decide to go ahead.</li>
      <li>You can ask to see or correct it at any time.</li></ul>
      <div class="ei-docs">
        <a href="${DOCS.privacy}" target="_blank" rel="noopener">Privacy and Collection Notice <span>Open</span></a>
        ${isC(a) ? `<a href="${DOCS.creditGuide}" target="_blank" rel="noopener">Credit Guide <span>Open</span></a>` : ''}
      </div>
      <small>${isC(a) ? 'The Credit Guide explains who we are, the services we provide, and how to make a complaint. ' : ''}By continuing you agree to us collecting your details and contacting you about your enquiry.</small>` });

  add({ id: 'name', sec: sAbout, type: 'text', ph: 'First name', ask: "Great. What's your first name?" });
  add({ id: 'mobile', sec: sAbout, type: 'tel', ph: '04xx xxx xxx', ask: a => `Nice to meet you, ${esc(a.name)}. What's the best mobile to reach you on?`,
    valid: v => /^(\+?61|0)4\d{8}$/.test(v.replace(/[\s()-]/g, '')) || "That doesn't look like an Australian mobile. Try 04xx xxx xxx." });
  add({ id: 'email', sec: sAbout, type: 'email', ph: 'you@example.com', ask: "And your email address?", valid: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Please check the email address.' });
  add({ id: 'suburb', sec: sAbout, type: 'text', ph: 'Suburb', ask: "Which suburb are you in?" });
  add({ id: 'state', sec: sAbout, type: 'choice', opts: STATES, ask: "And which state?",
    after: a => `Thanks ${esc(a.name)}. <strong>Your details are saved.</strong> If you need to stop at any point, a broker can pick up from here.` });

  if (isC(a)) {
    add({ id: 'rel', sec: sAbout, type: 'choice', opts: ['Single', 'Married', 'De facto'], ask: "Are you single, married or in a de facto relationship?" });
    add({ id: 'living', sec: sAbout, type: 'choice', opts: ['Renting', 'Own with a mortgage', 'Own outright', 'Boarding or with family'], ask: "What's your living situation?" });
  }

  // Finance
  const assetOpts = isB(a) ? ['Car or ute', 'Truck or trailer', 'Equipment or machinery', 'Medical or dental equipment', 'Other'] : ['Car', 'Motorbike', 'Boat', 'Caravan or camper', 'Other'];
  if (add({ id: 'asset', sec: sFin, type: 'choice', opts: assetOpts, ask: "What are you looking to finance?" }) && a.asset === 'Other')
    add({ id: 'assetOther', sec: sFin, type: 'text', ph: 'Describe it', ask: "No problem. What is it?" });
  if (a.asset === 'Car' || a.asset === 'Car or ute')
    add({ id: 'condition', sec: sFin, type: 'choice', opts: ['New', 'Pre-owned'], ask: "Is it new or pre-owned?" });
  if (add({ id: 'stage', sec: sFin, type: 'choice', opts: ["Yes, I've found it", 'Still shopping around', 'Just working out a budget'], ask: "Have you found the exact one yet?" }) && a.stage === "Yes, I've found it")
    add({ id: 'detail', sec: sFin, type: 'text', ph: 'e.g. 2023 Toyota RAV4 GXL, dealer sale', ask: "Tell me about it: year, make, model, and whether it's from a dealer or a private sale." });
  add({ id: 'amount', sec: sFin, type: 'money', ph: '45000',
    ask: a => a.stage === 'Just working out a budget' ? "Roughly how much are you thinking of borrowing? A ballpark is fine." : "How much are you looking to borrow? A rough figure is fine.",
    valid: v => (+v >= 2000 && +v <= 5000000) || 'Enter an amount between $2,000 and $5,000,000.',
    after: a => { const lo = pmt(+a.amount, .075, 60), hi = pmt(+a.amount, .12, 60);
      return `For a rough feel: over 5 years, ${money(a.amount)} works out around <strong>${money(lo)} to ${money(hi)} a month</strong> before fees, depending on the rate you're approved for. Your broker will compare actual lender rates for your situation.`; } });

  if (isB(a)) {
    add({ id: 'biz', sec: sBiz, type: 'text', ph: 'Business or trading name', ask: "What's the business called?" });
    add({ id: 'abn', sec: sBiz, type: 'text', ph: '11 digits', ask: "What's the ABN?", valid: v => /^\d{11}$/.test(v.replace(/\s/g, '')) || 'An ABN is 11 digits.' });
    add({ id: 'structure', sec: sBiz, type: 'choice', opts: ['Sole trader', 'Company', 'Trust', 'Partnership'], ask: "How is the business set up?" });
    add({ id: 'trading', sec: sBiz, type: 'choice', opts: ['Under 1 year', '1 to 2 years', '2 years or more'], ask: "How long has the ABN been active?" });
    add({ id: 'gst', sec: sBiz, type: 'choice', opts: ['Yes', 'No'], ask: "Is the business registered for GST?" });
    add({ id: 'industry', sec: sBiz, type: 'text', ph: 'e.g. Landscaping', ask: "What does the business do?" });
    add({ id: 'turnover', sec: sBiz, type: 'choice', opts: ['Under $75k', '$75k to $250k', '$250k to $1m', 'Over $1m'], ask: "Roughly what's the annual turnover?" });
  }

  // Residency
  if (add({ id: 'res', sec: sRes, type: 'choice', opts: ['Australian citizen', 'Permanent resident', 'On a visa'], ask: "Are you an Australian citizen, permanent resident, or on a visa?" }) && a.res === 'On a visa') {
    add({ id: 'visa', sec: sRes, type: 'text', ph: 'e.g. Subclass 482', ask: "Which visa type or subclass number?" });
    add({ id: 'visaExp', sec: sRes, type: 'month', ask: "When does it expire?" });
  }

  if (isC(a)) {
    // Employment: current role, then earlier roles until about 3 years is covered (two previous at most)
    let total = 0;
    for (let i = 0; i < 3; i++) {
      if (i > 0 && total >= 3) break;
      const p = `emp${i}_`;
      const opts = ['Full-time', 'Part-time', 'Casual', 'Contract', 'Self-employed'].concat(i === 0 ? ['Not working right now'] : []);
      if (!add({ id: p + 'status', sec: sWork, type: 'choice', opts,
        ask: i === 0 ? "Now your work. What's your current employment status?" :
          (a.emp0_status === 'Not working right now' && i === 1 ? "What was your most recent job?" : "Lenders like to see about 3 years of work history. What was the job before that?") })) break;
      if (a[p + 'status'] === 'Not working right now') continue;
      add({ id: p + 'employer', sec: sWork, type: 'text', ph: 'Employer name', ask: i === 0 ? "Who do you work for?" : "Who was the employer?" });
      add({ id: p + 'title', sec: sWork, type: 'text', ph: 'Job title', ask: "And your job title or occupation?" });
      if (!add({ id: p + 'tenure', sec: sWork, type: 'choice', opts: TENOPTS, ask: i === 0 ? "How long have you been there?" : "How long were you there?" })) break;
      total += TEN[a[p + 'tenure']];
    }
    if (!('emp0_status' in a)) return S;

    if (add({ id: 'incType', sec: sInc, type: 'choice', opts: ['Annual salary before tax', 'What lands in my account each pay', 'No regular pay right now'], ask: "How would you like to tell me your income?" })) {
      if (a.incType === 'Annual salary before tax') add({ id: 'incAnnual', sec: sInc, type: 'money', ph: '85000', ask: "What's your annual salary before tax?" });
      if (a.incType === 'What lands in my account each pay') {
        add({ id: 'payFreq', sec: sInc, type: 'choice', opts: ['Weekly', 'Fortnightly', 'Monthly'], ask: "How often are you paid?" });
        add({ id: 'payAmt', sec: sInc, type: 'money', ph: '2400', ask: a => `And what lands in your account each ${({ Weekly: 'week', Fortnightly: 'fortnight', Monthly: 'month' })[a.payFreq] || 'pay'}, after tax?` });
      }
    }
    if (a.rel === 'Married' || a.rel === 'De facto') {
      if (add({ id: 'partner', sec: sInc, type: 'choice', opts: ['Yes, include it', 'No, just mine', 'My partner isn’t working'], ask: "Would you like to include your partner's income? It can make a real difference to what lenders will approve." }) && a.partner === 'Yes, include it') {
        add({ id: 'pFreq', sec: sInc, type: 'choice', opts: ['Weekly', 'Fortnightly', 'Monthly'], ask: "How often are they paid?" });
        add({ id: 'pAmt', sec: sInc, type: 'money', ph: '1800', ask: "Roughly what lands in their account each pay, after tax? That's all we need about them for now." });
      }
    }
    if (add({ id: 'cl', sec: sInc, type: 'choice', opts: ['Yes', 'No'], ask: "Do you receive any Centrelink payments, like Family Tax Benefit?" }) && a.cl === 'Yes') {
      add({ id: 'clType', sec: sInc, type: 'text', ph: 'e.g. Family Tax Benefit A', ask: "Which payment?" });
      add({ id: 'clAmt', sec: sInc, type: 'money', ph: '450', ask: "About how much per fortnight?" });
    }
  }

  // Loans and commitments, added one at a time
  const lopts = isB(a) ? ['Equipment or vehicle finance', 'Business loan', 'Overdraft or business card', 'ATO payment plan', 'Other']
                       : ['Credit card', 'Personal loan', 'Car loan', 'Home loan', 'Buy now pay later', 'Other'];
  for (let i = 0; i < 10; i++) {
    const id = `liab${i}`;
    if (!add({ id, sec: sCom, type: 'choice', opts: lopts.concat(i === 0 ? ['None'] : [DONE]),
      ask: i === 0 ? (isB(a) ? "Does the business have any finance or debts at the moment? Add them one at a time." : "Do you have any loans or credit cards at the moment? Add them one at a time.") : "Got it. Anything else?" })) break;
    const t = a[id]; if (t === 'None' || t === DONE) break;
    const isLimit = /card|Overdraft|Buy now/.test(t);
    if (!add({ id: id + '_amt', sec: sCom, type: 'money', ph: isLimit ? '5000' : '450', ask: isLimit ? `What's the limit on that ${t.toLowerCase()}?` : "Roughly what's the monthly repayment?" })) break;
  }

  // Credit history: their own view, plus any past issues. No credit check happens here.
  add({ id: 'creditSelf', sec: sCred, type: 'choice', opts: ['Excellent', 'Good', 'Average', 'Not great', 'Not sure'],
    ask: (isB(a) ? "Now a quick one on your personal credit history." : "Now a quick one on your credit history.") + " How would you rate it yourself? Just your best guess, there's no credit check here." });
  if (add({ id: 'creditIssues', sec: sCred, type: 'choice', opts: ['No, never', 'Yes, a default or late payments', 'Yes, bankruptcy or a debt agreement', 'Not sure'],
    ask: "Have you ever had any issues with credit, like a default, late payments or bankruptcy? Plenty of people have, and it doesn't rule you out. It just helps us pick the right lender." })
    && /^Yes/.test(a.creditIssues))
    add({ id: 'creditDetail', sec: sCred, type: 'text', ph: 'e.g. $900 phone bill default in 2022, now paid',
      ask: "Thanks for being upfront. Briefly, what happened, roughly when, and has it been paid or finished?" });

  if (add({ id: 'assets', sec: sEnd, type: 'choice', opts: ['Add a quick summary', 'Skip, I’ll cover it on the call'], ask: "Optional: would you like to list any assets, like savings, property or vehicles? Totally fine to skip." }) && a.assets === 'Add a quick summary')
    add({ id: 'assetsText', sec: sEnd, type: 'text', ph: 'e.g. $15k savings, 2018 Hilux', ask: "Go for it. A rough list is perfect." });
  add({ id: 'call', sec: sEnd, type: 'choice', opts: ['Morning', 'Lunchtime', 'Afternoon', 'After 5pm', 'Text me first'], ask: "Last one. When's best for a broker to get in touch?" });
  return S;
}
const textOf = (s, a) => typeof s.ask === 'function' ? s.ask(a) : s.ask;
const display = (s, v) => s.type === 'money' ? money(v) : s.type === 'month' ? monthFmt(v) : v;
const sectionsFor = a => isB(a) ? ['About you', 'The finance', 'Business', 'Residency', 'Loans', 'Credit', 'Wrap up']
                                : ['About you', 'The finance', 'Residency', 'Work', 'Income', 'Loans', 'Credit', 'Wrap up'];

/* ---------- Broker summary (sent with each save, used for the handover email) ---------- */
function summarise(a, meta, finished, leadId) {
  const C = isC(a), rows = {};
  const put = (sec, k, v) => { if (v === undefined || v === '') return; (rows[sec] = rows[sec] || []).push([k, String(v)]); };
  put('Contact', 'Name', a.name); put('Contact', 'Mobile', a.mobile); put('Contact', 'Email', a.email);
  if (a.suburb) put('Contact', 'Location', [a.suburb, a.state].filter(Boolean).join(', '));
  put('Contact', 'Best time', a.call);
  put('Applicant', 'Path', a.path); put('Applicant', 'Relationship', a.rel); put('Applicant', 'Living', a.living);
  put('Applicant', 'Residency', a.res === 'On a visa' ? `Visa ${a.visa || ''}${a.visaExp ? ', expires ' + monthFmt(a.visaExp) : ''}` : a.res);
  put('Finance', 'Asset', a.asset === 'Other' ? a.assetOther : a.asset); put('Finance', 'Condition', a.condition); put('Finance', 'Stage', a.stage); put('Finance', 'Details', a.detail);
  if (a.amount) put('Finance', 'Amount', money(a.amount));
  put('Business', 'Name', a.biz); put('Business', 'ABN', a.abn); put('Business', 'Structure', a.structure); put('Business', 'ABN age', a.trading);
  put('Business', 'GST', a.gst); put('Business', 'Industry', a.industry); put('Business', 'Turnover', a.turnover);
  for (let i = 0; i < 3; i++) { const p = `emp${i}_`; if (!a[p + 'status']) continue;
    put('Employment', i === 0 ? 'Current' : 'Previous' + (i === 2 ? ' (2)' : ''), [a[p + 'status'], a[p + 'title'], a[p + 'employer'], a[p + 'tenure']].filter(Boolean).join(' | ')); }
  if (a.incAnnual) put('Income', 'Salary', money(a.incAnnual) + ' p.a. gross');
  if (a.payAmt) put('Income', 'Net pay', `${money(a.payAmt)} ${(a.payFreq || '').toLowerCase()}`);
  if (a.incType === 'No regular pay right now') put('Income', 'Pay', 'None declared');
  if (a.partner) put('Income', 'Partner', a.pAmt ? `${money(a.pAmt)} ${(a.pFreq || '').toLowerCase()} net` : a.partner);
  if (a.cl) put('Income', 'Centrelink', a.cl === 'Yes' ? `${a.clType || ''}${a.clAmt ? ', ' + money(a.clAmt) + '/fn' : ''}` : 'No');
  let limits = 0;
  for (let i = 0; i < 10; i++) { const t = a['liab' + i]; if (!t || t === DONE) break; if (t === 'None') { put('Commitments', 'Declared', 'None'); break; }
    const v = a['liab' + i + '_amt']; const isLimit = /card|Overdraft|Buy now/.test(t); if (v && isLimit) limits += +v;
    put('Commitments', t, v ? (isLimit ? money(v) + ' limit' : money(v) + '/mth') : 'pending'); }
  put('Credit', 'Self-rated', a.creditSelf); put('Credit', 'Past issues', a.creditIssues); put('Credit', 'Details', a.creditDetail);
  if (a.assets) put('Other', 'Assets', a.assetsText || 'Skipped, confirm on call');
  if (meta.consentAt) put('Compliance', 'Privacy consent', new Date(meta.consentAt).toLocaleString('en-AU'));
  if (C && meta.consentAt) put('Compliance', 'Credit Guide', 'Provided in chat');

  const flags = [];
  if (a.res === 'On a visa' && a.visaExp) { const [y, m] = a.visaExp.split('-').map(Number); const now = new Date(); const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
    if (months < 60) flags.push(['warn', `Visa expires ${monthFmt(a.visaExp)}, about ${Math.max(months, 0)} months away. Shorter than a 5 year term.`]); }
  if (a.emp0_status === 'Not working right now') flags.push(['warn', 'Not currently employed. Confirm income source.']);
  if (a.emp0_status === 'Casual' && a.emp0_tenure === 'Under 1 year') flags.push(['warn', 'Casual under 12 months in current role.']);
  else if (a.emp0_tenure === 'Under 1 year') flags.push(['warn', 'Under 12 months in current role. Check probation.']);
  if (a.trading === 'Under 1 year') flags.push(['warn', 'ABN under 12 months. Limited lender panel.']);
  if (/^Yes/.test(a.creditIssues || '')) flags.push(['warn', `Credit issue declared: ${a.creditIssues.replace(/^Yes, /, '')}${a.creditDetail ? ` (${a.creditDetail})` : ''}. Check file before choosing lenders.`]);
  else if (a.creditSelf === 'Not great') flags.push(['warn', 'Self-rated credit "Not great". Check file before choosing lenders.']);
  if (a.creditIssues === 'Not sure' || a.creditSelf === 'Not sure') flags.push(['info', 'Unsure of own credit history. Confirm on credit check.']);
  if (a.cl === 'Yes') flags.push(['info', 'Centrelink income declared. Check lender policy on acceptance.']);
  if (a.partner === 'Yes, include it') flags.push(['info', 'Partner income included. Partner details and consent needed on call.']);
  if (limits) flags.push(['info', `Total card and revolving limits ${money(limits)}. Lenders assess around 3.8% of limit monthly.`]);
  if (a.stage === 'Just working out a budget') flags.push(['info', 'No asset chosen yet. Pre-approval candidate.']);
  if (a.state && a.state !== 'QLD') flags.push(['info', `Interstate (${a.state}).`]);

  const todo = C ? ['Driver licence and date of birth', 'Identity verification (VOI)', 'Credit check consent', 'Requirements and objectives', 'Dependants and living expenses']
                 : ['Director licence and date of birth', 'Identity verification (VOI)', 'Credit check consent', 'Recent BAS or financials if required', 'Supplier invoice or quote'];
  if (a.assets && !a.assetsText) todo.push('Assets and position');
  if (a.partner === 'Yes, include it') todo.push('Partner details if joint application');

  const all = steps(a); const done = all.filter(s => s.id in a).length;
  const percent = finished ? 80 : Math.min(79, Math.round(done / Math.max(all.length, isC(a) ? 34 : 28) * 80));

  let notes = `W&CO FINANCE | ONLINE APPLICATION\nRef ${leadId ? leadId.slice(0, 8).toUpperCase() : 'n/a'} | ${finished ? 'Complete' : 'Partial'} (${percent}%)\n`;
  for (const [k, r] of Object.entries(rows)) notes += `\n${k.toUpperCase()}\n` + r.map(([x, y]) => `  ${x}: ${y}`).join('\n') + '\n';
  if (flags.length) notes += `\nFLAGS\n` + flags.map(f => '  - ' + f[1]).join('\n') + '\n';
  notes += `\nTO COLLECT ON CALL\n` + todo.map(x => '  [ ] ' + x).join('\n') + '\n';
  return { rows, flags, todo, percent, notes };
}

/* ---------- Mount ---------- */
function mount(root, opts = {}) {
  let ans = {}, order = [], meta = {}, busy = false, finished = false, leadId = null;
  const canFocus = () => (opts.canFocus ? opts.canFocus() : true) && matchMedia('(pointer: fine)').matches;

  root.classList.add('ei');
  root.innerHTML = `
    <div class="ei-head">
      <div class="ei-title"><h2>${esc(opts.title || 'Your application')}</h2><span class="ei-saved"><i></i><span>Not started</span></span></div>
      <div class="ei-steps"></div>
      ${PREVIEW ? '<div class="ei-preview">Preview mode. Answers are not saved or sent anywhere.</div>' : ''}
    </div>
    <div class="ei-log" aria-live="polite"></div>
    <div class="ei-composer">
      <div class="ei-input"></div>
      <div class="ei-err" role="alert"></div>
      <div class="ei-foot">
        <span>General information only. Not a quote or credit advice.</span>
        <span class="ei-links"><button class="ei-link" type="button" data-act="undo">Change last answer</button><button class="ei-link" type="button" data-act="restart">Start over</button></span>
      </div>
      <div class="ei-hp" aria-hidden="true"><label>Leave blank <input name="company_website" tabindex="-1" autocomplete="off"></label></div>
    </div>`;
  const $ = s => root.querySelector(s);
  const log = $('.ei-log'), inputEl = $('.ei-input'), errEl = $('.ei-err'), savedEl = $('.ei-saved'), stepsEl = $('.ei-steps'), hp = $('.ei-hp input');
  const next = () => steps(ans).find(s => !(s.id in ans));
  const toEnd = () => { log.scrollTop = log.scrollHeight; };

  /* Persistence in this browser (resume after a refresh, shared across pages) */
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify({ leadId, ans, order, meta, finished })); } catch (e) {} };
  const restore = () => { try { const d = JSON.parse(localStorage.getItem(STORE) || 'null'); if (d && d.leadId) { ({ leadId, ans, order, meta } = d); finished = !!d.finished; return true; } } catch (e) {} return false; };
  const clearStore = () => { try { localStorage.removeItem(STORE); } catch (e) {} };

  /* Saving to the broker system */
  const setSaved = (state, text) => { savedEl.className = 'ei-saved' + (state ? ' ' + state : ''); savedEl.lastElementChild.textContent = text; };
  let saveTimer = null, pending = false;
  const summary = () => summarise(ans, meta, finished, leadId);
  const payload = stage => { const s = summary();
    return { id: leadId, stage, answers: ans, meta, summary: { rows: s.rows, flags: s.flags, todo: s.todo, notes: s.notes, percent: s.percent },
      hp: hp.value, page: location.pathname, referrer: document.referrer || null }; };
  async function save(stage) {
    if (!leadId || !('state' in ans)) return true;
    pending = false; clearTimeout(saveTimer);
    if (PREVIEW) { setSaved('on', stage === 'complete' ? 'Sent (preview)' : 'Saved (preview)'); return true; }
    try {
      setSaved('', 'Saving');
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(stage)), keepalive: stage !== 'complete' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setSaved('on', stage === 'complete' ? 'Sent to broker' : 'Saved');
      return true;
    } catch (e) { setSaved('err', 'Not saved yet'); return false; }
  }
  const queueSave = () => { if (!('state' in ans) || finished) return; pending = true; clearTimeout(saveTimer); saveTimer = setTimeout(() => save('progress'), 1200); };
  addEventListener('pagehide', () => { if (pending && !PREVIEW) navigator.sendBeacon?.(API, new Blob([JSON.stringify(payload('progress'))], { type: 'application/json' })); });

  /* Chat rendering */
  function bubble(kind, html, isText) {
    const d = document.createElement('div'); d.className = 'ei-msg ei-' + kind.split(' ').join(' ei-');
    if (isText) d.textContent = html; else d.innerHTML = html;
    log.appendChild(d); toEnd(); return d;
  }
  const WELCOME = "Hi, I'm the W&Co Finance application assistant. I'll gather the details a broker needs so you don't have to fill in forms or wait on hold. It takes about 5 minutes, and a real broker reviews everything before anything goes to a lender.";
  const NO_ID = "<strong>No ID needed here.</strong> I won't ask for your licence, date of birth or documents. Your broker handles those securely on the call.";

  function rebuild() {
    log.innerHTML = '';
    bubble('bot', WELCOME); bubble('bot note', NO_ID);
    const a = {};
    for (const id of order) {
      const s = steps(a).find(x => x.id === id); if (!s) continue;
      bubble('bot', textOf(s, a)); a[id] = ans[id];
      bubble('user', display(s, ans[id]), true);
      if (s.after) bubble('bot note', s.after(a));
      if (id === 'path' && meta.prefill) bubble('bot note', `Got it: <strong>${esc(meta.prefill.label)}</strong>${meta.prefill.amount ? `, around <strong>${money(meta.prefill.amount)}</strong>` : ''}. I'll skip those questions.`);
    }
    render();
    if (finished) finish(false); else askNext(false);
  }
  function askNext(animate = true) {
    const s = next(); inputEl.innerHTML = ''; errEl.textContent = '';
    if (!s) { finish(true); return; }
    const show = () => { bubble('bot', textOf(s, ans)); drawInput(s); busy = false; };
    if (animate && !reduced()) {
      busy = true; const t = document.createElement('div'); t.className = 'ei-typing'; t.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(t); toEnd();
      setTimeout(() => { t.remove(); show(); }, 480);
    } else show();
  }
  function drawInput(s) {
    inputEl.innerHTML = '';
    if (s.type === 'choice') {
      const w = document.createElement('div'); w.className = 'ei-chips';
      s.opts.forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ei-chip' + (s.primary ? ' primary' : ''); b.textContent = o; b.onclick = () => answer(s, o); w.appendChild(b); });
      inputEl.appendChild(w); toEnd(); return;
    }
    const f = document.createElement('form'); f.className = 'ei-field'; f.noValidate = true;
    const wrap = document.createElement('div'); wrap.className = 'ei-field-wrap';
    const inp = document.createElement('input'); inp.id = 'ei-answer-' + s.id; inp.placeholder = s.ph || ''; inp.autocomplete = 'off'; inp.setAttribute('aria-label', s.ph || 'Your answer');
    if (s.type === 'money') { const pre = document.createElement('span'); pre.className = 'ei-pre'; pre.textContent = '$'; wrap.appendChild(pre); inp.inputMode = 'numeric'; inp.type = 'text'; }
    else if (s.type === 'tel') { inp.type = 'tel'; inp.autocomplete = 'tel'; }
    else if (s.type === 'email') { inp.type = 'email'; inp.autocomplete = 'email'; }
    else if (s.type === 'month') { inp.type = 'month'; }
    else inp.type = 'text';
    if (s.id === 'name') inp.autocomplete = 'given-name';
    if (s.id === 'suburb') inp.autocomplete = 'address-level2';
    wrap.appendChild(inp);
    const b = document.createElement('button'); b.className = 'ei-send'; b.type = 'submit'; b.textContent = 'Send';
    f.append(wrap, b);
    f.onsubmit = e => { e.preventDefault(); let v = inp.value.trim();
      if (!v) { errEl.textContent = 'Type an answer to continue.'; return; }
      if (v.length > 200) { errEl.textContent = 'Please keep it under 200 characters. Your broker can get the full story on the call.'; return; }
      if (s.type === 'money') { v = v.replace(/[^\d.]/g, ''); if (!v || isNaN(+v)) { errEl.textContent = 'Enter a dollar amount, like 25000.'; return; } v = String(Math.round(+v)); }
      if (s.type === 'month' && !/^\d{4}-\d{2}$/.test(v)) { errEl.textContent = 'Pick a month and year.'; return; }
      if (s.valid) { const r = s.valid(v); if (r !== true) { errEl.textContent = r; return; } }
      answer(s, v); };
    inputEl.appendChild(f); toEnd();
    if (canFocus()) inp.focus({ preventScroll: true });
  }
  function answer(s, v) {
    if (busy) return;
    if (!leadId) leadId = uuid();
    if (s.id === 'consent') meta.consentAt = new Date().toISOString();
    ans[s.id] = v; order.push(s.id); inputEl.innerHTML = ''; errEl.textContent = '';
    bubble('user', display(s, v), true);
    if (s.after) bubble('bot note', s.after(ans));
    persist(); render();
    if (s.id === 'state') save('progress'); else queueSave();
    askNext(true);
  }
  async function finish(fresh) {
    finished = true; persist(); render();
    inputEl.innerHTML = '';
    if (fresh) {
      const when = ans.call === 'Text me first' ? 'will text you first to find a good time' :
        `will be in touch ${ans.call === 'After 5pm' ? 'after 5pm' : ans.call === 'Lunchtime' ? 'around lunchtime' : 'in the ' + ans.call.toLowerCase()}`;
      bubble('bot', `That's everything I need, ${esc(ans.name)}. A broker from W&Co Finance ${when} on the next business day, or sooner if we can.`);
    }
    const ok = meta.sentAt ? true : await save('complete');
    if (ok && !meta.sentAt) { meta.sentAt = new Date().toISOString(); persist(); }
    if (!ok) {
      errEl.textContent = "We couldn't send your application just now. Check your connection and try again.";
      const b = document.createElement('button'); b.className = 'ei-chip primary'; b.type = 'button'; b.textContent = 'Try again';
      b.onclick = () => { errEl.textContent = ''; finish(false); };
      inputEl.appendChild(b); return;
    }
    if (!log.querySelector('.ei-next')) {
      const n = document.createElement('div'); n.className = 'ei-next';
      n.innerHTML = `<h3>What happens next</h3><ol>
        <li><span class="ei-check">${TICK}</span><span>A broker reviews your details and calls you${ans.call === 'Text me first' ? ' after a quick text' : ''}.</span></li>
        <li><span class="ei-check">${TICK}</span><span>They confirm your ID and run a credit check with your consent.</span></li>
        <li><span class="ei-check">${TICK}</span><span>You get your options from our lender panel, with the costs explained clearly.</span></li></ol>`;
      log.appendChild(n);
      if (PREVIEW) {
        const p = document.createElement('div'); p.className = 'ei-handover';
        p.innerHTML = '<h4>Preview only: the handover email you would receive</h4>';
        const pre = document.createElement('pre'); pre.textContent = summary().notes; p.appendChild(pre); log.appendChild(p);
      }
      toEnd();
    }
    render();
  }

  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act || busy) return;
    if (act === 'undo') { if (!order.length) return; const id = order.pop(); delete ans[id]; if (id === 'consent') delete meta.consentAt;
      if (id === 'path' && meta.prefill) { delete ans.asset; delete ans.amount; delete ans.condition; delete meta.prefill; } finished = false; delete meta.sentAt; persist(); rebuild(); queueSave(); }
    if (act === 'restart') { ans = {}; order = []; meta = {}; leadId = null; finished = false; clearStore(); setSaved('', 'Not started'); rebuild(); }
  });

  /* Progress header and state for the host page */
  function render() {
    const full = sectionsFor(ans);
    const cur = finished ? null : (next() || {}).sec;
    const ci = full.indexOf(cur);
    stepsEl.innerHTML = full.map((n, i) => `<div class="${finished || i < ci ? 'done' : i === ci ? 'now' : ''}"><b></b><small>${n}</small></div>`).join('');
    if (order.length && savedEl.lastElementChild.textContent === 'Not started') setSaved('', 'In progress');
    opts.onState?.({ started: order.length > 0, finished, percent: finished ? 100 : Math.round(summary().percent / 0.8), name: ans.name || null });
  }

  // Keep the newest message in view whenever the chat area changes size (answer buttons appear, keyboard opens, panel resizes)
  if (window.ResizeObserver) { let lastH = 0; new ResizeObserver(([e]) => { const h = e.contentRect.height; if (h < lastH || log.scrollHeight - log.scrollTop - h < 160) toEnd(); lastH = h; }).observe(log); }

  if (restore() && order.length) setSaved('on', finished ? (meta.sentAt ? 'Sent to broker' : 'Not sent yet') : 'Resumed');
  rebuild();

  return {
    focus() { const el = inputEl.querySelector('input, .ei-chip'); if (el && canFocus()) el.focus({ preventScroll: true }); toEnd(); },
    scrollToEnd: toEnd,
    // Start with answers chosen elsewhere on the page (e.g. the homepage sentence). Ignored once an application has started.
    prefill(p) {
      if (order.length || !p || !p.path) return false;
      ans.path = p.path; order.push('path');
      if (p.asset) ans.asset = p.asset;
      if (p.amount) ans.amount = String(Math.round(p.amount));
      if (p.condition) ans.condition = p.condition;
      if (p.asset) meta.prefill = { label: p.label || p.asset, amount: p.amount || null };
      if (!leadId) leadId = uuid();
      persist(); rebuild(); return true;
    },
    started: () => order.length > 0,
  };
}

window.BrokerIntake = { mount, PREVIEW };
})();
