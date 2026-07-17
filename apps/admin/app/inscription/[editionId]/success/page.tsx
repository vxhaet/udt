'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SuccessContent() {
  const params = useSearchParams();
  const code = params.get('code');

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Inscription confirmée !</h1>
          <p className="text-gray-400">
            Votre équipe est bien enregistrée. Un email de confirmation vous a été envoyé.
          </p>
        </div>

        {code && (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-3">
            <p className="text-sm text-gray-400">Code d'accès équipe</p>
            <p className="text-4xl font-black tracking-[0.3em] text-white">{code}</p>
            <p className="text-xs text-gray-500">
              Partagez ce code avec vos coéquipiers pour qu'ils rejoignent l'équipe dans l'application UDT.
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(code).catch(() => {})}
              className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Copier le code
            </button>
          </div>
        )}

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-blue-300">Prochaines étapes</p>
          <ol className="text-xs text-gray-400 space-y-1 text-left list-decimal list-inside">
            <li>Téléchargez l'application UDT</li>
            <li>Appuyez sur "S'inscrire" puis "Rejoindre" avec le code ci-dessus</li>
            <li>Partagez le code à vos 3 coéquipiers</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Chargement…</div>}>
      <SuccessContent />
    </Suspense>
  );
}
