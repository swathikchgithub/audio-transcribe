# Audio Transcribe

Next.js app that converts audio files to text using OpenAI Whisper.
Supports two modes:

- **Transcribe** — keep original language
- **Translate** — translate any language audio into English text

## Local setup

```bash
npm install
cp .env.example .env.local
# add your OpenAI API key to .env.local
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

### Option A: Vercel CLI

```bash
npm i -g vercel
vercel              # first deploy (links + creates project)
vercel env add OPENAI_API_KEY   # paste your key, choose Production / Preview / Dev
vercel --prod
```

### Option B: Git + Vercel dashboard

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) → Import the repo.
3. In **Environment Variables**, add `OPENAI_API_KEY = sk-...`.
4. Click **Deploy**.

## File size limits

- Whisper API caps each file at **25 MB**.
- Vercel serverless function request body is **4.5 MB on Hobby** and **larger on Pro**.
  If you need files between 4.5 MB and 25 MB on Hobby, the cleanest fix is to upload directly
  to [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) from the client and pass the URL
  to the API route instead of streaming the file through.

## Tech

- Next.js 15 (App Router) · TypeScript · Tailwind
- OpenAI Node SDK (`openai.audio.transcriptions` / `openai.audio.translations`)
- Single API route at `app/api/transcribe/route.ts`
