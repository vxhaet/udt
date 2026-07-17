'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { MessageQG, TypeMessage } from '@udt/shared';
import { Send, Info, AlertTriangle, Cloud } from 'lucide-react';
import clsx from 'clsx';

const TYPE_CONFIG: Record<TypeMessage, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  INFO:   { label: 'Info',    icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30' },
  ALERTE: { label: 'Alerte',  icon: AlertTriangle,  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30' },
  METEO:  { label: 'Météo',   icon: Cloud,          color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
};

export default function MessagesPage({ params }: { params: { id: string } }) {
  const [messages, setMessages] = useState<MessageQG[]>([]);
  const [contenu, setContenu] = useState('');
  const [type, setType] = useState<TypeMessage>('INFO');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Écouter les messages entrants
  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.emit('join:edition', params.id);

    socket.on('message:qg', (msg: MessageQG) => {
      setMessages((prev) => [msg, ...prev]);
    });

    return () => {
      socket.off('message:qg');
    };
  }, [params.id]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!contenu.trim()) return;
    setSending(true);
    setError('');
    try {
      await apiFetch(`/editions/${params.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ contenu: contenu.trim(), type }),
      });
      setContenu('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="font-semibold text-gray-200">Broadcast QG → Participants</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Les messages sont diffusés en temps réel via WebSocket et notification push.
        </p>
      </div>

      {/* Formulaire d'envoi */}
      <form onSubmit={handleSend} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        {/* Type selector */}
        <div className="flex gap-2">
          {(Object.keys(TYPE_CONFIG) as TypeMessage[]).map((t) => {
            const { label, icon: Icon, color } = TYPE_CONFIG[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                  type === t
                    ? `${color} bg-white/5 border-current`
                    : 'text-gray-500 border-gray-700 hover:border-gray-600',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-2">
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder="Message à envoyer aux participants…"
            rows={2}
            maxLength={500}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            required
          />
          <button
            type="submit"
            disabled={sending || !contenu.trim()}
            className="self-end flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
        <p className="text-xs text-gray-600 text-right">{contenu.length}/500</p>
      </form>

      {/* Historique */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Historique de session</p>
        {messages.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-8">
            Aucun message envoyé dans cette session
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => {
              const { icon: Icon, bg, color } = TYPE_CONFIG[msg.type] ?? TYPE_CONFIG.INFO;
              return (
                <div
                  key={msg.id}
                  className={clsx('flex items-start gap-3 border rounded-xl p-3', bg)}
                >
                  <Icon className={clsx('w-4 h-4 mt-0.5 shrink-0', color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{msg.contenu}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString('fr-FR')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
