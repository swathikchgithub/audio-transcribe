'use client';

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { useUser, SignInButton, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import type { HistoryItem } from './lib/history';
import { IMAGE_EXTS, IMAGE_QUALITY, type AudioQuality } from './lib/compress';
import { WHISPER_LANGUAGES } from './lib/languages';

const ACCEPTED_AUDIO = '.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.ogg,.flac';
const ACCEPTED_COMPRESS = 'audio/*,image/jpeg,image/png,image/webp,image/gif';
const AUDIO_EXTS = new Set(['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac']);
const MAX_FILE_SIZE = 100 * 1024 * 1024;       // Pro limit
const FREE_MAX_FILE_SIZE = 25 * 1024 * 1024;   // Free limit
const COMPRESS_THRESHOLD = 20 * 1024 * 1024;   // files above this get compress+split (size-based)
const DURATION_SPLIT_THRESHOLD = 5 * 60;        // files longer than 5 min get split too (avoids partial Whisper results)

const QUALITY_LABELS: Record<AudioQuality, string> = {
  small:    'Small',
  balanced: 'Balanced',
  high:     'High Quality',
};

type SubscriptionInfo = {
  status: 'free' | 'pro';
  usedSeconds: number;
  limitSeconds: number | null;
};

type Mode = 'transcribe' | 'translate' | 'compress';
type Stage = 'idle' | 'compressing' | 'uploading' | 'transcribing';

const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `~${(bytes / 1024).toFixed(0)} KB` : `~${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Bitrates (bps) for each audio quality preset
const AUDIO_BITRATES: Record<AudioQuality, number> = { small: 48_000, balanced: 96_000, high: 192_000 };

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    audio.src = url;
  });
}

async function computeSizeEstimates(
  file: File,
  category: 'audio' | 'image',
): Promise<Record<AudioQuality, number>> {
  if (category === 'image') {
    // Load image once into a canvas, then encode at each quality and measure the blob size.
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        const result: Partial<Record<AudioQuality, number>> = {};
        let done = 0;
        const qualities: AudioQuality[] = ['small', 'balanced', 'high'];
        for (const q of qualities) {
          canvas.toBlob((blob) => {
            result[q] = blob?.size ?? 0;
            if (++done === qualities.length) resolve(result as Record<AudioQuality, number>);
          }, 'image/jpeg', IMAGE_QUALITY[q]);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
      img.src = url;
    });
  }

  // Audio: duration × target bitrate gives a close estimate for CBR MP3.
  const duration = await getAudioDuration(file);
  if (!duration) return { small: 0, balanced: 0, high: 0 };
  return {
    small:    Math.ceil(AUDIO_BITRATES.small    / 8 * duration),
    balanced: Math.ceil(AUDIO_BITRATES.balanced / 8 * duration),
    high:     Math.ceil(AUDIO_BITRATES.high     / 8 * duration),
  };
}
const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

type TranscribeResult = { text: string; duration: number; languageFallback?: boolean };

function uploadForTranscription(
  formData: FormData,
  signal: AbortSignal,
  onUploadProgress: (ratio: number) => void,
  onTranscribing: () => void,
): Promise<TranscribeResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/transcribe');

    let notifiedTranscribing = false;
    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const ratio = e.loaded / e.total;
      onUploadProgress(ratio);
      if (ratio >= 1 && !notifiedTranscribing) {
        notifiedTranscribing = true;
        onTranscribing();
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ text: data.text ?? '', duration: data.duration ?? 0, languageFallback: !!data.languageFallback });
        } else {
          const err = Object.assign(
            new Error(data.error ?? `Request failed (${xhr.status})`),
            { upgrade: !!data.upgrade, signIn: !!data.signIn },
          );
          reject(err);
        }
      } catch {
        reject(new Error('Failed to parse server response.'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));

    signal.addEventListener('abort', () => {
      xhr.abort();
      const err = new Error('Cancelled');
      err.name = 'AbortError';
      reject(err);
    });

    xhr.send(formData);
  });
}

export default function Home() {
  const { isLoaded, isSignedIn } = useUser();

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('transcribe');
  const [language, setLanguage] = useState('');
  const [quality, setQuality] = useState<AudioQuality>('balanced');
  const [stage, setStage] = useState<Stage>('idle');
  const [compressProgress, setCompressProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [compressChunk, setCompressChunk] = useState(0);
  const [chunkInfo, setChunkInfo] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [wrongFileType, setWrongFileType] = useState(false);
  const [upgradedBanner, setUpgradedBanner] = useState(false);
  const [sizeEstimates, setSizeEstimates] = useState<Record<AudioQuality, number> | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [languageFallbackNotice, setLanguageFallbackNotice] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loading = stage !== 'idle';

  // Load history + subscription when auth state settles
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setHistory([]); setSubscription(null); return; }
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setHistory(data))
      .catch(console.error);
    fetch('/api/subscription')
      .then((r) => r.json())
      .then(setSubscription)
      .catch(console.error);
  }, [isLoaded, isSignedIn]);

  // Compute estimated output sizes for each quality preset when in compress mode
  useEffect(() => {
    if (mode !== 'compress' || !file) { setSizeEstimates(null); return; }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const category = IMAGE_EXTS.has(ext) ? 'image' : AUDIO_EXTS.has(ext) ? 'audio' : null;
    if (!category) { setSizeEstimates(null); return; }

    let cancelled = false;
    setEstimating(true);
    setSizeEstimates(null);
    computeSizeEstimates(file, category)
      .then((estimates) => { if (!cancelled) setSizeEstimates(estimates); })
      .catch(() => { /* estimation failure is non-fatal */ })
      .finally(() => { if (!cancelled) setEstimating(false); });
    return () => { cancelled = true; };
  }, [file, mode]);

  // Clear file if it's incompatible with the newly selected mode
  useEffect(() => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (mode !== 'compress' && !AUDIO_EXTS.has(ext)) {
      setFile(null);
      setError('');
      setResult('');
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [mode]);

  // Detect return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('upgraded')) {
      setUpgradedBanner(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const refreshHistory = () =>
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setHistory(data))
      .catch(console.error);

  const handleFile = (selected: File | null) => {
    setError('');
    setResult('');
    setCompressedSize(null);
    setNeedsUpgrade(false);
    setWrongFileType(false);
    if (!selected) return;

    const ext = selected.name.split('.').pop()?.toLowerCase() ?? '';
    const isAudio = AUDIO_EXTS.has(ext);
    const isImage = IMAGE_EXTS.has(ext);

    if (mode === 'compress') {
      if (!isAudio && !isImage) {
        setError(`".${ext}" files are not supported. Drop an audio or image file.`);
        return;
      }
    } else {
      if (!isAudio) {
        setError(`"${selected.name}" is not a supported audio file. To compress images, switch to Compress mode.`);
        setWrongFileType(true);
        return;
      }
    }

    if (mode === 'compress') {
      setFile(selected);
      return;
    }

    const isPro = subscription?.status === 'pro';
    const maxSize = isPro ? MAX_FILE_SIZE : FREE_MAX_FILE_SIZE;

    if (selected.size > maxSize) {
      if (!isPro) {
        setError(`Free plan supports files up to ${formatMB(FREE_MAX_FILE_SIZE)}. Your file is ${formatMB(selected.size)}.`);
        setNeedsUpgrade(true);
      } else {
        setError(`File too large (${formatMB(selected.size)}). Max is ${formatMB(MAX_FILE_SIZE)}.`);
      }
      return;
    }
    setFile(selected);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  };

  const cancel = async () => {
    if (stage === 'compressing') {
      const { cancelCompression } = await import('./lib/compress');
      cancelCompression();
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setStage('idle');
    setCompressProgress(0);
    setCompressChunk(0);
    setUploadProgress(0);
    setChunkInfo(null);
  };

  const handleCompress = async () => {
    if (!file) return;
    setError('');
    setResult('');
    setCompressedSize(null);
    setCompressChunk(0);
    setNeedsUpgrade(false);
    setStage('compressing');
    setCompressProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let compressed: File;
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

      if (IMAGE_EXTS.has(ext)) {
        setCompressProgress(0.5);
        const { compressImageForDownload } = await import('./lib/compress');
        compressed = await compressImageForDownload(file, IMAGE_QUALITY[quality]);
        setCompressProgress(1);
      } else {
        const { compressAudioForDownload } = await import('./lib/compress');
        compressed = await compressAudioForDownload(file, quality, setCompressProgress);
      }

      if (compressed.size >= file.size) {
        setError('The file is already well-compressed — no reduction was possible. Try a lower quality preset.');
        return;
      }

      const url = URL.createObjectURL(compressed);
      const a = document.createElement('a');
      a.href = url;
      a.download = compressed.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Compression failed.');
    } finally {
      setStage('idle');
      setCompressProgress(0);
      setCompressChunk(0);
      abortRef.current = null;
    }
  };

  const submit = async () => {
    if (!file) return;
    if (mode === 'compress') { await handleCompress(); return; }
    if (!isSignedIn) return; // server enforces this too, but fail fast
    setError('');
    setResult('');
    setCompressedSize(null);
    setCompressChunk(0);
    setChunkInfo(null);
    setNeedsUpgrade(false);
    setLanguageFallbackNotice(false);

    const controller = new AbortController();
    abortRef.current = controller;

    let filesToTranscribe: File[];

    // Split if the file is large OR if the audio is long — Whisper returns partial
    // results for long single-chunk audio, especially for non-Latin-script languages.
    let needsSplit = file.size > COMPRESS_THRESHOLD;
    if (!needsSplit) {
      const audioDuration = await getAudioDuration(file);
      if (audioDuration > DURATION_SPLIT_THRESHOLD) needsSplit = true;
    }

    if (needsSplit) {
      // Compress + split into 4-minute chunks in one ffmpeg pass.
      // Each chunk is freshly encoded so it's a valid independent WebM file
      // that Whisper can parse — stream-copy produces malformed output at
      // arbitrary seek points in WebM containers.
      setStage('compressing');
      setCompressProgress(0);
      try {
        const { compressAndSplit } = await import('./lib/compress');
        const readyChunks: File[] = [];
        const chunks = await compressAndSplit(
          file,
          undefined,
          (index, chunk) => {
            readyChunks.push(chunk);
            setCompressedSize(readyChunks.reduce((s, c) => s + c.size, 0));
          },
          (chunkIndex, ratio) => {
            setCompressChunk(chunkIndex + 1);
            setCompressProgress(ratio);
          },
        );
        if (chunks.length === 0) {
          setStage('idle');
          setError('Could not prepare audio for transcription. Try a different file format.');
          return;
        }
        filesToTranscribe = chunks;
        if (chunks.length > 1) setChunkInfo({ current: 0, total: chunks.length });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setStage('idle');
        setError(err instanceof Error ? `Compression failed: ${err.message}` : 'Compression failed.');
        return;
      }
    } else {
      filesToTranscribe = [file];
    }

    const transcribeOne = async (f: File): Promise<TranscribeResult> => {
      setStage('uploading');
      setUploadProgress(0);
      const fd = new FormData();
      fd.append('file', f);
      fd.append('mode', mode);
      if (mode === 'transcribe' && language) fd.append('language', language);
      return uploadForTranscription(fd, controller.signal, setUploadProgress, () => setStage('transcribing'));
    };

    try {
      const parts: string[] = [];
      let totalDuration = 0;
      for (let i = 0; i < filesToTranscribe.length; i++) {
        if (filesToTranscribe.length > 1) setChunkInfo({ current: i + 1, total: filesToTranscribe.length });
        const { text: t, duration, languageFallback } = await transcribeOne(filesToTranscribe[i]);
        parts.push(t);
        totalDuration += duration;
        if (languageFallback) setLanguageFallbackNotice(true);
      }
      const text = parts.join('\n\n');
      setResult(text);
      setChunkInfo(null);

      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mode,
          language: mode === 'transcribe' && language ? language : null,
          text,
          duration_seconds: Math.round(totalDuration),
        }),
      });
      refreshHistory();
      // Refresh usage counter after saving
      fetch('/api/subscription').then((r) => r.json()).then(setSubscription).catch(console.error);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      if ((err as any).upgrade) setNeedsUpgrade(true);
    } finally {
      setStage('idle');
      setChunkInfo(null);
      abortRef.current = null;
    }
  };

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const download = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.[^.]+$/, '') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onClearHistory = async () => {
    await fetch('/api/history', { method: 'DELETE' });
    setHistory([]);
  };

  const reset = () => {
    setFile(null);
    setResult('');
    setError('');
    setCompressedSize(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const buttonLabel = () => {
    if (stage === 'compressing') return `Compressing… ${Math.round(compressProgress * 100)}%`;
    if (stage === 'uploading') {
      if (chunkInfo) return `Uploading chunk ${chunkInfo.current} of ${chunkInfo.total}…`;
      return `Uploading… ${Math.round(uploadProgress * 100)}%`;
    }
    if (stage === 'transcribing') {
      if (chunkInfo) {
        const verb = mode === 'translate' ? 'Translating' : 'Transcribing';
        return `${verb} chunk ${chunkInfo.current} of ${chunkInfo.total}…`;
      }
      return mode === 'translate' ? 'Translating…' : 'Transcribing…';
    }
    if (mode === 'compress') return 'Compress & Download';
    return mode === 'translate' ? 'Translate to English' : 'Transcribe';
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="max-w-2xl mx-auto px-6 py-16">

        {/* Header */}
        <header className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent mb-2">
              Audio Transcribe
            </h1>
            <p className="text-zinc-500 text-sm">
              Convert speech to text in any language.{' '}
              <span className="text-zinc-600">Powered by OpenAI Whisper.</span>
            </p>
          </div>
          <div className="flex-shrink-0 mt-1 flex items-center gap-3">
            <Link
              href="/compress"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Compress
            </Link>
            {isLoaded && (
              isSignedIn ? (
                <>
                  <Link
                    href="/account"
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    Account
                  </Link>
                  <UserButton appearance={{ elements: { avatarBox: 'w-9 h-9' } }} />
                </>
              ) : (
                <SignInButton mode="modal">
                  <button className="text-sm px-4 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all duration-200">
                    Sign in
                  </button>
                </SignInButton>
              )
            )}
          </div>
        </header>

        {/* Usage bar — free users only */}
        {subscription?.status === 'free' && (
          <div className="mb-8 flex items-center justify-between gap-4 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs text-zinc-500 whitespace-nowrap">
                {Math.floor(subscription.usedSeconds / 60)} / 30 min used
              </span>
              <div className="h-1 w-28 bg-zinc-800 rounded-full overflow-hidden flex-shrink-0">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    subscription.usedSeconds / (subscription.limitSeconds ?? 1800) > 0.8
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-violet-500 to-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, (subscription.usedSeconds / (subscription.limitSeconds ?? 1800)) * 100)}%` }}
                />
              </div>
            </div>
            <Link
              href="/pricing"
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap flex-shrink-0"
            >
              Upgrade to Pro →
            </Link>
          </div>
        )}

        {/* Upgrade success banner */}
        {upgradedBanner && (
          <div className="mb-8 flex items-center justify-between gap-4 p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-sm">
            <span>You&apos;re now on Pro — unlimited transcription, files up to 100 MB.</span>
            <button
              onClick={() => setUpgradedBanner(false)}
              aria-label="Dismiss"
              className="text-emerald-600 hover:text-emerald-400 transition-colors flex-shrink-0 text-lg leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* How to use */}
        <div className="mb-8">
          <button
            onClick={() => setShowGuide((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>How to use</span>
            <svg className={`w-3 h-3 transition-transform duration-200 ${showGuide ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showGuide && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/20">
                <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest mb-2">Transcribe</p>
                <ul className="space-y-1.5 text-xs text-zinc-500 leading-relaxed">
                  <li>Converts speech to text in the <span className="text-zinc-400">original language</span></li>
                  <li>Select the language your audio is in for better accuracy — especially helpful for short clips or accented speech</li>
                  <li>Leave language on <span className="text-zinc-400">Auto-detect</span> if unsure</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/20">
                <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest mb-2">Translate</p>
                <ul className="space-y-1.5 text-xs text-zinc-500 leading-relaxed">
                  <li>Converts speech in <span className="text-zinc-400">any language</span> to English text</li>
                  <li>No language selection needed — Whisper detects it automatically</li>
                  <li>Useful when you need an English summary of foreign-language audio</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/20">
                <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest mb-2">Compress</p>
                <ul className="space-y-1.5 text-xs text-zinc-500 leading-relaxed">
                  <li>Reduces file size for <span className="text-zinc-400">audio and images</span> (JPG, PNG, WebP, GIF)</li>
                  <li>Runs entirely in your browser — nothing is uploaded</li>
                  <li>No sign-in required · pick Small / Balanced / High Quality</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => !loading && inputRef.current?.click()}
          className={[
            'relative rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300',
            loading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            isDragging
              ? 'border-violet-500 bg-violet-500/5 shadow-[0_0_60px_rgba(139,92,246,0.15)]'
              : file
                ? 'border-zinc-700/60 bg-zinc-900/40 hover:border-zinc-600'
                : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/20 hover:bg-zinc-900/30',
          ].join(' ')}
        >
          <input
            ref={inputRef}
            type="file"
            accept={mode === 'compress' ? ACCEPTED_COMPRESS : ACCEPTED_AUDIO}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />

          {file ? (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-zinc-100 truncate">{file.name}</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {formatMB(file.size)}
                  {compressedSize !== null && mode === 'compress' && (
                    <span className="text-emerald-400 ml-2">→ {formatMB(compressedSize)} after compression</span>
                  )}
                </p>
              </div>
              {!loading && (
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="text-xs text-zinc-600 hover:text-zinc-400 underline underline-offset-2 transition-colors"
                >
                  Choose a different file
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/60 border border-zinc-700/40 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-zinc-300">Drop an audio file here</p>
                <p className="text-sm text-zinc-600 mt-1">or click to browse</p>
              </div>
              <p className="text-xs text-zinc-700">
                {mode === 'compress'
                  ? 'Audio (MP3, M4A, WAV…) · Images (JPG, PNG, WebP, GIF)'
                  : 'MP3 · M4A · WAV · WebM · OGG · FLAC · up to 100 MB'}
              </p>
            </div>
          )}
        </div>

        {/* Progress bars */}
        {stage === 'compressing' && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>
                Compressing in browser
                {compressChunk > 0 && ` · part ${compressChunk}`}
              </span>
              <span>{Math.round(compressProgress * 100)}%</span>
            </div>
            <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(compressProgress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-zinc-700">First run downloads ffmpeg.wasm (~30 MB) — cached after that.</p>
          </div>
        )}

        {stage === 'uploading' && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Uploading</span>
              <span>{Math.round(uploadProgress * 100)}%</span>
            </div>
            <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(uploadProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {stage === 'transcribing' && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                <span>{mode === 'translate' ? 'Translating with Whisper' : 'Transcribing with Whisper'}</span>
              </div>
              {chunkInfo && (
                <span className="tabular-nums">{chunkInfo.current} / {chunkInfo.total}</span>
              )}
            </div>
            <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
              {chunkInfo ? (
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${(chunkInfo.current / chunkInfo.total) * 100}%` }}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-r from-violet-500/40 via-indigo-500 to-violet-500/40 rounded-full animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* Mode + Options */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-2">Mode</label>
            <div className="flex bg-zinc-900/80 rounded-xl p-1 border border-zinc-800">
              {(['transcribe', 'translate', 'compress'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={loading}
                  className={[
                    'flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-40',
                    mode === m
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                >
                  {m === 'transcribe' ? 'Transcribe' : m === 'translate' ? 'Translate' : 'Compress'}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-700 mt-2">
              {mode === 'transcribe' && 'Keeps the original language.'}
              {mode === 'translate' && 'Translates any language into English.'}
              {mode === 'compress' && 'Reduces file size · Audio & images · No upload.'}
            </p>
          </div>

          {mode === 'transcribe' && (
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-2">
                Language
              </label>
              <div className="relative">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={loading}
                  className="w-full appearance-none bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2.5 pr-8 text-sm text-zinc-100 focus:outline-none focus:border-violet-700 focus:ring-1 focus:ring-violet-700/50 transition-all disabled:opacity-40"
                >
                  <option value="">Auto-detect (recommended)</option>
                  {WHISPER_LANGUAGES.map(({ code, name }) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-zinc-700 mt-2">
                Optional. For languages not listed (Telugu, Malayalam, Bengali…) leave on Auto-detect — Whisper identifies them automatically.
              </p>
            </div>
          )}

          {mode === 'compress' && (
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-2">Quality</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(QUALITY_LABELS) as AudioQuality[]).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    disabled={loading}
                    className={[
                      'py-2.5 px-2 rounded-lg border text-xs font-medium transition-all duration-200 disabled:opacity-40 text-center',
                      quality === q
                        ? 'border-violet-600/60 bg-violet-950/30 text-violet-300'
                        : 'border-zinc-800 bg-zinc-900/20 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
                    ].join(' ')}
                  >
                    <span className="block">{QUALITY_LABELS[q]}</span>
                    <span className={`block mt-0.5 tabular-nums ${quality === q ? 'text-violet-400/70' : 'text-zinc-700'}`}>
                      {estimating ? '…' : sizeEstimates?.[q] ? formatSize(sizeEstimates[q]) : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Submit + Cancel */}
        <div className="mt-6 flex gap-3">
          {isLoaded && !isSignedIn && mode !== 'compress' ? (
            <SignInButton mode="modal">
              <button className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-sm">
                Sign in to transcribe
              </button>
            </SignInButton>
          ) : (
          <button
            onClick={submit}
            disabled={!file || loading}
            className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-sm disabled:shadow-none"
          >
            {buttonLabel()}
          </button>
          )}
          {loading && (
            <button
              onClick={cancel}
              className="px-5 py-3 rounded-xl border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700 transition-all duration-200 text-sm font-medium"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-5 p-4 rounded-xl border border-red-900/40 bg-red-950/20 text-red-300 text-sm leading-relaxed">
            {error}
            {needsUpgrade && (
              <Link
                href="/pricing"
                className="block mt-2 text-violet-400 hover:text-violet-300 transition-colors"
              >
                View Pro plan →
              </Link>
            )}
            {wrongFileType && (
              <Link
                href="/compress"
                className="block mt-2 text-violet-400 hover:text-violet-300 transition-colors"
              >
                Go to Compress tool →
              </Link>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 uppercase tracking-widest">Result</span>
                <span className="text-xs text-zinc-700 tabular-nums">
                  {wordCount(result).toLocaleString()} words
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copy(result, 'result')}
                  className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all duration-150"
                >
                  {copied === 'result' ? '✓ Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => download(result, file?.name ?? 'transcript')}
                  className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all duration-150"
                >
                  Download .txt
                </button>
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 whitespace-pre-wrap text-zinc-200 leading-relaxed text-sm font-mono">
              {result}
            </div>

            {languageFallbackNotice && (
              <p className="text-xs text-amber-500/80 mt-2">
                The selected language hint couldn&apos;t be applied — auto-detect was used instead.
              </p>
            )}

            {/* Sign-in nudge for unauthenticated users */}
            {isLoaded && !isSignedIn && (
              <p className="text-xs text-zinc-600 mt-3 text-center">
                <SignInButton mode="modal">
                  <button className="underline underline-offset-2 hover:text-zinc-400 transition-colors">
                    Sign in
                  </button>
                </SignInButton>
                {' '}to save this transcription to your history.
              </p>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-zinc-500 uppercase tracking-widest">Your history</span>
              <button
                onClick={onClearHistory}
                className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="group cursor-pointer p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/20 hover:border-zinc-700 hover:bg-zinc-900/40 transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-medium text-zinc-300 truncate">{item.filename}</span>
                        <span className={[
                          'text-xs px-1.5 py-0.5 rounded-md flex-shrink-0 border',
                          item.mode === 'translate'
                            ? 'bg-indigo-950/60 text-indigo-400 border-indigo-800/40'
                            : 'bg-violet-950/60 text-violet-400 border-violet-800/40',
                        ].join(' ')}>
                          {item.mode === 'translate' ? 'EN' : item.language || 'auto'}
                        </span>
                      </div>
                      <p className={[
                        'text-xs text-zinc-600 leading-relaxed',
                        expandedId === item.id ? '' : 'line-clamp-2',
                      ].join(' ')}>
                        {item.text}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right space-y-2">
                      <p className="text-xs text-zinc-700 whitespace-nowrap">{relativeTime(item.created_at)}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); copy(item.text, item.id); }}
                        className="block text-xs text-zinc-700 hover:text-zinc-400 transition-colors"
                      >
                        {copied === item.id ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="mt-16 text-center text-xs text-zinc-700 space-y-2">
          <div className="flex items-center justify-center gap-4">
            <Link href="/privacy" className="hover:text-zinc-500 transition-colors">Privacy</Link>
            <span className="text-zinc-800">·</span>
            <Link href="/terms" className="hover:text-zinc-500 transition-colors">Terms</Link>
            <span className="text-zinc-800">·</span>
            <a
              href="https://openai.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-500 transition-colors"
            >
              OpenAI Privacy
            </a>
          </div>
          <p className="text-zinc-800">Audio processed by OpenAI Whisper · Compressed by ffmpeg.wasm</p>
        </footer>
      </div>
    </main>
  );
}
