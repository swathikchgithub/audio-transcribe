# Setup Guide

Complete setup for Audio Transcribe — from zero to a running app with auth, database, and payments.

---

## Prerequisites

- Node.js 18+
- An [OpenAI account](https://platform.openai.com) with API access
- A [Supabase account](https://supabase.com) (free tier is fine)
- A [Clerk account](https://clerk.com) (free tier is fine)
- A [Stripe account](https://stripe.com) (only needed when ready to charge users)

---

## 1. OpenAI

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → Create new secret key.
2. Copy it — this is your `OPENAI_API_KEY`.

Whisper pricing: **$0.006 / minute** of audio. A 30-minute file costs $0.18.

---

## 2. Supabase

### Create the project
1. Go to [supabase.com](https://supabase.com) → New project.
2. Choose a name, database password, and region closest to your users.
3. Wait ~1 minute for provisioning.

### Run the migration
Open **SQL Editor** in your Supabase dashboard and run the entire block below:

```sql
-- Transcription history
create table transcriptions (
  id               uuid        default gen_random_uuid() primary key,
  user_id          text        not null,
  filename         text        not null,
  mode             text        not null check (mode in ('transcribe', 'translate')),
  language         text,
  text             text        not null,
  duration_seconds integer     not null default 0,
  created_at       timestamptz default now()
);

create index on transcriptions (user_id, created_at desc);

-- RLS: no permissive policies = anon/authenticated keys have zero access.
-- Server uses the service-role key which bypasses RLS entirely.
alter table transcriptions enable row level security;

-- Subscription / billing status
create table subscriptions (
  user_id                text primary key,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text        not null default 'free',  -- 'free' | 'pro'
  period_start           timestamptz,
  updated_at             timestamptz default now()
);

alter table subscriptions enable row level security;
```

### Get your keys
**Project Settings → API:**
| Key | Env var |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| service_role secret | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ The service role key bypasses RLS. Never expose it to the browser — it's used server-side only.

---

## 3. Clerk

### Create the application
1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → Create application.
2. Name it (e.g. "Audio Transcribe").
3. Enable **Google** and/or **GitHub** as sign-in methods.
4. Clerk walks you through creating OAuth credentials in the Google Cloud Console / GitHub settings.

### Get your keys
**API Keys** page:
| Key | Env var |
|---|---|
| Publishable key | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| Secret key | `CLERK_SECRET_KEY` |

---

## 4. Stripe (when ready to charge users)

The app runs fully without Stripe — free users can transcribe up to 30 min/month. Add Stripe when you want to accept Pro payments.

### Create a product and price
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Products** → Add product.
2. Name: "Audio Transcribe Pro"
3. Add a price: **$12.00 / month** recurring.
4. Copy the **Price ID** (starts with `price_`) → `STRIPE_PRO_PRICE_ID`.

### Enable the customer portal
**Settings → Billing → Customer portal** → Activate. This lets Pro users cancel their own subscriptions without contacting you.

### Get your keys
**Developers → API keys:**
| Key | Env var |
|---|---|
| Publishable key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| Secret key | `STRIPE_SECRET_KEY` |

### Set up the webhook

**Local development:**
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Copy the "webhook signing secret" it prints → STRIPE_WEBHOOK_SECRET
```

**Production:**
1. Stripe Dashboard → **Developers → Webhooks** → Add endpoint.
2. URL: `https://your-domain.com/api/stripe/webhook`
3. Subscribe to these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`.

---

## 5. Local environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with all your keys:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe (leave blank until ready — app works without it)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRO_PRICE_ID=price_...

# Your app's URL (used for Stripe redirect URLs)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 6. Deploy to Vercel

### Add environment variables
In **Vercel → Project → Settings → Environment Variables**, add every key from `.env.local`. For `NEXT_PUBLIC_APP_URL`, use your actual Vercel domain (e.g. `https://audio-transcribe.vercel.app`).

| Variable | Notes |
|---|---|
| `OPENAI_API_KEY` | |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | |
| `CLERK_SECRET_KEY` | |
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `SUPABASE_SERVICE_ROLE_KEY` | |
| `STRIPE_SECRET_KEY` | Use live key (`sk_live_`) in production |
| `STRIPE_WEBHOOK_SECRET` | From the production webhook endpoint |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Use live key (`pk_live_`) in production |
| `STRIPE_PRO_PRICE_ID` | |
| `NEXT_PUBLIC_APP_URL` | Your Vercel domain |

### Update Clerk redirect URLs
In the Clerk dashboard → **Domains** → add your Vercel deployment URL (e.g. `https://audio-transcribe.vercel.app`).

### Update the Stripe webhook
Add a second webhook endpoint in Stripe for your production URL and update `STRIPE_WEBHOOK_SECRET` with the new signing secret.

### Vercel plan note
The app uses `maxDuration = 60` in the transcribe route. This works on the Hobby plan. Large files are chunked in the browser so each individual Whisper request finishes well within 60 seconds.

---

## How it all fits together

```
Browser
  │
  ├─ Clerk session cookie ──────────────────────────────► Clerk (auth)
  │
  ├─ Large file? ──► ffmpeg.wasm compresses + chunks in browser
  │
  ├─ POST /api/transcribe ──────────────────────────────► OpenAI Whisper
  │     checks Clerk userId
  │     checks Supabase subscription status
  │     enforces: 25 MB / 30 min (free) or 100 MB / unlimited (pro)
  │     returns { text, duration }
  │
  ├─ POST /api/history ────────────────────────────────► Supabase
  │     saves { filename, mode, language, text, duration_seconds }
  │     scoped to userId — each user sees only their own records
  │
  └─ Upgrade flow
       POST /api/stripe/checkout ──────────────────────► Stripe checkout page
       POST /api/stripe/webhook  ◄──────────────────── Stripe events
             sets subscriptions.status = 'pro' in Supabase
       POST /api/stripe/portal ────────────────────────► Stripe billing portal
             (cancel / change plan)
```

## Plan limits

| | Free | Pro ($12/mo) |
|---|---|---|
| Minutes / month | 30 min | Unlimited |
| Max file size | 25 MB | 100 MB |
| Auto-compression | — | ✓ (files > 20 MB) |
| Chunked long audio | — | ✓ |
| Transcription history | ✓ | ✓ |
| Translate to English | ✓ | ✓ |

## Pages

| Route | Description |
|---|---|
| `/` | Main transcription page |
| `/pricing` | Free vs Pro comparison + upgrade |
| `/account` | Delete account and all data |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |
