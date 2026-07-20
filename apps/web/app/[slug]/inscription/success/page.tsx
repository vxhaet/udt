'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';

const APP_DOWNLOAD_URL = 'https://apps.apple.com/app/udt';

function SuccessContent() {
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const code = params.get('code');

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full space-y-8">
        {/* Checkmark */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white mt-6 mb-2">Inscription confirmee !</h1>
          <p className="text-zinc-400 text-sm">
            Ton equipe est bien enregistree. Un email de confirmation t&apos;a ete envoye.
          </p>
        </div>

        {/* Code d'acces */}
        {code && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
              Code d&apos;acces equipe
            </p>
            <p className="text-5xl sm:text-6xl font-black tracking-[0.3em] text-orange-400 py-2">
              {code}
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(code).catch(() => {})}
              className="inline-flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copier le code
            </button>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <p className="text-sm font-bold text-white">Comment rejoindre la course</p>
          <div className="space-y-4">
            {[
              { step: '1', text: "Telecharge l'app UDT" },
              { step: '2', text: "Ouvre l'app" },
              { step: '3', text: 'Entre le code ci-dessus' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-center gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-sm font-bold text-orange-400">
                  {step}
                </span>
                <span className="text-sm text-zinc-300">{text}</span>
              </div>
            ))}
          </div>

          <a
            href={APP_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-white text-zinc-900 font-bold text-sm py-3.5 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Telecharger sur l&apos;App Store
          </a>
        </div>

        {/* Rappel partage */}
        <div className="bg-orange-950/30 border border-orange-500/20 rounded-2xl p-5 text-center">
          <p className="text-sm font-bold text-orange-300 mb-1">
            Partage ce code avec tes coequipiers !
          </p>
          <p className="text-xs text-zinc-500">
            Chaque membre de l&apos;equipe doit telecharger l&apos;app et entrer ce code pour rejoindre.
          </p>
        </div>

        <div className="text-center">
          <Link
            href={`/${slug}`}
            className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            &larr; Retour a l&apos;edition
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
