// Type matching the Supabase `transcriptions` table row.
// localStorage is no longer used — history is server-side via /api/history.
export type HistoryItem = {
  id: string;
  filename: string;
  mode: 'transcribe' | 'translate';
  language: string | null;
  text: string;
  created_at: string; // ISO 8601
};
