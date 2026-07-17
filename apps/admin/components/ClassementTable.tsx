'use client';

import clsx from 'clsx';
import type { ClassementEntry } from '@/lib/api';

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  EN_COURSE: { label: 'En course', color: 'bg-blue-500/20 text-blue-400' },
  ARRIVEE: { label: 'Arrivée', color: 'bg-green-500/20 text-green-400' },
  CONFIRMEE: { label: 'Confirmée', color: 'bg-yellow-500/20 text-yellow-400' },
  DISQUALIFIEE: { label: 'DQ', color: 'bg-red-500/20 text-red-400' },
};

interface Props {
  classement: ClassementEntry[];
  gelActif: boolean;
}

export default function ClassementTable({ classement, gelActif }: Props) {
  if (classement.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        Aucune équipe en course pour le moment
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {gelActif && (
        <div className="mb-3 flex items-center gap-2 text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          Classement gelé — les participants ne voient plus les mises à jour
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-left">
            <th className="pb-3 pr-4 font-medium w-12">#</th>
            <th className="pb-3 pr-4 font-medium">Équipe</th>
            <th className="pb-3 pr-4 font-medium text-right">Score</th>
            <th className="pb-3 pr-4 font-medium text-right">CPs</th>
            <th className="pb-3 pr-4 font-medium text-right">Distance</th>
            <th className="pb-3 pr-4 font-medium">Arrivée</th>
            <th className="pb-3 pr-4 font-medium">Format</th>
            <th className="pb-3 pr-4 font-medium">Dernier CP</th>
            <th className="pb-3 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {classement.map((entry) => {
            const statut = STATUT_LABELS[entry.statut] ?? { label: entry.statut, color: 'bg-gray-500/20 text-gray-400' };
            const isPodium = entry.rang <= 3;
            const podiumColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];

            return (
              <tr key={entry.equipeId} className="hover:bg-gray-900/50 transition-colors">
                <td className="py-3 pr-4">
                  <span
                    className={clsx(
                      'font-bold text-base',
                      isPodium ? podiumColors[entry.rang - 1] : 'text-gray-500',
                    )}
                  >
                    {entry.rang}
                  </span>
                </td>
                <td className="py-3 pr-4 font-medium text-white">{entry.nom}</td>
                <td className="py-3 pr-4 text-right font-mono font-semibold text-yellow-400">
                  {entry.scoreTotal.toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-right text-gray-300">{entry.nbCheckpoints}</td>
                <td className="py-3 pr-4 text-right text-gray-300">
                  {entry.distanceVolOiseauKm.toFixed(2)} km
                </td>
                <td className="py-3 pr-4 text-gray-400 text-xs">
                  {entry.heureArrivee
                    ? new Date(entry.heureArrivee).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </td>
                <td className="py-3 pr-4 text-gray-400 text-xs">
                  {entry.format_course?.nom ?? '—'}
                </td>
                <td className="py-3 pr-4 text-xs">
                  {entry.dernier_checkpoint ? (
                    <span>
                      <span className="text-gray-300">{entry.dernier_checkpoint.nom}</span>
                      {' '}
                      <span className="text-gray-500">
                        {new Date(entry.dernier_checkpoint.validated_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                  ) : '—'}
                </td>
                <td className="py-3">
                  <span className={clsx('badge', statut.color)}>{statut.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
