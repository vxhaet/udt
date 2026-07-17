'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { apiFetch, type Edition } from '@/lib/api';
import { Bell, Map, Trophy, MessageSquare, MapPin, Settings, Activity, Archive } from 'lucide-react';

const TABS = [
  { label: 'QG', href: 'qg', icon: Bell },
  { label: 'Carte live', href: 'carte', icon: Map },
  { label: 'Classement', href: 'classement', icon: Trophy },
  { label: 'Messages', href: 'messages', icon: MessageSquare },
  { label: 'Checkpoints', href: 'checkpoints', icon: MapPin },
  { label: 'Strava', href: 'strava', icon: Activity },
  { label: 'Configuration', href: 'config', icon: Settings },
];

const STATUT_COLOR: Record<string, string> = {
  BROUILLON:   'bg-gray-500/20 text-gray-400',
  INSCRIPTION: 'bg-blue-500/20 text-blue-400',
  EN_COURS:    'bg-green-500/20 text-green-400',
  TERMINE:     'bg-purple-500/20 text-purple-400',
  ARCHIVE:     'bg-gray-500/20 text-gray-500',
};

export default function EditionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    apiFetch<Edition>(`/editions/${params.id}`).then(setEdition).catch(console.error);
  }, [params.id]);

  async function handleArchive() {
    setArchiving(true);
    try {
      await apiFetch(`/editions/${params.id}/archive`, { method: 'POST' });
      setShowConfirm(false);
      router.push(`/archive/${params.id}`);
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Modale de confirmation d'archivage */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <Archive className="w-5 h-5 text-yellow-400" />
              <h2 className="text-white font-semibold">Archiver l'édition ?</h2>
            </div>
            <p className="text-gray-400 text-sm">
              L'édition <strong className="text-white">{edition?.nom}</strong> passera en statut{' '}
              <strong className="text-yellow-400">ARCHIVE</strong>. Les résultats seront publics et
              accessibles depuis la page d'archives. Cette action ne peut pas être annulée.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="btn btn-secondary text-sm"
                disabled={archiving}
              >
                Annuler
              </button>
              <button
                onClick={handleArchive}
                className="btn text-sm bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30"
                disabled={archiving}
              >
                {archiving ? 'Archivage…' : 'Archiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edition header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/editions" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
              Éditions
            </Link>
            <span className="text-gray-700">/</span>
            <h1 className="text-lg font-semibold text-white">
              {edition?.nom ?? '…'}
            </h1>
            {edition && (
              <span className={clsx('badge', STATUT_COLOR[edition.statut])}>
                {edition.statut.replace('_', ' ')}
              </span>
            )}
          </div>
          {edition && (
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date(edition.date_course).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
              {' · '}{edition.duree_minutes / 60}h
            </p>
          )}
        </div>
        {edition && edition.statut !== 'ARCHIVE' && (
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 border border-yellow-500/30 hover:border-yellow-400/50 rounded-lg px-3 py-2 transition-colors"
          >
            <Archive className="w-4 h-4" />
            Archiver l'édition
          </button>
        )}
        {edition?.statut === 'ARCHIVE' && (
          <Link
            href={`/archive/${params.id}`}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-2 transition-colors"
          >
            <Archive className="w-4 h-4" />
            Voir l'archive publique
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-0">
        {TABS.map(({ label, href, icon: Icon }) => {
          const fullPath = `/editions/${params.id}/${href}`;
          const active = pathname === fullPath;
          return (
            <Link
              key={href}
              href={fullPath}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors',
                active
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Page content */}
      <div>{children}</div>
    </div>
  );
}
