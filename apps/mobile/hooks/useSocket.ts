import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/context/AuthContext';

/**
 * Se connecte au socket et rejoint la room de l'édition courante.
 * Retourne le socket pour écouter des événements supplémentaires.
 */
export function useSocket() {
  const { editionId } = useAuth();

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !editionId) return;

    socket.connect();
    socket.emit('join:edition', editionId);

    return () => {
      // Ne pas déconnecter ici — le socket persiste entre les écrans
    };
  }, [editionId]);

  return getSocket();
}
