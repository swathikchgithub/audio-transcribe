# Audio Transcribe

A web app that converts audio to text, translates speech to English, and compresses audio and image files — all powered by OpenAI Whisper and processed securely in the browser or on the server.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

| Mode | What it does |
|---|---|
| **Transcribe** | Speech to text in the original language |
| **Translate** | Speech in any language → English text |
| **Compress** | Reduce audio or image file size (browser-only, no sign-in needed) |

- **57 supported languages** selectable as a hint; all others auto-detected
- **Large file handling** — files over 20 MB or longer than 5 minutes are split into 4-minute chunks via ffmpeg.wasm in the browser before upload, ensuring complete transcription
- **Free plan** — 30 minutes/month, files up to 25 MB
- **Pro plan** — unlimited transcription, files up to 100 MB
- **Auth** — sign in with Google or GitHub via Clerk
- **History** — last 10 transcriptions saved per account (Supabase)
- **Billing** — Stripe checkout and customer portal

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Auth | Clerk |
| Database | Supabase (Postgres) |
| Payments | Stripe |
| Transcription | OpenAI Whisper (`whisper-1`) |
| Compression | ffmpeg.wasm — runs entirely in the browser |

---

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` — see [SETUP.md](./SETUP.md) for step-by-step instructions on getting each key.

```env
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run the database migration

Open **Supabase → SQL Editor** and run the migration in [SETUP.md](./SETUP.md#2-supabase).

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) → import the repo.
3. Add all environment variables from `.env.local` under **Settings → Environment Variables**.
4. For `NEXT_PUBLIC_APP_URL`, use your Vercel deployment URL.
5. Click **Deploy**.

> The transcribe route uses `maxDuration = 60`, which works on the Vercel Hobby plan.

---

## Plan limits

| | Free | Pro ($12/mo) |
|---|---|---|
| Minutes / month | 30 min | Unlimited |
| Max file size | 25 MB | 100 MB |
| Browser compression & chunking | — | ✓ |
| Transcription history | ✓ | ✓ |
| Translate to English | ✓ | ✓ |

---

## Project structure

```
app/
├── page.tsx                  # Main page — Transcribe / Translate / Compress modes
├── compress/page.tsx         # Standalone compress page
├── account/page.tsx          # Account & billing management
├── pricing/page.tsx          # Free vs Pro comparison
├── api/
│   ├── transcribe/route.ts   # Whisper transcription endpoint
│   ├── history/route.ts      # Transcription history (Supabase)
│   ├── subscription/route.ts # Plan status
│   ├── account/route.ts      # Account deletion
│   └── stripe/               # Checkout, portal, webhook
└── lib/
    ├── compress.ts           # ffmpeg.wasm compression utilities
    ├── languages.ts          # Whisper API-supported language list
    ├── stripe.ts             # Stripe singleton + constants
    └── supabase.ts           # Supabase service-role client
```

---

## License

[MIT](./LICENSE)
