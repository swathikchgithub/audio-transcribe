import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Delete all transcriptions from Supabase first.
  const { error: dbError } = await supabase
    .from('transcriptions')
    .delete()
    .eq('user_id', userId);

  if (dbError) {
    console.error('Account deletion — Supabase error:', dbError.message);
    return NextResponse.json({ error: 'Failed to delete data. Please try again.' }, { status: 500 });
  }

  // Delete the Clerk account. This invalidates all active sessions immediately.
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (err) {
    console.error('Account deletion — Clerk error:', err);
    // Data is already deleted from Supabase. Surface the error so the user
    // knows to retry rather than silently succeeding with a dangling account.
    return NextResponse.json(
      { error: 'Transcription data deleted, but account removal failed. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
