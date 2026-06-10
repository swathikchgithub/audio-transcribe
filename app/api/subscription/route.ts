import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { FREE_MONTHLY_SECONDS } from '@/app/lib/stripe';

export type SubscriptionInfo = {
  status: 'free' | 'pro';
  usedSeconds: number;
  limitSeconds: number | null; // null = unlimited
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();

  const status: 'free' | 'pro' = sub?.status === 'pro' ? 'pro' : 'free';

  if (status === 'pro') {
    return NextResponse.json({ status, usedSeconds: 0, limitSeconds: null } satisfies SubscriptionInfo);
  }

  // Sum this calendar month's usage
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: rows } = await supabase
    .from('transcriptions')
    .select('duration_seconds')
    .eq('user_id', userId)
    .gte('created_at', monthStart.toISOString());

  const usedSeconds = (rows ?? []).reduce((s, r) => s + (r.duration_seconds ?? 0), 0);

  return NextResponse.json({
    status,
    usedSeconds,
    limitSeconds: FREE_MONTHLY_SECONDS,
  } satisfies SubscriptionInfo);
}
