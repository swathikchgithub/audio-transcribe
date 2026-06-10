'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CORE_VERSION = '0.12.6';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

export const CHUNK_DURATION_SECONDS = 4 * 60; // 4-minute segments
export const COMPRESS_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20 MB

export const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export type AudioQuality = 'small' | 'balanced' | 'high';

export const IMAGE_QUALITY: Record<AudioQuality, number> = {
  small:    0.30,
  balanced: 0.65,
  high:     0.88,
};

export function compressImageForDownload(file: File, quality: number): Promise<File> {
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
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const name = file.name.replace(/\.[^.]+$/, '') + '_compressed.jpg';
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          } else {
            reject(new Error('Image compression failed.'));
          }
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image.')); };
    img.src = url;
  });
}

const AUDIO_QUALITY_FLAGS: Record<AudioQuality, string[]> = {
  small:    ['-ac', '1', '-ar', '22050', '-b:a', '48k'],
  balanced: ['-ac', '1', '-ar', '44100', '-b:a', '96k'],
  high:     ['-ac', '2', '-ar', '44100', '-b:a', '192k'],
};

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

export function cancelCompression(): void {
  if (ffmpegInstance) {
    ffmpegInstance.terminate();
    ffmpegInstance = null;
  }
}

/**
 * Compress and split a large audio file into short Opus WebM chunks in one
 * ffmpeg pass. Each chunk is freshly encoded (not stream-copied), so every
 * output file is independently decodable by Whisper regardless of where the
 * seek point falls in the source container.
 *
 * Encoding flags match compressAudio: mono 16 kHz Opus @ 24 kbps, voip mode.
 *
 * The caller receives a callback for each completed chunk so it can update
 * progress in the UI without waiting for the whole file to finish.
 */
export async function compressAndSplit(
  file: File,
  chunkDuration = CHUNK_DURATION_SECONDS,
  onChunk?: (index: number, chunk: File) => void,
  onProgress?: (chunkIndex: number, ratio: number) => void,
): Promise<File[]> {
  const ffmpeg = await getFFmpeg();

  const ext = file.name.split('.').pop()?.toLowerCase() || 'audio';
  const inputName = `input_cs.${ext}`;
  const baseName = file.name.replace(/\.[^.]+$/, '');

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const chunks: File[] = [];

  for (let i = 0; i < 200; i++) { // 200 × 4 min = 13 hours ceiling
    const chunkName = `chunk_cs_${i}.webm`;
    const start = i * chunkDuration;

    const handler = ({ progress }: { progress: number }) => {
      onProgress?.(i, Math.max(0, Math.min(1, progress)));
    };
    ffmpeg.on('progress', handler);

    await ffmpeg.exec([
      '-ss', String(start),
      '-t',  String(chunkDuration),
      '-i',  inputName,
      '-vn', '-ac', '1', '-ar', '16000',
      '-c:a', 'libopus', '-b:a', '24k', '-application', 'voip',
      chunkName,
    ]);

    ffmpeg.off('progress', handler);

    try {
      const data = await ffmpeg.readFile(chunkName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
      await ffmpeg.deleteFile(chunkName);

      // A real audio chunk is always > 1 KB; tiny output means we're past EOF.
      if (bytes.length < 1024) break;

      const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'audio/webm' });
      const chunk = new File([blob], `${baseName}_part${i + 1}.webm`, { type: 'audio/webm' });
      chunks.push(chunk);
      onChunk?.(i, chunk);
    } catch {
      break;
    }
  }

  try { await ffmpeg.deleteFile(inputName); } catch { /* best-effort */ }
  return chunks;
}

export async function compressAudioForDownload(
  file: File,
  quality: AudioQuality = 'balanced',
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const ffmpeg = await getFFmpeg();

  const ext = file.name.split('.').pop()?.toLowerCase() || 'audio';
  const inputName = `dl_input.${ext}`;
  const outputName = 'dl_output.mp3';

  const handler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  ffmpeg.on('progress', handler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      '-i', inputName, '-vn',
      ...AUDIO_QUALITY_FLAGS[quality],
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'audio/mpeg' });
    const name = file.name.replace(/\.[^.]+$/, '') + '_compressed.mp3';
    return new File([blob], name, { type: 'audio/mpeg' });
  } finally {
    ffmpeg.off('progress', handler);
    try { await ffmpeg.deleteFile(inputName); } catch { /* virtual FS cleanup */ }
    try { await ffmpeg.deleteFile(outputName); } catch { /* virtual FS cleanup */ }
  }
}
