'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AccountPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [subscription, setSubscription] = useState<{
    status: 'free' | 'pro';
    usedSeconds: number;
    limitSeconds: number | null;
  } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch('/api/subscription')
      .then((r) => r.json())
      .then(setSubscription)
      .catch(console.error);
  }, [user]);

  const openBillingPortal = async () => {
    setPortalLoading(true);
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setPortalLoading(false);
  };

  if (!isLoaded) return null;

  if (!user) {
    router.replace('/');
    return null;
  }

  const deleteAccount = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Something went wrong. Please try again.');
        setDeleting(false);
        return;
      }
      // Clerk account is now deleted — sign out locally and go home.
      await signOut();
      router.push('/');
    } catch {
      setError('Network error. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-10 inline-block"
        >
          ← Back
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Account</h1>
        <p className="text-zinc-500 text-sm mb-12">Manage your data and account settings.</p>

        {/* Profile */}
        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 mb-6">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Signed in as</p>
          <p className="font-medium text-zinc-100">{user.fullName ?? user.username}</p>
          <p className="text-sm text-zinc-500">{user.primaryEmailAddress?.emailAddress}</p>
        </div>

        {/* Subscription */}
        {subscription && (
          <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 mb-6">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Subscription</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={`font-medium ${subscription.status === 'pro' ? 'text-violet-400' : 'text-zinc-100'}`}>
                  {subscription.status === 'pro' ? 'Pro' : 'Free'}
                </p>
                {subscription.status === 'free' && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {Math.floor(subscription.usedSeconds / 60)} / 30 min used this month
                  </p>
                )}
              </div>
              {subscription.status === 'pro' ? (
                <button
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all disabled:opacity-40"
                >
                  {portalLoading ? 'Loading…' : 'Manage billing →'}
                </button>
              ) : (
                <Link href="/pricing" className="text-xs text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap">
                  Upgrade to Pro →
                </Link>
              )}
            </div>
            {subscription.status === 'free' && subscription.limitSeconds && (
              <div className="mt-3 h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    subscription.usedSeconds / subscription.limitSeconds > 0.8
                      ? 'bg-amber-500'
                      : 'bg-gradient-to-r from-violet-500 to-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, (subscription.usedSeconds / subscription.limitSeconds) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Danger zone */}
        <div className="p-5 rounded-2xl border border-red-900/40 bg-red-950/10">
          <p className="text-xs text-red-400 uppercase tracking-widest mb-4">Danger zone</p>

          <div className="mb-2">
            <p className="text-sm font-medium text-zinc-100 mb-1">Delete account</p>
            <p className="text-xs text-zinc-500 mb-4">
              Permanently deletes your account and all transcription history. This cannot be undone.
              Your audio files are never stored, so there is nothing else to remove.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg border border-red-900/40 bg-red-950/20 text-red-300 text-xs">
              {error}
            </div>
          )}

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="px-4 py-2 rounded-lg border border-red-900/60 text-red-400 hover:bg-red-950/30 hover:border-red-800 text-sm transition-all duration-200"
            >
              Delete my account
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">
                Are you sure? This will permanently delete your account and all saved transcriptions.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={deleteAccount}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete everything'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 text-sm transition-all duration-200 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-16 pt-8 border-t border-zinc-900 flex gap-6 text-xs text-zinc-700">
          <Link href="/privacy" className="hover:text-zinc-500 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-zinc-500 transition-colors">Terms of Service</Link>
        </div>
      </div>
    </main>
  );
}
