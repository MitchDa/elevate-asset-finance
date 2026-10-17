# Elevate Asset Finance

Website for Elevate Asset Finance, with a built-in online application assistant that saves leads and emails the handover to a broker.

## What's where

```
site/                     Everything the public sees (Netlify publishes only this folder)
  index.html              Homepage. "Start online" opens the application as a floating panel
  apply.html              Full-page application, served at /apply (for ads, texts and QR codes)
  assets/
    elevate.css           Elevate Design System: colours, type, buttons, nav, footer
    logo-mark.svg         The Elevate logo mark (also the browser tab icon)
    intake.css            Styles for the application assistant
    intake.js             The application assistant: questions, saving, broker summary
netlify/
  functions/lead.mjs        Saves each application to Supabase, emails the handover when finished
  functions/lead-digest.mjs Runs 7:30am Brisbane time: emails unfinished applications to follow up
  lib/leads.mjs             Shared database and email helpers
supabase/schema.sql       Creates the locked-down leads table
netlify.toml              Hosting config
.env.example              The settings Netlify needs (copy into Netlify, never commit real values)
```

The questions live in one place, `site/assets/intake.js` (the `steps` function). Change them there and both the homepage panel and /apply update.

## How the application works on the homepage

- Customers click **Start online** (in the hero, nav, calculator or contact section) and the application grows out of the corner as a floating panel. They can keep scrolling the page while it's open.
- **Minimise** shrinks it back into a small bubble in the corner showing their progress, for example "Continue application, 40% done".
- **Expand** makes it larger in the middle of the screen. On phones it opens as a full-screen sheet.
- Progress is kept in their browser, so it survives a refresh and carries over between the homepage and /apply.
- Link straight to an open panel with `/#apply`, or to the full page with `/apply`.

## How a lead flows

1. The customer chooses personal or business and accepts the privacy notice. Consumers also get the Credit Guide.
2. Once name, mobile, email, suburb and state are in, the page saves to `/.netlify/functions/lead`, then again after each answer.
3. The function writes to the `leads` table in Supabase (Sydney region). Only the function holds the key.
4. When they finish, you get an email with call and email buttons, every answer, flags for review and the list of things to collect on the call.
5. Each morning you get a digest of anyone who started but didn't finish.

No licence numbers, dates of birth or ID documents are collected online.

## One-time setup (about 30 minutes)

### 1. Supabase
1. Create a free project at supabase.com. **Region: Sydney (ap-southeast-2).**
2. SQL Editor: paste `supabase/schema.sql` and run it.
3. Settings > API: copy the **Project URL** and the **service_role** key.

### 2. Resend (email)
1. Create a free account at resend.com.
2. Domains: add `elevateassetfinance.com.au` and add the DNS records it gives you.
3. API Keys: create one.

### 3. Netlify
1. Add new site > Import from GitHub > pick this repo. The settings come from `netlify.toml`, so no build command is needed.
2. Site configuration > Environment variables: add everything in `.env.example` with real values.
3. Deploy, then run through `/apply` with your own details to test.

## Before going live
- [ ] Add the real Credit Guide at `site/credit-guide.pdf` and a privacy policy page at `site/privacy.html`.
- [ ] Replace `[Aggregator Name] ACL XXXXXXX` in both page footers.
- [ ] Replace the placeholder phone number in the homepage contact section.
- [ ] Confirm the claims on the homepage (30+ lenders, call back in 1 business day) match your aggregator arrangements.
- [ ] Have your compliance contact review the privacy wording in `site/assets/intake.js` (search for `consent`) and the retention period in `supabase/schema.sql`.
- [ ] Set `ALLOWED_ORIGINS` once the domain is live.

## Viewing leads
Supabase > Table Editor > `leads`, sorted by `updated_at`. Use `status` (`in_progress`, `complete`, `contacted`, `closed`) and `broker_notes` to track follow-up.

## Previewing without the backend
Open `site/index.html` or `site/apply.html` from any address other than the live domain or a Netlify address (for example, straight from your computer). The assistant runs in preview mode: nothing is saved, and at the end it shows the handover email you would have received.
