'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, type ArchivedEdition } from '@/lib/api';
import { Archive, Calendar, Users, ChevronRight, Trophy } from 'lucide-react';

export default function ArchivesPage() {
  const [editions, setEditions] = useState<ArchivedEdition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ArchivedEdition[]>('/editions/archived')
      .then(setEditions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-yellow-400 mb-3">
            <Archive className="w-6 h-6" />
            <span className="text-sm font-medium uppercase tracking-widest">Archives</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Ultra DéTour</h1>
          <p className="text-gray-400">Résultats des éditions passées</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-20">Chargement…</div>
        ) : editions.length === 0 ? (
          <div className="text-center text-gray-600 py-20">
            <Archive className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Aucune édition archivée pour l'instant.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {editions.map((edition) => (
              <Link
                key={edition.id}
                href={`/archive/${edition.id}`}
                className="block card hover:border-gray-600 hover:bg-gray-800/60 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <h2 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                      {edition.nom}
                    </h2>
                    {edition.description && (
                      <p className="text-sm text-gray-400 line-clamp-1">{edition.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(edition.date_course).toLocaleDateString('fr-FR', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {edition._count.equipes} équipe{edition._count.equipes > 1 ? 's' : ''}
                      </span>
                      <span>{edition.duree_minutes / 60}h</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-300 transition-colors flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center">
          <Link href="/editions" className="text-sm text-gray-600 hover:text-gray-400 transition-colors">
            ← Retour au back-office
          </Link>
        </div>
      </div>
    </div>
  );
}
