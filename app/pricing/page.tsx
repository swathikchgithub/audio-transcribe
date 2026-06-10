'use client';

import { useUser, SignInButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useState } from 'react';

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function PricingPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [loading, setLoading] = useState(false);

  const upgrade = async () => {
    setLoading(true);
    const res = await fetch('/api/stripe/checkout', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setLoading(false);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-10 inline-block">
          ← Back
        </Link>

        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent mb-3">
            Simple pricing
          </h1>
          <p className="text-zinc-500">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Free */}
          <div className="p-7 rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <div className="mb-6">
              <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Free</p>
              <p className="text-4xl font-bold text-zinc-100">$0</p>
              <p className="text-zinc-600 text-sm mt-1">No credit card required</p>
            </div>
            <ul className="space-y-3 mb-8">
              {[
                '30 minutes per month',
                'Files up to 25 MB',
                'Transcribe + Translate',
                'Download as .txt',
                'Sign in with Google or GitHub',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-400">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>
            {isLoaded && !isSignedIn ? (
              <SignInButton mode="modal">
                <button className="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 text-sm font-medium transition-all">
                  Get started free
                </button>
              </SignInButton>
            ) : (
              <Link href="/" className="block w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:border-zinc-600 text-sm font-medium transition-all text-center">
                Current plan
              </Link>
            )}
          </div>

          {/* Pro */}
          <div className="relative p-7 rounded-2xl border border-violet-500/40 bg-gradient-to-b from-violet-950/30 to-zinc-900/40">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
                Most popular
              </span>
            </div>
            <div className="mb-6">
              <p className="text-xs text-violet-400 uppercase tracking-widest mb-2">Pro</p>
              <div className="flex items-end gap-1.5">
                <p className="text-4xl font-bold text-zinc-100">$12</p>
                <p className="text-zinc-500 text-sm mb-1.5">/ month</p>
              </div>
              <p className="text-zinc-600 text-sm mt-1">Cancel anytime</p>
            </div>
            <ul className="space-y-3 mb-8">
              {[
                'Unlimited transcription',
                'Files up to 100 MB',
                'Auto-compression for large files',
                'Chunked transcription for long audio',
                'Full transcription history',
                'Everything in Free',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>
            {isLoaded && isSignedIn ? (
              <button
                onClick={upgrade}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 text-white text-sm font-semibold transition-all"
              >
                {loading ? 'Redirecting…' : 'Upgrade to Pro →'}
              </button>
            ) : (
              <SignInButton mode="modal">
                <button className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all">
                  Sign in to upgrade →
                </button>
              </SignInButton>
            )}
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 space-y-6">
          <h2 className="text-sm text-zinc-500 uppercase tracking-widest">FAQ</h2>
          {[
            {
              q: 'What counts toward my 30 minutes?',
              a: 'The actual duration of audio you transcribe, measured by the Whisper API. The counter resets on the 1st of each month.',
            },
            {
              q: 'Is my audio stored anywhere?',
              a: 'No. Audio files are sent directly to OpenAI for transcription and immediately discarded. Only the transcript text is saved to your history.',
            },
            {
              q: 'What languages are supported?',
              a: 'Whisper supports 99 languages. Transcription keeps the original language; Translate mode converts any language to English.',
            },
            {
              q: 'Can I cancel my Pro subscription?',
              a: 'Yes — anytime from Account Settings. You keep Pro access until the end of your billing period.',
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="text-sm font-medium text-zinc-200 mb-1">{q}</p>
              <p className="text-sm text-zinc-500">{a}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-zinc-900 flex gap-6 text-xs text-zinc-700">
          <Link href="/privacy" className="hover:text-zinc-500 transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-zinc-500 transition-colors">Terms</Link>
          <Link href="/" className="hover:text-zinc-500 transition-colors">Home</Link>
        </div>
      </div>
    </main>
  );
}
