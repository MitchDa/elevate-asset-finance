# Elevate Asset Finance website

| File | What it is |
|---|---|
| `elevate-asset-finance.html` | Homepage |
| `apply.html` | Online application assistant (served at `/apply`) |
| `netlify/functions/lead.mjs` | Saves each application to Supabase and emails the handover when it's finished |
| `netlify/functions/lead-digest.mjs` | Runs 7:30am Brisbane time daily. Emails unfinished applications to follow up, plus any completed ones whose email failed |
| `netlify/lib/leads.mjs` | Shared database and email helpers |
| `supabase/schema.sql` | Creates the locked-down `leads` table |

## How a lead flows

1. Customer opens `/apply`, chooses personal or business, and accepts the privacy notice (consumers also get the Credit Guide).
2. Once name, mobile, email, suburb and state are in, the page saves to `/.netlify/functions/lead`. It keeps saving after each answer, so you never lose a half-finished lead.
3. The function writes to the `leads` table in Supabase (Sydney region). Only the function holds the key. The browser can't read the table.
4. When they finish, you get an email with the full handover: contact buttons, every answer, flags for review and the list of things to collect on the call.
5. Each morning you get a digest of anyone who started but didn't finish.

No licence numbers, dates of birth or ID documents are collected by the page.

## One-time setup (about 30 minutes)

### 1. Supabase
1. Create a free project at supabase.com. **Choose region: Sydney (ap-southeast-2).**
2. SQL Editor > paste `supabase/schema.sql` > Run.
3. Settings > API: copy the **Project URL** and the **service_role** key.

### 2. Resend (email)
1. Create a free account at resend.com.
2. Domains > add `elevateassetfinance.com.au` and add the DNS records it gives you.
3. API Keys > create one.

### 3. Netlify
1. Add new site > Import from GitHub > pick this repo. No build command needed.
2. Site configuration > Environment variables: add everything in `.env.example` with real values.
3. Deploy. Visit `/apply` and run through it with your own details to test.

## Before going live
- [ ] Upload the real Credit Guide to `/credit-guide.pdf` and a privacy policy page at `/privacy`.
- [ ] Replace `[Aggregator Name] ACL XXXXXXX` in both page footers.
- [ ] Have your compliance contact review the privacy wording in `apply.html` (search for `consent`) and the retention period in `schema.sql`.
- [ ] Set `ALLOWED_ORIGINS` once the domain is live.

## Viewing leads
Supabase > Table Editor > `leads`. Sort by `updated_at`. Use `status` (`in_progress`, `complete`, `contacted`, `closed`) and `broker_notes` to track follow-up. A proper broker dashboard can come later.

## Testing without the backend
Open `apply.html` from any other address (for example, straight from your computer). It runs in preview mode: nothing is saved, and at the end it shows the handover email you would have received.
