'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resetSocket } from '@/lib/socket';

export default function Nav() {
  const router = useRouter();

  function logout() {
    resetSocket();
    document.cookie = 'udt_token=; path=/; max-age=0';
    router.push('/login');
  }

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 h-14 flex items-center justify-between shrink-0">
      <Link href="/editions" className="flex items-center gap-2 font-bold text-white">
        <span className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-sm font-black">
          U
        </span>
        UDT Admin
      </Link>

      <button
        onClick={logout}
        className="text-sm text-gray-400 hover:text-white transition-colors"
      >
        Déconnexion
      </button>
    </nav>
  );
}
