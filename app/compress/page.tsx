'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import { IMAGE_EXTS, IMAGE_QUALITY, type AudioQuality } from '../lib/compress';

type Stage = 'idle' | 'compressing';
type FileCategory = 'audio' | 'image' | 'unsupported';

const AUDIO_EXTS = new Set(['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac']);

const QUALITY_META: Record<AudioQuality, { label: string; desc: string }> = {
  small:    { label: 'Small',        desc: 'Smallest file, some quality loss' },
  balanced: { label: 'Balanced',     desc: 'Good quality, significantly smaller' },
  high:     { label: 'High Quality', desc: 'Near-original quality' },
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getCategory(file: File): FileCategory {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'unsupported';
}


export default function CompressPage() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<AudioQuality>('balanced');
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ original: number; compressed: File } | null>(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const loading = stage !== 'idle';
  const fileCategory = file ? getCategory(file) : null;

  const handleFile = (selected: File | null) => {
    setError('');
    setResult(null);
    if (!selected) return;
    if (getCategory(selected) === 'unsupported') {
      const ext = selected.name.split('.').pop()?.toLowerCase() ?? 'unknown';
      setError(`".${ext}" files are not supported. Drop an audio or image file (JPG, PNG, WebP, GIF, MP3, M4A, WAV, etc.).`);
      return;
    }
    setFile(selected);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const compress = async () => {
    if (!file || !fileCategory || fileCategory === 'unsupported') return;
    setError('');
    setResult(null);
    setStage('compressing');
    setProgress(0);

    try {
      let compressed: File;

      if (fileCategory === 'image') {
        setProgress(0.5);
        const { compressImageForDownload } = await import('../lib/compress');
        compressed = await compressImageForDownload(file, IMAGE_QUALITY[quality]);
        setProgress(1);
      } else {
        const { compressAudioForDownload } = await import('../lib/compress');
        compressed = await compressAudioForDownload(file, quality, setProgress);
      }

      if (compressed.size >= file.size) {
        setError(
          'The file is already well-compressed — no reduction was possible at this quality setting. Try a lower quality preset.',
        );
        return;
      }

      setResult({ original: file.size, compressed });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Compression failed.');
    } finally {
      setStage('idle');
      setProgress(0);
    }
  };

  const cancel = async () => {
    if (fileCategory === 'audio') {
      const { cancelCompression } = await import('../lib/compress');
      cancelCompression();
    }
    setStage('idle');
    setProgress(0);
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.compressed);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.compressed.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const savings = result
    ? Math.round((1 - result.compressed.size / result.original) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-10 inline-block">
          ← Back to Transcribe
        </Link>

        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent mb-2">
            Compress File
          </h1>
          <p className="text-zinc-500 text-sm">
            Reduce audio and image file sizes for uploading.{' '}
            <span className="text-zinc-600">Processed entirely in your browser — nothing is uploaded.</span>
          </p>
        </header>

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
            accept="audio/*,image/jpeg,image/png,image/webp,image/gif"
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />

          {file ? (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto">
                {fileCategory === 'audio' ? (
                  <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-zinc-100 truncate">{file.name}</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {formatSize(file.size)}
                  <span className="ml-2 text-zinc-700 capitalize">{fileCategory}</span>
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
                <p className="font-medium text-zinc-300">Drop a file here</p>
                <p className="text-sm text-zinc-600 mt-1">or click to browse</p>
              </div>
              <p className="text-xs text-zinc-700">Audio (MP3, M4A, WAV, OGG…) · Images (JPG, PNG, WebP, GIF)</p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {stage === 'compressing' && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Compressing in browser</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            {fileCategory === 'audio' && (
              <p className="text-xs text-zinc-700">First run downloads ffmpeg.wasm (~30 MB) — cached after that.</p>
            )}
          </div>
        )}

        {/* Quality selector */}
        <div className="mt-6">
          <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-3">Quality</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(QUALITY_META) as AudioQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                disabled={loading}
                className={[
                  'p-3 rounded-xl border text-left transition-all duration-200 disabled:opacity-40',
                  quality === q
                    ? 'border-violet-600/60 bg-violet-950/30'
                    : 'border-zinc-800 bg-zinc-900/20 hover:border-zinc-700',
                ].join(' ')}
              >
                <p className={`text-sm font-medium ${quality === q ? 'text-violet-300' : 'text-zinc-300'}`}>
                  {QUALITY_META[q].label}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5 leading-snug">{QUALITY_META[q].desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={compress}
            disabled={!file || loading || fileCategory === 'unsupported'}
            className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-sm disabled:shadow-none"
          >
            {loading ? 'Compressing…' : 'Compress'}
          </button>
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
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-8 p-5 rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">Result</p>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-zinc-600 w-24 text-xs uppercase tracking-wider">Original</span>
                  <span className="text-zinc-400">{formatSize(result.original)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-zinc-600 w-24 text-xs uppercase tracking-wider">Compressed</span>
                  <span className="text-zinc-100 font-medium">{formatSize(result.compressed.size)}</span>
                  <span className="text-emerald-400 text-xs font-semibold">−{savings}%</span>
                </div>
              </div>
              <button
                onClick={download}
                className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all"
              >
                Download
              </button>
            </div>
            <p className="text-xs text-zinc-700 truncate">{result.compressed.name}</p>
          </div>
        )}

        <footer className="mt-16 text-center text-xs text-zinc-700 space-y-2">
          <div className="flex items-center justify-center gap-4">
            <Link href="/privacy" className="hover:text-zinc-500 transition-colors">Privacy</Link>
            <span className="text-zinc-800">·</span>
            <Link href="/terms" className="hover:text-zinc-500 transition-colors">Terms</Link>
          </div>
          <p className="text-zinc-800">Files are never uploaded — compression runs entirely in your browser.</p>
        </footer>
      </div>
    </main>
  );
}
