# Demo Script

A step-by-step walkthrough for demoing Audio Transcribe. Estimated time: 5–8 minutes.

---

## Setup (before the demo)

```bash
cd /Volumes/LaCie/audio-transcribe
npm run dev
# Open http://localhost:3000
```

Have ready:
- A short audio file (< 20 MB) — for the fast path demo
- The `Leeds Ln.m4a` file (54 MB) — to show auto-compression
- Optional: a non-English audio clip — to demo translation

---

## Act 1 — First impression (30 sec)

**Show:** The landing page.

**Say:**
> "This is a browser-based audio transcription tool. It converts any audio file to text using OpenAI's Whisper model — which is state-of-the-art for speech recognition. It supports 99 languages and handles heavy accents, background noise, and technical vocabulary well."

**Point out:**
- Dark, clean UI — no clutter
- Drag-and-drop zone is the focal point
- Two modes: Transcribe (keep language) vs. Translate (output English regardless of input language)

---

## Act 2 — Happy path: small file (1–2 min)

1. **Drag** a small audio file (< 20 MB) onto the drop zone.
   > "I'll drop an MP3 in. Notice the file info appears immediately — name and size."

2. **Leave mode on Transcribe.** Optionally type a language code.
   > "If I know the language, I can give Whisper a hint. This improves accuracy on ambiguous words. If I leave it blank, Whisper auto-detects."

3. **Click Transcribe.**
   > "Because the file is under 20 MB, it skips compression and goes straight to upload. Watch the upload progress bar…"

4. **Progress bar fills → switches to pulsing 'Transcribing' state.**
   > "Once the file is uploaded, we're waiting on OpenAI's Whisper to process it. For a short file, this is just a few seconds."

5. **Result appears.**
   > "Here's the transcription. I can copy it to clipboard or download it as a plain text file. Word count is shown up top — handy for long recordings."

---

## Act 3 — Large file + compression (2 min)

1. **Drop** the `Leeds Ln.m4a` file (54 MB).
   > "Now let's try a large file — 54 MB, which is way over Whisper's 25 MB limit. Watch what happens."

2. **Click Transcribe.**
   > "The app compresses the audio entirely in your browser using ffmpeg compiled to WebAssembly — no server involved. It converts to mono 16 kHz Opus, which is what Whisper uses internally anyway, at 24 kbps."

3. **Compression progress bar counts up.**
   > "First time you do this, it downloads the ffmpeg.wasm binary (~30 MB). After that it's cached. The progress bar shows exactly where we are."

4. **Compression completes — show size reduction.**
   > "54 MB down to maybe 5–6 MB. That's roughly a 10x reduction. Now it uploads — fast."

5. **Show the Cancel button.**
   > "At any point during compression or upload, you can cancel. This terminates the ffmpeg worker or aborts the HTTP request cleanly — no orphaned processes."

---

## Act 4 — Translation mode (1 min)

1. **Load a non-English audio file** (Spanish, Hindi, French, etc.)
2. **Switch mode to Translate.**
   > "Switch to Translate mode — the language hint field disappears because it's not needed. Whisper will detect the language and output English text directly."

3. **Transcribe and show the English output.**
   > "One API call, no intermediate step — Whisper handles the translation natively."

---

## Act 5 — History (30 sec)

1. **Scroll down** after a few transcriptions.
   > "Every transcription is saved locally in the browser — nothing goes to a server. You can see recent files here with timestamps. Click to expand the full text, or copy it again."

2. **Show the Clear all button.**
   > "Privacy-conscious: everything is in localStorage. Clear all removes it instantly."

---

## Act 6 — Error handling (optional, 30 sec)

1. **Try dragging a `.pdf` or `.txt` file.**
   > "The file type check runs on both the client and the server. The client rejects immediately; even if someone bypasses that and posts directly to the API, the server validates the extension too."

2. **Try dropping a huge file** (> 100 MB if you have one).
   > "Client-side guard: anything over 100 MB is rejected before we even start, with a clear message."

---

## Key talking points

| Feature | Why it matters |
|---|---|
| Browser-side compression | No 4.5 MB Vercel limit problem; files up to 100 MB work |
| ffmpeg.wasm singleton | Downloaded once (~30 MB), reused — no re-download on next file |
| XHR upload progress | Real progress, not a fake spinner |
| Granular stages | User always knows what's happening: compressing → uploading → transcribing |
| Cancel | Respects user time; clean teardown of WebWorker and HTTP |
| Safe error messages | OpenAI internal errors never leak to the UI |
| localStorage history | Useful, private, zero infrastructure |

---

## Common questions

**Q: Can it handle phone recordings with background noise?**
A: Yes — Whisper was trained on noisy real-world audio. It handles it remarkably well.

**Q: What languages does it support?**
A: 99 languages. Accuracy varies; English, Spanish, French, German, Japanese, Mandarin are excellent.

**Q: Is the audio sent to anyone other than OpenAI?**
A: No. The file goes: browser → your Next.js server → OpenAI API. Nothing is stored on the server.

**Q: What if I need this for multiple users / teams?**
A: Add auth (e.g. Clerk) and a database (e.g. Supabase) to store history per account. The API route is already stateless — it's the natural next step.
