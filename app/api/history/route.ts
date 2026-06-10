import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('transcriptions')
    .select('id, filename, mode, language, text, created_at, duration_seconds')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('History fetch error:', error.message);
    return NextResponse.json({ error: 'Failed to load history.' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename, mode, language, text, duration_seconds } = await req.json();
  if (!filename || !mode || !text) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('transcriptions')
    .insert({ user_id: userId, filename, mode, language: language || null, text, duration_seconds: duration_seconds ?? 0 });

  if (error) {
    console.error('History save error:', error.message);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('transcriptions')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('History clear error:', error.message);
    return NextResponse.json({ error: 'Failed to clear.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
