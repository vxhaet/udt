'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { apiFetch, type EditionPublic, type CarteData, type ClassementEntry } from '@/lib/api';

const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
      Chargement de la carte…
    </div>
  ),
});

// ── Palette ───────────────────────────────────────────────────────────────────
const RED    = '#e63329';
const GREEN  = '#7bc24a';
const NAVY   = '#3d4fa1';
const ORANGE = '#e8621a';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLong(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

function formatYear(iso: string) {
  return new Date(iso).getFullYear();
}

const CLASSEMENT_STATUT: Record<string, { label: string; color: string }> = {
  EN_COURSE:    { label: 'En course',  color: '#3b82f6' },
  ARRIVEE:      { label: 'Arrivée',    color: '#22c55e' },
  CONFIRMEE:    { label: 'Confirmée',  color: ORANGE },
  DISQUALIFIEE: { label: 'DQ',         color: RED },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-6 h-6 shrink-0">
      <circle cx="10" cy="10" r="10" fill={GREEN} />
      <path d="M5.5 10.5l3 3 5.5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const INCLUS_CARDS = [
  {
    titre: 'CONCEPT INÉDIT',
    desc: 'Un parcours invisible jusqu\u2019au dernier moment. Chaque équipe trace sa propre route entre les checkpoints.',
  },
  {
    titre: 'CHECKPOINTS & LIBERTÉ',
    desc: 'Des dizaines de checkpoints géolocalisés. Choisissez vos objectifs, gérez vos efforts, surprenez vos adversaires.',
  },
  {
    titre: 'RAVITAILLEMENTS',
    desc: 'Des points de ravitaillement stratégiquement placés pour vous accompagner tout au long de l\u2019effort.',
  },
  {
    titre: 'APPLICATION DE DINGUE',
    desc: 'Suivi GPS temps réel, classement live, validation automatique des checkpoints — tout depuis votre téléphone.',
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EditionPage({ params }: { params: { slug: string } }) {
  const [edition, setEdition] = useState<EditionPublic | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Live
  const [carteData, setCarteData]   = useState<CarteData | null>(null);
  const [classement, setClassement] = useState<ClassementEntry[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch<EditionPublic>(`/editions/by-slug/${params.slug}`)
      .then(setEdition)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.slug]);

  const fetchLive = useCallback(async (editionId: string) => {
    const [carte, cl] = await Promise.all([
      apiFetch<CarteData>(`/editions/${editionId}/carte`),
      apiFetch<ClassementEntry[]>(`/editions/${editionId}/classement`),
    ]);
    setCarteData(carte);
    setClassement(cl);
    setMapKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!edition) return;
    const showLive = edition.statut === 'EN_COURS' || edition.statut === 'TERMINE';
    if (!showLive) return;
    setLiveLoading(true);
    fetchLive(edition.id).catch(console.error).finally(() => setLiveLoading(false));
    if (edition.statut === 'EN_COURS') {
      intervalRef.current = setInterval(() => fetchLive(edition.id).catch(console.error), 30_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [edition, fetchLive]);

  // ── Loading / 404 ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: RED }} />
      </div>
    );
  }

  if (notFound || !edition) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-center px-6">
        <div>
          <p className="text-5xl font-black italic mb-4" style={{ color: RED }}>404</p>
          <p className="text-xl font-bold text-gray-800 mb-2">Édition introuvable</p>
          <Link href="/" className="text-sm underline" style={{ color: NAVY }}>← Retour</Link>
        </div>
      </div>
    );
  }

  const spotsLeft  = edition.nb_equipes_max - edition._count.equipes;
  const prixEuros  = (edition.prix_equipe / 100).toFixed(2);
  const showLive   = edition.statut === 'EN_COURS' || edition.statut === 'TERMINE';
  const year       = formatYear(edition.date_course);

  return (
    <div className="bg-white text-gray-900 font-sans">

      {/* ════════════════════════════════════════════════════════════════
          1. HEADER
      ════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm"
              style={{ backgroundColor: NAVY }}
            >
              F
            </div>
            <span className="font-black italic text-lg tracking-tight" style={{ color: NAVY }}>FRAC</span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-bold uppercase tracking-wide text-gray-700">
            <Link href="/" className="hover:opacity-70 transition-opacity">Home</Link>
            <Link href="/abos" className="hover:opacity-70 transition-opacity">Abos</Link>
            <Link href="/agenda" className="hover:opacity-70 transition-opacity">Agenda</Link>
          </nav>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <Link
              href="/shop"
              className="hidden sm:block text-xs font-black uppercase border-2 rounded-full px-4 py-1.5 transition-colors hover:bg-gray-50"
              style={{ borderColor: NAVY, color: NAVY }}
            >
              Shop
            </Link>
            <Link
              href="/100hours"
              className="hidden sm:block text-xs font-black uppercase border-2 rounded-full px-4 py-1.5 transition-colors hover:bg-gray-50"
              style={{ borderColor: NAVY, color: NAVY }}
            >
              100 Hours
            </Link>
            <Link
              href="/rejoindre"
              className="text-xs font-black uppercase text-white rounded-full px-4 py-2 transition-opacity hover:opacity-90"
              style={{ backgroundColor: NAVY }}
            >
              Rejoins le FRAC
            </Link>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════
          2. HERO
      ════════════════════════════════════════════════════════════════ */}
      <section
        className="relative min-h-[90vh] flex flex-col justify-end pb-16 px-6 sm:px-12 overflow-hidden"
        style={{
          /* Remplacez cette URL par votre photo de coureurs */
          backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.62) 100%), url(/hero-udt.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#1a1a2e',
        }}
      >
        {/* Titre principal */}
        <div className="max-w-7xl mx-auto w-full">
          <h1
            className="text-[clamp(3.5rem,12vw,9rem)] font-black italic leading-none tracking-tight text-white uppercase mb-3"
          >
            {edition.nom}
          </h1>

          {/* Date en rouge italic */}
          <p
            className="text-2xl sm:text-4xl font-black italic uppercase mb-8"
            style={{ color: RED }}
          >
            {formatDateLong(edition.date_course)}
          </p>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-2 text-white font-black uppercase text-sm rounded-full px-5 py-2"
              style={{ backgroundColor: GREEN }}
            >
              📅 {formatDateLong(edition.date_course)}
            </span>
            <span
              className="inline-flex items-center gap-2 text-white font-black uppercase text-sm rounded-full px-5 py-2"
              style={{ backgroundColor: NAVY }}
            >
              📍 À définir
            </span>
            {edition.statut === 'INSCRIPTION' && (
              <Link
                href={`/${params.slug}/inscription`}
                className="inline-flex items-center gap-2 text-white font-black uppercase text-sm rounded-full px-6 py-2 transition-opacity hover:opacity-90"
                style={{ backgroundColor: ORANGE }}
              >
                S&apos;inscrire →
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          3. LE CONCEPT
      ════════════════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2
          className="text-4xl sm:text-5xl font-black italic uppercase mb-8"
          style={{ color: RED }}
        >
          Le Concept
        </h2>
        <div className="grid sm:grid-cols-2 gap-8 text-gray-700 text-lg leading-relaxed">
          <p>
            L&apos;<strong>Ultra D-Tour</strong> est une course à pied par équipe de{' '}
            <strong>{edition.nb_participants_par_equipe} participants</strong>. En un temps imparti
            de <strong>{edition.duree_minutes / 60}h</strong>, les équipes partent d'un point de
            départ commun et cherchent à valider un maximum de{' '}
            <strong>checkpoints géolocalisés</strong>, chacun valant un certain nombre de points.
          </p>
          <p>
            Pas d&apos;itinéraire imposé : c&apos;est vous qui décidez de votre stratégie. Rejoignez les
            checkpoints dans l&apos;ordre que vous voulez, gérez vos efforts, et revenez au point
            d&apos;arrivée avant la fin du chrono. Le score combine les checkpoints validés et les
            performances sur des <strong>segments Strava</strong>.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          4. CE QUI EST INCLUS
      ════════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-4xl sm:text-5xl font-black italic uppercase mb-10"
            style={{ color: RED }}
          >
            Ce qui est inclus
          </h2>

          {/* Grille 2×2 */}
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {INCLUS_CARDS.map((card) => (
              <div
                key={card.titre}
                className="bg-white border-2 border-gray-200 rounded-2xl p-6 flex gap-4"
              >
                <CheckIcon />
                <div>
                  <p className="font-black italic uppercase text-base mb-1 text-gray-900">{card.titre}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Carte rouge pleine largeur */}
          <div
            className="rounded-2xl p-6 flex gap-4 items-center"
            style={{ backgroundColor: RED }}
          >
            <CheckIcon />
            <div>
              <p className="font-black italic uppercase text-lg text-white">
                Soirée d'après-course all-in 🎉🍕
              </p>
              <p className="text-red-100 text-sm mt-1">
                Pizza, bières, remise des prix et bonne humeur garantis. Inclus dans votre inscription.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          5. LES FORMATS
      ════════════════════════════════════════════════════════════════ */}
      {edition.formats.length > 0 && (
        <section className="px-6 py-20">
          <div className="max-w-5xl mx-auto">
            <h2
              className="text-4xl sm:text-5xl font-black italic uppercase mb-10"
              style={{ color: RED }}
            >
              Les Formats
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {edition.formats.map((fmt) => (
                <div
                  key={fmt.id}
                  className="border-2 border-gray-200 rounded-2xl p-6 hover:border-gray-400 transition-colors"
                >
                  <p
                    className="text-3xl font-black italic uppercase mb-1"
                    style={{ color: NAVY }}
                  >
                    {fmt.nom}
                  </p>
                  <p className="text-gray-500 font-semibold mb-4">
                    {fmt.duree_minutes / 60}h de course
                  </p>
                  <p className="text-2xl font-black" style={{ color: RED }}>
                    {edition.prix_equipe === 0 ? 'Gratuit' : `${prixEuros} €`}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">par équipe</p>
                  {edition.solo_autorise && (
                    <p className="text-xs text-gray-400 mt-3 font-semibold">Solo possible</p>
                  )}
                  {edition.statut === 'INSCRIPTION' && (
                    <Link
                      href={`/${params.slug}/inscription`}
                      className="mt-4 inline-flex w-full items-center justify-center text-sm font-black uppercase text-white rounded-xl py-2.5 transition-opacity hover:opacity-90"
                      style={{ backgroundColor: ORANGE }}
                    >
                      S&apos;inscrire
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          6. EN IMAGES — UDT 2025
      ════════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-16 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-4xl sm:text-5xl font-black italic uppercase mb-10"
            style={{ color: RED }}
          >
            En images — UDT {year - 1}
          </h2>

          {/* Galerie style polaroid */}
          {(() => {
            const rotations = [1.2, -1.5, 0.8, -0.6, 1.8, -1.1, 0.4, -1.7];
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {rotations.map((deg, i) => (
                  <div
                    key={i}
                    className="bg-white shadow-md rounded-sm p-2 pb-8"
                    style={{ transform: `rotate(${deg}deg)` }}
                  >
                    <div className="aspect-square bg-gray-200 rounded-sm" />
                    <p className="text-center text-xs text-gray-400 mt-3 font-medium italic">
                      UDT {year - 1}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          7. SUIVI LIVE (si EN_COURS ou TERMINE)
      ════════════════════════════════════════════════════════════════ */}
      {showLive && (
        <section className="px-6 py-16">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-baseline gap-4 mb-8">
              <h2
                className="text-4xl sm:text-5xl font-black italic uppercase"
                style={{ color: RED }}
              >
                Suivi live
              </h2>
              {edition.statut === 'EN_COURS' && (
                <span
                  className="text-sm font-black uppercase text-white rounded-full px-4 py-1 flex items-center gap-2"
                  style={{ backgroundColor: GREEN }}
                >
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  En direct
                </span>
              )}
            </div>

            {liveLoading && !carteData ? (
              <div className="h-64 flex items-center justify-center text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-200 rounded-full animate-spin mr-3" style={{ borderTopColor: RED }} />
                Chargement du suivi…
              </div>
            ) : (
              <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                {/* Carte */}
                <div className="border-2 border-gray-200 rounded-2xl overflow-hidden h-96 lg:h-[480px]">
                  {carteData && (
                    <LiveMap key={mapKey} carteData={carteData} classement={classement} />
                  )}
                </div>

                {/* Classement */}
                <div className="border-2 border-gray-200 rounded-2xl overflow-hidden">
                  <div
                    className="px-4 py-3 flex items-center justify-between"
                    style={{ backgroundColor: NAVY }}
                  >
                    <p className="text-sm font-black italic uppercase text-white">Classement</p>
                    <p className="text-xs text-blue-300">{classement.length} équipes</p>
                  </div>
                  <div className="overflow-y-auto max-h-[calc(480px-48px)]">
                    {classement.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-8">
                        Aucune équipe en course
                      </p>
                    ) : (
                      classement.map((entry) => {
                        const statut = CLASSEMENT_STATUT[entry.statut];
                        const medals = ['🥇', '🥈', '🥉'];
                        return (
                          <div
                            key={entry.equipeId}
                            className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-base w-7 text-center shrink-0">
                              {entry.rang <= 3
                                ? medals[entry.rang - 1]
                                : <span className="text-gray-400 font-bold text-sm">{entry.rang}</span>}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{entry.nom}</p>
                              <p className="text-xs text-gray-400">
                                {entry.nbCheckpoints} CP · {entry.distanceVolOiseauKm.toFixed(1)} km
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black text-sm" style={{ color: RED }}>{entry.scoreTotal} pts</p>
                              {statut && (
                                <p className="text-xs font-semibold" style={{ color: statut.color }}>{statut.label}</p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          7 (ou 8). RENDEZ-VOUS EN {year}
      ════════════════════════════════════════════════════════════════ */}
      <section
        className="px-6 py-24 text-center"
        style={{ backgroundColor: GREEN }}
      >
        <div className="max-w-3xl mx-auto">
          <h2 className="text-5xl sm:text-6xl font-black italic uppercase text-white mb-4">
            Rendez-vous<br />en {year} !
          </h2>
          <p className="text-white text-xl mb-10 opacity-90">
            Les inscriptions sont{' '}
            {edition.statut === 'INSCRIPTION' ? 'ouvertes' : 'bientôt disponibles'}.
            {' '}Ne ratez pas votre place — les équipes se remplissent vite.
          </p>
          {edition.statut === 'INSCRIPTION' ? (
            <Link
              href={`/${params.slug}/inscription`}
              className="inline-flex items-center gap-3 text-white font-black italic uppercase text-xl rounded-full px-10 py-5 transition-opacity hover:opacity-90"
              style={{ backgroundColor: ORANGE }}
            >
              S&apos;inscrire
              <span className="text-2xl">→</span>
            </Link>
          ) : (
            <p className="text-white font-black text-xl opacity-70 uppercase italic">
              Inscriptions bientôt ouvertes
            </p>
          )}

          {edition.statut === 'INSCRIPTION' && (
            <p className="mt-6 text-white text-sm opacity-75">
              {spotsLeft} place{spotsLeft !== 1 ? 's' : ''} restante{spotsLeft !== 1 ? 's' : ''} ·{' '}
              {edition.prix_equipe === 0 ? 'Gratuit' : `${prixEuros} € / équipe`}
            </p>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════════ */}
      <footer
        className="px-6 py-16 text-white"
        style={{ backgroundColor: NAVY }}
      >
        <div className="max-w-5xl mx-auto grid sm:grid-cols-3 gap-10">
          {/* Col 1 */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">
                F
              </div>
              <span className="font-black italic text-xl">FRAC</span>
            </div>
            <p className="text-blue-200 text-sm leading-relaxed">
              Le club de trail et de course hors sentiers battus.
            </p>
          </div>

          {/* Col 2 */}
          <div>
            <p className="font-black italic uppercase text-sm mb-4 text-blue-300">Navigation</p>
            <div className="flex flex-col gap-2 text-sm text-blue-200">
              <Link href="/" className="hover:text-white transition-colors">← Retour à l&apos;agenda</Link>
              <Link href="/rejoindre" className="hover:text-white transition-colors">Je rejoins le FRAC</Link>
              <Link href="/abos" className="hover:text-white transition-colors">Nos abonnements</Link>
              <Link href="/shop" className="hover:text-white transition-colors">Shop</Link>
            </div>
          </div>

          {/* Col 3 */}
          <div>
            <p className="font-black italic uppercase text-sm mb-4 text-blue-300">Contact</p>
            <div className="flex flex-col gap-2 text-sm text-blue-200">
              <a href="mailto:geoff@frac.club" className="hover:text-white transition-colors">
                geoff@frac.club
              </a>
              <p className="text-blue-400 text-xs mt-2">
                © {new Date().getFullYear()} FRAC · Tous droits réservés
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
