'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';

function SuccessContent() {
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const code = params.get('code');

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Checkmark */}
        <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
          <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-black text-white mb-2">Inscription confirmée !</h1>
          <p className="text-zinc-400">
            Votre équipe est bien enregistrée. Un email de confirmation vous a été envoyé.
          </p>
        </div>

        {/* Code */}
        {code && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Code d'accès équipe</p>
            <p className="text-5xl font-black tracking-[0.3em] text-orange-400">{code}</p>
            <p className="text-xs text-zinc-600">
              Partagez ce code avec vos coéquipiers pour qu'ils rejoignent l'équipe dans l'app UDT.
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(code).catch(() => {})}
              className="text-sm text-orange-400 hover:text-orange-300 transition-colors"
            >
              Copier le code
            </button>
          </div>
        )}

        {/* Next steps */}
        <div className="bg-orange-950/30 border border-orange-500/20 rounded-2xl p-5 text-left space-y-2">
          <p className="text-sm font-bold text-orange-300">Prochaines étapes</p>
          <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside">
            <li>Téléchargez l'application UDT sur votre téléphone</li>
            <li>Appuyez sur "S'inscrire" puis "Rejoindre" avec le code ci-dessus</li>
            <li>Partagez le code à vos coéquipiers</li>
          </ol>
        </div>

        <Link
          href={`/${slug}`}
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
        >
          ← Retour à l'édition
        </Link>
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
