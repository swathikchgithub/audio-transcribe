import { NextRequest, NextResponse } from 'next/server';
import { Agent } from 'https';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import { supabase } from '@/app/lib/supabase';
import { FREE_MAX_BYTES, FREE_MONTHLY_SECONDS } from '@/app/lib/stripe';

export const maxDuration = 60;
export const runtime = 'nodejs';

const ALLOWED_EXTENSIONS = new Set([
  'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac',
]);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  httpAgent: new Agent({ keepAlive: true }),
});

function safeErrorMessage(err: unknown): string {
  if (err instanceof OpenAI.APIConnectionError) {
    return 'Connection to the transcription service failed. Check your internet connection and try again.';
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return 'The transcription request timed out. Try a shorter file or try again shortly.';
  }
  if (err instanceof OpenAI.APIError) {
    switch (err.status) {
      case 400: return 'Invalid request — the file may be corrupted or in an unsupported format.';
      case 401: return 'API authentication failed. Check the server configuration.';
      case 413: return 'File is too large for the transcription service (max 25 MB).';
      case 429: return 'Rate limit reached. Please wait a moment and try again.';
      case 500:
      case 503: return 'The transcription service is temporarily unavailable. Try again shortly.';
    }
  }
  return 'Transcription failed. Please try again.';
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Server is not configured for transcription.' }, { status: 500 });
  }

  // Auth required — guests cannot transcribe
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to start transcribing.', signIn: true }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  const mode = (formData.get('mode') as string) || 'transcribe';
  const language = formData.get('language') as string | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  // Buffer the file bytes immediately — the OpenAI SDK reads the File as a stream,
  // so if we need to retry the request the stream would already be consumed.
  const fileBytes = await file.arrayBuffer();
  const bufferedFile = new File([fileBytes], file.name, { type: file.type || 'application/octet-stream' });
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type ".${ext}". Accepted: ${[...ALLOWED_EXTENSIONS].join(', ')}.` },
      { status: 400 },
    );
  }

  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — exceeds the 25 MB Whisper limit.` },
      { status: 400 },
    );
  }

  // Check subscription plan and enforce limits
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();

  const isPro = sub?.status === 'pro';

  if (!isPro) {
    // Free plan: 25 MB file size cap
    if (file.size > FREE_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `Free plan supports files up to 25 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
          upgrade: true,
        },
        { status: 402 },
      );
    }

    // Free plan: 30 min/month cap
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: rows } = await supabase
      .from('transcriptions')
      .select('duration_seconds')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString());

    const usedSeconds = (rows ?? []).reduce((s, r) => s + (r.duration_seconds ?? 0), 0);

    if (usedSeconds >= FREE_MONTHLY_SECONDS) {
      const usedMin = Math.floor(usedSeconds / 60);
      return NextResponse.json(
        {
          error: `You've used ${usedMin} of your 30 free minutes this month. Upgrade to Pro for unlimited transcription.`,
          upgrade: true,
        },
        { status: 402 },
      );
    }
  }

  try {
    if (mode === 'translate') {
      const result = await openai.audio.translations.create({
        file: bufferedFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
      }) as { text: string; duration?: number };
      return NextResponse.json({ text: result.text, duration: result.duration ?? 0 });
    }

    try {
      const result = await openai.audio.transcriptions.create({
        file: bufferedFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        ...(language ? { language } : {}),
      });

      // Reconstruct from segments — in some cases (especially non-Latin scripts)
      // result.text can be shorter than what the segments contain.
      const segments = result.segments;
      const text = segments && segments.length > 0
        ? segments.map((s) => s.text).join('').trim()
        : result.text;

      return NextResponse.json({ text, duration: result.duration ?? 0 });
    } catch (err) {
      // If a language hint was specified and OpenAI returned 400, the hint itself
      // is likely the cause. Retry without it so the user still gets a result.
      if (language && err instanceof OpenAI.APIError && err.status === 400) {
        console.warn(`Transcribe: language='${language}' caused 400 — retrying with auto-detect`);
        const fallback = await openai.audio.transcriptions.create({
          file: bufferedFile,
          model: 'whisper-1',
          response_format: 'verbose_json',
        });
        return NextResponse.json({
          text: fallback.text,
          duration: fallback.duration ?? 0,
          languageFallback: true,
        });
      }
      throw err;
    }
  } catch (err) {
    console.error('Transcribe API error:', {
      language,
      ...(err instanceof OpenAI.APIError ? { status: err.status, message: err.message } : {}),
    });
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}
