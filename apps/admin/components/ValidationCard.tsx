'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, X, MapPin, Clock } from 'lucide-react';
import type { PendingValidation } from '@/lib/api';

interface Props {
  validation: PendingValidation;
  onApprove: (id: string, points: number) => Promise<void>;
  onReject: (id: string, comment: string) => Promise<void>;
}

export default function ValidationCard({ validation, onApprove, onReject }: Props) {
  const [action, setAction] = useState<'idle' | 'approving' | 'rejecting'>('idle');
  const [points, setPoints] = useState(validation.checkpoint.points);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      await onApprove(validation.id, points);
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      await onReject(validation.id, comment);
    } finally {
      setLoading(false);
    }
  }

  const elapsed = Math.round(
    (Date.now() - new Date(validation.created_at).getTime()) / 60000,
  );

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-white">{validation.equipe.nom}</p>
            <p className="text-sm text-blue-400">{validation.checkpoint.nom}</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
            <Clock className="w-3 h-3" />
            {elapsed < 1 ? 'à l\'instant' : `il y a ${elapsed} min`}
          </div>
        </div>

        {/* GPS + Points */}
        <div className="flex items-center justify-between text-sm">
          <a
            href={`https://www.openstreetmap.org/?mlat=${validation.latitude}&mlon=${validation.longitude}&zoom=17`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-gray-400 hover:text-blue-400 transition-colors"
          >
            <MapPin className="w-3 h-3" />
            {validation.latitude.toFixed(5)}, {validation.longitude.toFixed(5)}
          </a>
          <span className="text-yellow-400 font-medium">
            {validation.checkpoint.points} pts
          </span>
        </div>

        {/* Photo */}
        {validation.photo_url && (
          <button
            onClick={() => setPhotoOpen(true)}
            className="w-full aspect-video relative rounded-lg overflow-hidden bg-gray-800 hover:opacity-90 transition-opacity"
          >
            <Image
              src={validation.photo_url}
              alt="Photo de validation"
              fill
              className="object-cover"
            />
          </button>
        )}

        {/* Actions */}
        {action === 'idle' && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setAction('approving')}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-600/40 text-green-400 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Approuver
            </button>
            <button
              onClick={() => setAction('rejecting')}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-400 text-sm font-medium py-2 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Rejeter
            </button>
          </div>
        )}

        {action === 'approving' && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400 shrink-0">Points accordés :</label>
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                min={0}
                className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {loading ? 'En cours…' : 'Confirmer'}
              </button>
              <button
                onClick={() => setAction('idle')}
                className="px-3 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {action === 'rejecting' && (
          <div className="space-y-2 pt-1">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Motif du rejet (optionnel)"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {loading ? 'En cours…' : 'Confirmer le rejet'}
              </button>
              <button
                onClick={() => setAction('idle')}
                className="px-3 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Photo lightbox */}
      {photoOpen && validation.photo_url && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPhotoOpen(false)}
        >
          <div className="relative max-w-3xl w-full max-h-[90vh] aspect-video">
            <Image
              src={validation.photo_url}
              alt="Photo de validation"
              fill
              className="object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
