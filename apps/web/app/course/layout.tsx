'use client';

import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { getSocket, initSocket } from '@/lib/socket';

const NAV_ITEMS = [
  { href: '/course/carte', label: 'Carte', icon: MapIcon },
  { href: '/course/classement', label: 'Classement', icon: TrophyIcon },
  { href: '/course/suivi', label: 'Suivi', icon: RouteIcon },
  { href: '/course/album', label: 'Album', icon: CameraIcon },
  { href: '/course/profil', label: 'Profil', icon: UserIcon },
];

export default function CourseLayout({ children }: { children: ReactNode }) {
  const { token, payload, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [broadcastMsg, setBroadcastMsg] = useState<{ contenu: string; type: string } | null>(null);
  const [ephemereMsg, setEphemereMsg] = useState<{ contenu: string; type: string } | null>(null);
  const ephemereTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showBroadcast(text: string, type: string) {
    setBroadcastMsg({ contenu: text, type });
  }

  function showEphemere(text: string, expiresAt?: string) {
    if (ephemereTimerRef.current) clearTimeout(ephemereTimerRef.current);
    setEphemereMsg({ contenu: text, type: 'QG' });
    if (expiresAt) {
      const dismissMs = Math.max(new Date(expiresAt).getTime() - Date.now(), 1000);
      ephemereTimerRef.current = setTimeout(() => setEphemereMsg(null), dismissMs);
    }
  }

  useEffect(() => {
    if (!loading && !token) router.replace('/login');
  }, [loading, token, router]);

  const checkActiveMessages = useCallback(() => {
    if (!payload) return;

    apiFetch<{ contenu: string; type: string } | null>(`/editions/${payload.editionId}/messages/active`)
      .then((msg) => { if (msg) showBroadcast(msg.contenu, msg.type); })
      .catch(() => {});

    apiFetch<{ checkpoints: Array<{ nom: string; type: string; expires_at?: string; points?: number }> }>(`/editions/${payload.editionId}/carte`)
      .then((data) => {
        const eph = data.checkpoints.find(
          (cp) => cp.type === 'EPHEMERE_QG' && (!cp.expires_at || new Date(cp.expires_at) > new Date())
        );
        if (eph) {
          const mins = eph.expires_at ? Math.round((new Date(eph.expires_at).getTime() - Date.now()) / 60000) : 0;
          showEphemere(`QG ephemere actif ! ${eph.points ?? '?'} points en jeu ! Foncez !`, eph.expires_at);
        } else {
          setEphemereMsg(null);
        }
      })
      .catch(() => {});
  }, [payload]);

  // Run on mount, page change, foreground, focus, and poll every 30s
  useEffect(() => {
    checkActiveMessages();

    function onForeground() {
      if (document.visibilityState === 'visible') checkActiveMessages();
    }
    function onFocus() { checkActiveMessages(); }
    function onPageShow(e: PageTransitionEvent) { if (e.persisted) checkActiveMessages(); }

    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);

    // Poll every 30s as fallback
    const pollId = setInterval(checkActiveMessages, 30_000);

    return () => {
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      clearInterval(pollId);
    };
  }, [checkActiveMessages, pathname]);

  useEffect(() => {
    if (!payload || !token) return;

    const socket = initSocket(token);

    function joinEdition() {
      socket.emit('join:edition', payload!.editionId);
    }

    if (socket.connected) joinEdition();
    socket.on('connect', joinEdition);

    function onMessageQg(data: { contenu: string; type: string }) {
      showBroadcast(data.contenu, data.type);
    }

    function onCheckpointRevealed(data: { checkpoint?: { nom?: string; type?: string; expires_at?: string; points?: number } }) {
      if (data.checkpoint?.type === 'EPHEMERE_QG') {
        showEphemere(
          `QG ephemere actif ! ${data.checkpoint.points ?? '?'} points en jeu ! Foncez !`,
          data.checkpoint.expires_at,
        );
      }
    }

    function onCheckpointTaken() { setEphemereMsg(null); }
    function onMessageDismiss() { setBroadcastMsg(null); }

    socket.on('message:qg', onMessageQg);
    socket.on('checkpoint:revealed', onCheckpointRevealed);
    socket.on('checkpoint:taken', onCheckpointTaken);
    socket.on('checkpoint:expired', () => setEphemereMsg(null));
    socket.on('message:dismiss', onMessageDismiss);
    return () => {
      socket.off('connect', joinEdition);
      socket.off('message:qg', onMessageQg);
      socket.off('checkpoint:revealed', onCheckpointRevealed);
      socket.off('checkpoint:taken', onCheckpointTaken);
      socket.off('checkpoint:expired');
      socket.off('message:dismiss', onMessageDismiss);
    };
  }, [payload, token]);

  if (loading || !token) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-brand-pink rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Broadcast message banner (INFO / ALERTE / METEO) */}
      {broadcastMsg && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white ${
            broadcastMsg.type === 'ALERTE' ? 'bg-red-600' : broadcastMsg.type === 'METEO' ? 'bg-blue-600' : 'bg-amber-500'
          }`}
        >
          <span className="text-lg shrink-0">
            {broadcastMsg.type === 'ALERTE' ? '⚠️' : broadcastMsg.type === 'METEO' ? '⛅' : 'ℹ️'}
          </span>
          <span className="flex-1">{broadcastMsg.contenu}</span>
        </div>
      )}

      {/* QG ephemere banner */}
      {ephemereMsg && (
        <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-500">
          <span className="text-lg shrink-0">📍</span>
          <span className="flex-1">{ephemereMsg.contenu}</span>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 min-h-0 relative pb-16">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-zinc-900 border-t border-zinc-800 safe-area-bottom shadow-[0_-4px_20px_rgba(0,0,0,.5)]" style={{ zIndex: 9999 }}>
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                  active ? 'text-brand-pink' : 'text-zinc-500'
                }`}
              >
                <Icon active={active} />
                <span className="text-[10px] font-semibold">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function MapIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.98 6.98 0 01-3.77 1.522m0 0a6.98 6.98 0 01-3.77-1.522" />
    </svg>
  );
}

function RouteIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function CameraIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
