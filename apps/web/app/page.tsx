'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, type EditionPublic } from '@/lib/api';

const STATUT_BADGE: Record<string, { label: string; classes: string }> = {
  INSCRIPTION: { label: 'Inscriptions ouvertes', classes: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  EN_COURS:    { label: 'En cours', classes: 'bg-green-500/20 text-green-400 border-green-500/30 animate-pulse' },
  TERMINE:     { label: 'Terminée', classes: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  BROUILLON:   { label: 'Bientôt', classes: 'bg-zinc-500/20 text-zinc-500 border-zinc-700' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function HomePage() {
  const [editions, setEditions] = useState<EditionPublic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<EditionPublic[]>('/editions')
      .then((all) => setEditions(
        all.filter((e) => e.statut !== 'ARCHIVE' && e.statut !== 'BROUILLON'),
      ))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-950/40 via-zinc-950 to-zinc-950" />
        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm text-orange-400 font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            Course à pied par équipe
          </div>
          <h1 className="text-6xl font-black text-white leading-none tracking-tight mb-4">
            ULTRA<br />
            <span className="text-orange-500">DÉTOUR</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-xl">
            En équipe de {editions[0]?.nb_participants_par_equipe ?? 4}, partez d'un point commun et rejoignez un maximum de checkpoints avant la fin du chrono.
          </p>
        </div>
      </div>

      {/* Editions */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-6">
          Éditions à venir &amp; en cours
        </h2>

        {loading ? (
          <div className="flex items-center gap-3 text-zinc-500 py-12">
            <div className="w-4 h-4 border-2 border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
            Chargement…
          </div>
        ) : editions.length === 0 ? (
          <div className="text-zinc-600 py-12 text-center">
            Aucune édition disponible pour le moment.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {editions.map((ed) => {
              const badge = STATUT_BADGE[ed.statut];
              const spotsLeft = ed.nb_equipes_max - ed._count.equipes;
              const href = ed.slug
                ? ed.statut === 'INSCRIPTION'
                  ? `/${ed.slug}/inscription`
                  : `/${ed.slug}`
                : null;

              return (
                <div
                  key={ed.id}
                  className="group bg-zinc-900 border border-zinc-800 hover:border-orange-500/40 rounded-2xl p-6 transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-xl font-black text-white group-hover:text-orange-400 transition-colors">
                        {ed.nom}
                      </h3>
                      <p className="text-zinc-500 text-sm mt-1">{formatDate(ed.date_course)}</p>
                    </div>
                    {badge && (
                      <span className={`shrink-0 text-xs font-semibold border rounded-full px-3 py-1 ${badge.classes}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>

                  {ed.description && (
                    <p className="text-zinc-400 text-sm mb-4 line-clamp-2">{ed.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-zinc-500 mb-5">
                    <span>{ed.duree_minutes / 60}h de course</span>
                    <span>{ed.nb_participants_par_equipe} participants/équipe</span>
                    {ed.prix_equipe > 0 && (
                      <span className="text-orange-400 font-semibold">
                        {(ed.prix_equipe / 100).toFixed(2)} € / équipe
                      </span>
                    )}
                    {ed.statut === 'INSCRIPTION' && (
                      <span className={spotsLeft <= 5 ? 'text-orange-400 font-medium' : ''}>
                        {spotsLeft} place{spotsLeft !== 1 ? 's' : ''} restante{spotsLeft !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {href ? (
                    <Link
                      href={href}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-xl px-4 py-2.5 transition-colors"
                    >
                      {ed.statut === 'INSCRIPTION' ? 'S\u2019inscrire' : 'Voir l\u2019édition'}
                      <span>→</span>
                    </Link>
                  ) : (
                    <span className="inline-flex items-center text-sm text-zinc-600">
                      Page bientôt disponible
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 px-6 text-center text-zinc-600 text-sm">
        <p className="font-bold text-zinc-400 mb-1">Ultra DéTour</p>
        <p>Organisé par la FRAC · {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
