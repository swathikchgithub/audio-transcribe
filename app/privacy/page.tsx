import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — Audio Transcribe' };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mb-10 inline-block"
        >
          ← Back
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-zinc-500 text-sm mb-12">Last updated: June 2026</p>

        <div className="space-y-10 text-sm text-zinc-300 leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-zinc-100 mb-3">What this app does</h2>
            <p>
              Audio Transcribe converts audio files to text using OpenAI&apos;s Whisper speech
              recognition model. You upload a file, we send it to OpenAI for processing, and
              return the transcript. Signed-in users can save and review past transcriptions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100 mb-3">What we collect</h2>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li>
                <span className="text-zinc-300">Account info</span> — your name and email address,
                provided by Google or GitHub when you sign in. We never see your password.
              </li>
              <li>
                <span className="text-zinc-300">Transcription history</span> — filename, mode
                (transcribe or translate), language hint, the transcript text, and the date.
                Stored only if you are signed in.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100 mb-3">What we do NOT collect</h2>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li>
                <span className="text-zinc-300">Your audio files</span> — they are sent directly
                to OpenAI for processing and are never stored on our servers.
              </li>
              <li>
                <span className="text-zinc-300">Cookies beyond authentication</span> — we use
                session cookies to keep you signed in. No advertising or analytics cookies.
              </li>
              <li>
                <span className="text-zinc-300">Tracking or analytics</span> — we do not use
                Google Analytics, Meta Pixel, or any third-party tracking.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100 mb-3">Third-party services</h2>
            <p className="text-zinc-400 mb-4">
              We rely on three third-party services to operate. Each has its own privacy policy:
            </p>
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <p className="font-medium text-zinc-200 mb-1">OpenAI (Whisper API)</p>
                <p className="text-zinc-500 text-xs">
                  Your audio is sent to OpenAI for transcription. OpenAI&apos;s API data policy
                  states they do not use API inputs to train their models by default.{' '}
                  <a
                    href="https://openai.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                  >
                    OpenAI Privacy Policy
                  </a>
                </p>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <p className="font-medium text-zinc-200 mb-1">Clerk (Authentication)</p>
                <p className="text-zinc-500 text-xs">
                  Handles sign-in via Google and GitHub. Stores your name, email, and session tokens.{' '}
                  <a
                    href="https://clerk.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                  >
                    Clerk Privacy Policy
                  </a>
                </p>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                <p className="font-medium text-zinc-200 mb-1">Supabase (Database)</p>
                <p className="text-zinc-500 text-xs">
                  Stores your transcription history (text, filenames, timestamps).
                  Your audio files are never stored here.{' '}
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                  >
                    Supabase Privacy Policy
                  </a>
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100 mb-3">Data retention</h2>
            <p className="text-zinc-400">
              Your transcription history is kept until you delete it. You can clear individual
              entries, clear all history, or delete your entire account at any time from{' '}
              <Link href="/account" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                Account Settings
              </Link>
              . Deleting your account permanently removes all your data from our database and
              your sign-in credentials from Clerk.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100 mb-3">Your rights</h2>
            <ul className="space-y-2 list-disc list-inside text-zinc-400">
              <li>
                <span className="text-zinc-300">Access</span> — your transcription history is
                visible in the app while signed in.
              </li>
              <li>
                <span className="text-zinc-300">Deletion</span> — delete your history or your
                entire account from{' '}
                <Link href="/account" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                  Account Settings
                </Link>
                .
              </li>
              <li>
                <span className="text-zinc-300">Portability</span> — every transcript can be
                downloaded as a plain text file from the result panel.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100 mb-3">Contact</h2>
            <p className="text-zinc-400">
              Questions about this policy?{' '}
              <a
                href="mailto:swathikch@gmail.com"
                className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
              >
                swathikch@gmail.com
              </a>
            </p>
          </section>

        </div>

        <div className="mt-16 pt-8 border-t border-zinc-900 flex gap-6 text-xs text-zinc-700">
          <Link href="/terms" className="hover:text-zinc-500 transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-zinc-500 transition-colors">Home</Link>
        </div>
      </div>
    </main>
  );
}
