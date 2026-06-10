# Code Walkthrough

A complete guide to how Audio Transcribe works — architecture, data flow, and every file.

---

## Architecture Overview

```
Browser                              Server (Next.js)           External
──────────────────────────────────   ─────────────────────────  ────────────
page.tsx (React UI)
  │
  ├─ file > 20 MB?
  │     └─ lib/compress.ts ──────── ffmpeg.wasm (in-browser)
  │           compresses to WebM
  │
  ├─ XHR POST /api/transcribe ────► route.ts
  │   (FormData: file, mode, lang)   │ validates size + ext
  │                                  └─► OpenAI Whisper API ──► text
  │◄────────────────────────────────── { text }
  │
  ├─ renders result
  └─ lib/history.ts (localStorage)
```

**Key design decisions:**
- Compression runs entirely in the browser (WebAssembly) — no server round-trip for large files
- The API route is stateless — each request is independent
- History is per-browser (localStorage) — no database, no auth required

---

## File-by-file

### `app/page.tsx` — The UI

Single React component (~280 lines). Manages all UI state.

**State:**
| Variable | Purpose |
|---|---|
| `file` | Selected File object |
| `mode` | `'transcribe'` or `'translate'` |
| `language` | Optional ISO-639-1 hint (e.g. `"en"`, `"hi"`) |
| `stage` | `'idle' \| 'compressing' \| 'uploading' \| 'transcribing'` |
| `compressProgress` | 0–1 ratio for ffmpeg compression |
| `uploadProgress` | 0–1 ratio for XHR upload |
| `result` | The final transcription text |
| `history` | Array of past `HistoryItem` objects from localStorage |

**Submit flow:**
1. If file > 20 MB → `compressAudio()` → shows compression progress bar
2. `uploadForTranscription()` via XHR → shows upload progress bar
3. Once upload completes → XHR is still open waiting for OpenAI → stage switches to `'transcribing'`
4. Response arrives → saves to localStorage history, renders result

**Cancel flow:**
- During compression: calls `cancelCompression()` which terminates the ffmpeg WebWorker
- During upload/transcribing: fires `AbortController.abort()` which calls `xhr.abort()`

**History:**
- Loaded from localStorage on mount via dynamic import
- Refreshed after every successful transcription
- Items expand on click to show full text

---

### `app/lib/compress.ts` — Browser-side Audio Compression

Uses `@ffmpeg/ffmpeg` (WebAssembly, single-threaded) to compress audio before upload.

**Why compress?**
- Whisper API hard limit: 25 MB
- Vercel Hobby request body limit: 4.5 MB (compressed audio easily fits)
- Target format: mono 16 kHz Opus @ 24 kbps → ~10 MB/hour of speech
- Whisper internally resamples to 16 kHz anyway, so quality loss is negligible

**Singleton pattern:**
```
ffmpegInstance (module-level) ──── reused across compressions (load once, ~30 MB)
```
The ffmpeg.wasm binary is downloaded once and cached in the browser.

**Progress scoping:**
Each `compressAudio()` call registers its own `handler` via `ffmpeg.on('progress', handler)` and removes it in `finally` via `ffmpeg.off('progress', handler)`. This avoids shared mutable state between concurrent calls.

**`cancelCompression()`:**
Calls `ffmpeg.terminate()` (kills the WebWorker) and sets `ffmpegInstance = null` so the next call reloads cleanly.

**ffmpeg flags:**
```
-vn           strip video stream (some M4A/MP4 files have a cover art video track)
-ac 1         mono (stereo is wasteful for speech)
-ar 16000     16 kHz sample rate (Whisper's native rate)
-c:a libopus  Opus codec (best speech quality per bit)
-b:a 24k      24 kbps (sufficient for intelligible speech)
-application voip  tells Opus to optimize for speech
```

---

### `app/lib/history.ts` — Session History

Stores up to 10 transcriptions in `localStorage` under the key `audio-transcribe-history`.

```typescript
type HistoryItem = {
  id: string;          // crypto.randomUUID()
  filename: string;    // original file name
  mode: 'transcribe' | 'translate';
  language?: string;   // ISO-639-1 code if set
  text: string;        // full transcription text
  timestamp: number;   // Date.now()
}
```

All functions guard against SSR (`typeof window === 'undefined'`).

**Per-user separation:** History is per-browser since it uses localStorage. Different browsers/devices see different histories. For true multi-user separation (e.g. shared devices), you'd need auth + a database — see the "Extending" section below.

---

### `app/api/transcribe/route.ts` — API Route

Next.js App Router route handler. Stateless — processes one transcription per request.

**Validation (server-side safety net):**
1. `OPENAI_API_KEY` present
2. File is a `File` instance (not missing/malformed FormData)
3. File extension is in the allowed set
4. File size ≤ 25 MB (Whisper's limit)

**Error handling:**
OpenAI errors are mapped to safe user-facing messages by HTTP status. Raw `err.message` is never sent to the client (it can contain request IDs, internal paths, or key fragments).

**`maxDuration = 60`:**
Vercel serverless timeout. Long audio files near 25 MB can take 30–50 s to transcribe. Increase this on Vercel Pro if needed.

---

### `uploadForTranscription()` — XHR Upload Helper (in `page.tsx`)

Uses `XMLHttpRequest` instead of `fetch` because the Fetch API doesn't expose upload progress.

**Stages it drives:**
1. `xhr.upload.progress` fires → calls `onUploadProgress(ratio)` → stage stays `'uploading'`
2. Upload reaches 100% → calls `onTranscribing()` → stage switches to `'transcribing'`
3. `xhr.load` fires (response arrives) → resolves/rejects the Promise

**Cancellation:**
The `AbortSignal` listener calls `xhr.abort()` and rejects with an `AbortError`, which the caller checks for before showing an error to the user.

---

## Data Flow Diagram

```
User selects file
      │
      ▼
size > 20 MB? ──yes──► compressAudio()
      │                   ffmpeg.wasm → mono 16 kHz Opus WebM
      │◄──────────────────
      ▼
uploadForTranscription(formData, signal, onProgress, onTranscribing)
      │
      ├─ XHR upload progress (0→100%) ──► setUploadProgress
      ├─ upload complete ───────────────► setStage('transcribing')
      │
      ▼
POST /api/transcribe
      │  validates ext + size
      └─► openai.audio.transcriptions.create({ file, model: 'whisper-1' })
              │
              ▼
         { text: "..." }
              │
      ◄───────┘
      │
      ├─ setResult(text)
      └─ saveToHistory({ filename, mode, language, text, timestamp })
```

---

## Extending the App

### True multi-user history

Currently localStorage → per-browser only. To support per-account history:

1. Add auth: [Clerk](https://clerk.com) or [NextAuth](https://next-auth.js.org)
2. Add a database: Vercel Postgres / Supabase / PlanetScale
3. Replace `history.ts` with API routes (`GET /api/history`, `POST /api/history`)
4. Store `userId` from the auth session alongside each record

### Longer files (>25 MB post-compression)

Compression reduces audio to ~10 MB/hour, so a 2.5-hour file could still exceed 25 MB.
Options:
- Split the file into chunks client-side (ffmpeg can do this) and transcribe in parallel
- Use [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) for direct client upload, pass the URL to the API route

### Streaming transcription

For real-time feedback as Whisper processes, you'd need WebSockets or SSE — Whisper itself doesn't stream, so this would require chunking the audio and streaming chunk results.
