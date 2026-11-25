'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  GraduationCap,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { PlayerSummary, SavedGameReview } from '@/lib/types';

export interface StatsDashboardProps {
  profile: PlayerSummary;
  reviews: SavedGameReview[];
  onOpenReviewInCoach: (review: SavedGameReview) => void;
  onOpenImportPgn: () => void;
  onBackToLobby: () => void;
}

interface OpeningAggregate {
  openingName: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  avgAccuracy: number;
}

export function StatsDashboard({
  profile,
  reviews,
  onOpenReviewInCoach,
  onOpenImportPgn,
  onBackToLobby,
}: StatsDashboardProps) {
  const stats = useMemo(() => {
    const count = reviews.length;
    if (count === 0) {
      return {
        count: 0,
        avgAccuracy: 0,
        avgOpening: 0,
        avgMiddlegame: 0,
        avgEndgame: 0,
        totalMistakes: 0,
        totalBlunders: 0,
        totalInaccuracies: 0,
        totalMissedWins: 0,
        totalBrilliants: 0,
        totalGreat: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        accuracyDelta: 0,
        openings: [] as OpeningAggregate[],
        chronological: [] as SavedGameReview[],
        strengthLabel: '',
        weaknessLabel: '',
        strengthNote: '',
        weaknessNote: '',
      };
    }

    let sumAcc = 0;
    let sumOpen = 0;
    let sumMid = 0;
    let sumEnd = 0;
    let totalMistakes = 0;
    let totalBlunders = 0;
    let totalInaccuracies = 0;
    let totalMissedWins = 0;
    let totalBrilliants = 0;
    let totalGreat = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;

    const openingMap = new Map<
      string,
      { count: number; wins: number; draws: number; losses: number; accSum: number }
    >();

    for (const r of reviews) {
      sumAcc += r.accuracyPct;
      sumOpen += r.openingAcc;
      sumMid += r.middlegameAcc;
      sumEnd += r.endgameAcc;
      totalMistakes += r.mistakeCount;
      totalBlunders += r.blunderCount;
      totalInaccuracies += r.inaccuracyCount;
      totalMissedWins += r.missedWinCount;
      totalBrilliants += r.brilliantCount;
      totalGreat += r.greatCount;

      if (r.result === 'win') wins++;
      else if (r.result === 'loss') losses++;
      else draws++;

      const opKey = r.openingName || 'Apertura Libera';
      const cur = openingMap.get(opKey) || {
        count: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        accSum: 0,
      };
      cur.count += 1;
      if (r.result === 'win') cur.wins += 1;
      else if (r.result === 'loss') cur.losses += 1;
      else cur.draws += 1;
      cur.accSum += r.accuracyPct;
      openingMap.set(opKey, cur);
    }

    const avgAccuracy = Math.round(sumAcc / count);
    const avgOpening = Math.round(sumOpen / count);
    const avgMiddlegame = Math.round(sumMid / count);
    const avgEndgame = Math.round(sumEnd / count);

    const chronological = [...reviews].sort((a, b) => a.createdAtMs - b.createdAtMs);
    let accuracyDelta = 0;
    if (chronological.length >= 4) {
      const half = Math.floor(chronological.length / 2);
      const earlyAvg =
        chronological.slice(0, half).reduce((s, r) => s + r.accuracyPct, 0) / half;
      const recentAvg =
        chronological.slice(-half).reduce((s, r) => s + r.accuracyPct, 0) / half;
      accuracyDelta = Math.round(recentAvg - earlyAvg);
    }

    const phases = [
      {
        key: 'Apertura',
        val: avgOpening,
        strengthText: 'Imposti bene l’inizio partita sviluppando i pezzi con ordine.',
        weaknessText: 'Perdi precisione nelle prime mosse: ripassa i principi di sviluppo e controllo del centro.',
      },
      {
        key: 'Mediogioco',
        val: avgMiddlegame,
        strengthText: 'Buona visione tattica e gestione dei piani nel mediogioco.',
        weaknessText: 'Il mediogioco è la fase dove concedi più occasioni tattiche agli avversari.',
      },
      {
        key: 'Finale',
        val: avgEndgame,
        strengthText: 'Ottima tecnica di conversione e precisione nei finali.',
        weaknessText: 'Nei finali la precisione cala: esercitati su attività del Re e spinta dei pedoni.',
      },
    ];
    const sortedPhases = [...phases].sort((a, b) => b.val - a.val);
    const strongest = sortedPhases[0];
    const weakest = sortedPhases[sortedPhases.length - 1];

    const avgBlundersPerGame = totalBlunders / count;
    const weaknessExtra =
      avgBlundersPerGame >= 1.5
        ? ` Media di ${avgBlundersPerGame.toFixed(1)} blunder a partita: controlla sempre i pezzi in presa prima di muovere.`
        : totalMissedWins > 0
          ? ` Hai mancato ${totalMissedWins} occasioni vincenti chiare: cerca forzanti (scacchi e catture) quando sei in vantaggio.`
          : '';

    const openings: OpeningAggregate[] = Array.from(openingMap.entries())
      .map(([openingName, agg]) => ({
        openingName,
        count: agg.count,
        wins: agg.wins,
        draws: agg.draws,
        losses: agg.losses,
        avgAccuracy: Math.round(agg.accSum / agg.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    return {
      count,
      avgAccuracy,
      avgOpening,
      avgMiddlegame,
      avgEndgame,
      totalMistakes,
      totalBlunders,
      totalInaccuracies,
      totalMissedWins,
      totalBrilliants,
      totalGreat,
      wins,
      draws,
      losses,
      accuracyDelta,
      openings,
      chronological: chronological.slice(-18),
      strengthLabel: `${strongest.key} (${strongest.val}%)`,
      weaknessLabel: `${weakest.key} (${weakest.val}%)`,
      strengthNote: strongest.strengthText,
      weaknessNote: `${weakest.weaknessText}${weaknessExtra}`,
    };
  }, [reviews]);

  return (
    <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToLobby}
            className="px-3 py-1.5 rounded bg-[#262421] hover:bg-[#3C3A36] border border-[#3C3A36] text-xs font-bold text-[#DAD9D7] inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Lobby</span>
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#81B64C]" />
              <span>Statistiche e Progressi di {profile.username}</span>
            </h1>
            <p className="text-xs text-[#9E9D9A]">
              ELO attuale: {profile.elo} · Classificate: {profile.wins}V / {profile.losses}S /{' '}
              {profile.draws}P
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenImportPgn}
          className="px-4 py-2 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-xs font-extrabold border-b-2 border-[#5D8A32] inline-flex items-center gap-1.5"
        >
          <GraduationCap className="w-4 h-4" />
          <span>Analizza nuova partita / PGN</span>
        </button>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#262421] border border-[#3C3A36] rounded-md p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9E9D9A]">
            Precisione Media
          </p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-2xl font-extrabold text-[#81B64C] font-mono-tabular">
              {stats.count > 0 ? `${stats.avgAccuracy}%` : '—'}
            </span>
            {stats.accuracyDelta !== 0 && (
              <span
                className={`text-xs font-bold font-mono-tabular ${
                  stats.accuracyDelta > 0 ? 'text-[#9ED16A]' : 'text-[#F5A84B]'
                }`}
              >
                {stats.accuracyDelta > 0 ? `+${stats.accuracyDelta}%` : `${stats.accuracyDelta}%`}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#8B8987] mt-1">
            Su {stats.count} {stats.count === 1 ? 'partita analizzata' : 'partite analizzate'}
          </p>
        </div>

        <div className="bg-[#262421] border border-[#3C3A36] rounded-md p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9E9D9A]">
            Vinte · Perse · Patte
          </p>
          <p className="text-2xl font-extrabold text-white font-mono-tabular mt-1.5">
            {stats.wins} <span className="text-sm text-[#8B8987]">/</span> {stats.losses}{' '}
            <span className="text-sm text-[#8B8987]">/</span> {stats.draws}
          </p>
          <p className="text-[11px] text-[#8B8987] mt-1">
            Profilo globale: {profile.wins}V · {profile.losses}S · {profile.draws}P
          </p>
        </div>

        <div className="bg-[#262421] border border-[#3C3A36] rounded-md p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9E9D9A]">
            Errori & Imprecisioni
          </p>
          <p className="text-2xl font-extrabold text-[#F5A84B] font-mono-tabular mt-1.5">
            {stats.totalMistakes}
            <span className="text-xs text-[#9E9D9A] font-normal ml-2">
              (+{stats.totalInaccuracies} imprec.)
            </span>
          </p>
          <p className="text-[11px] text-[#8B8987] mt-1">
            {stats.count > 0
              ? `${(stats.totalMistakes / stats.count).toFixed(1)} errori a partita`
              : 'Nessun dato ancora'}
          </p>
        </div>

        <div className="bg-[#262421] border border-[#3C3A36] rounded-md p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9E9D9A]">
            Blunder & Occasioni
          </p>
          <p className="text-2xl font-extrabold text-[#F16562] font-mono-tabular mt-1.5">
            {stats.totalBlunders}
            <span className="text-xs text-[#F59E0B] font-normal ml-2">
              · {stats.totalMissedWins} mancate
            </span>
          </p>
          <p className="text-[11px] text-[#8B8987] mt-1">
            Brillanti: {stats.totalBrilliants} · Ottime: {stats.totalGreat}
          </p>
        </div>
      </div>

      {stats.count === 0 ? (
        <div className="bg-[#262421] border border-[#3C3A36] rounded-md p-8 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-[#81B64C] mx-auto" />
          <h2 className="text-base font-extrabold text-white">
            Inizia ad analizzare le tue partite per costruire il tuo profilo tecnico
          </h2>
          <p className="text-xs text-[#9E9D9A] max-w-md mx-auto">
            Dopo ogni partita su BioChess (o importando un file PGN), il Coach salva automaticamente precisione, errori, aperture e andamento delle fasi nel tuo profilo.
          </p>
          <button
            type="button"
            onClick={onOpenImportPgn}
            className="px-4 py-2 rounded bg-[#81B64C] hover:bg-[#95C85E] text-white text-xs font-extrabold"
          >
            Importa un PGN ora
          </button>
        </div>
      ) : (
        <>
          {/* Progress Over Time + Strengths/Weaknesses */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Progress Over Time Bar Chart */}
            <div className="lg:col-span-7 bg-[#262421] border border-[#3C3A36] rounded-md p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold text-white">
                    Progressi di Precisione nel Tempo
                  </h2>
                  <p className="text-xs text-[#9E9D9A]">
                    Clicca su una barra per riaprire la partita nel Coach
                  </p>
                </div>
                <span className="text-xs font-mono-tabular text-[#81B64C] font-bold">
                  Ultime {stats.chronological.length}
                </span>
              </div>

              <div className="h-44 bg-[#21201D] border border-[#3C3A36] rounded p-3 flex items-end gap-2">
                {stats.chronological.map((rev, idx) => {
                  const barColor =
                    rev.result === 'win'
                      ? 'bg-[#81B64C] hover:bg-[#95C85E]'
                      : rev.result === 'loss'
                        ? 'bg-[#CA3431] hover:bg-[#E04B48]'
                        : 'bg-[#5C8BB0] hover:bg-[#74A3C8]';
                  return (
                    <button
                      key={rev.id}
                      type="button"
                      onClick={() => onOpenReviewInCoach(rev)}
                      title={`${rev.whiteUsername} vs ${rev.blackUsername} — ${rev.accuracyPct}% (${rev.openingName})`}
                      className="flex-1 h-full flex flex-col justify-end items-center group"
                    >
                      <span className="text-[10px] font-mono-tabular text-[#BABABA] group-hover:text-white mb-1">
                        {rev.accuracyPct}
                      </span>
                      <div
                        className={`w-full max-w-[30px] rounded-t transition-all ${barColor}`}
                        style={{ height: `${Math.max(12, rev.accuracyPct)}%` }}
                      />
                      <span className="text-[9px] font-mono-tabular text-[#787672] mt-1">
                        #{idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 text-[11px] text-[#9E9D9A]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#81B64C]" /> Vittoria
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#5C8BB0]" /> Patta
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#CA3431]" /> Sconfitta
                </span>
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="lg:col-span-5 bg-[#262421] border border-[#3C3A36] rounded-md p-5 space-y-4">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-[#81B64C]" />
                <span>Punti di Forza e Debolezza</span>
              </h2>

              <div className="space-y-3">
                {(
                  [
                    ['Apertura', stats.avgOpening],
                    ['Mediogioco', stats.avgMiddlegame],
                    ['Finale', stats.avgEndgame],
                  ] as const
                ).map(([phase, pct]) => (
                  <div key={phase} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-[#DAD9D7]">{phase}</span>
                      <span className="font-mono-tabular font-bold text-white">{pct}%</span>
                    </div>
                    <div className="h-2 bg-[#21201D] border border-[#3C3A36] rounded overflow-hidden">
                      <div
                        className="h-full bg-[#81B64C]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="bg-[#21201D] border border-[#81B64C]/40 rounded p-3">
                  <p className="text-xs font-extrabold text-[#9ED16A] flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5" />
                    <span>Punto di forza: {stats.strengthLabel}</span>
                  </p>
                  <p className="text-[11px] text-[#C3C2C0] mt-1">{stats.strengthNote}</p>
                </div>

                <div className="bg-[#21201D] border border-[#E6912C]/40 rounded p-3">
                  <p className="text-xs font-extrabold text-[#F5A84B] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Area da migliorare: {stats.weaknessLabel}</span>
                  </p>
                  <p className="text-[11px] text-[#C3C2C0] mt-1">{stats.weaknessNote}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Openings Breakdown & History */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Openings Table */}
            <div className="lg:col-span-6 bg-[#262421] border border-[#3C3A36] rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-[#21201D] border-b border-[#3C3A36] flex items-center justify-between">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#BABABA] flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#D2B088]" />
                  <span>Aperture Utilizzate</span>
                </h2>
                <span className="text-xs font-mono-tabular text-[#9E9D9A]">
                  {stats.openings.length} varianti
                </span>
              </div>

              <div className="divide-y divide-[#33302C]">
                {stats.openings.map((op) => (
                  <div
                    key={op.openingName}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{op.openingName}</p>
                      <p className="text-[11px] text-[#9E9D9A] font-mono-tabular">
                        {op.count} {op.count === 1 ? 'partita' : 'partite'} · {op.wins}V {op.draws}P{' '}
                        {op.losses}S
                      </p>
                    </div>
                    <span className="font-mono-tabular font-extrabold text-[#81B64C] shrink-0">
                      {op.avgAccuracy}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Saved Game History */}
            <div className="lg:col-span-6 bg-[#262421] border border-[#3C3A36] rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-[#21201D] border-b border-[#3C3A36] flex items-center justify-between">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#BABABA] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F5A84B]" />
                  <span>Storico Partite Analizzate</span>
                </h2>
                <span className="text-xs font-mono-tabular text-[#9E9D9A]">{reviews.length}</span>
              </div>

              <div className="divide-y divide-[#33302C] max-h-[360px] overflow-y-auto">
                {reviews.map((rev) => (
                  <button
                    key={rev.id}
                    type="button"
                    onClick={() => onOpenReviewInCoach(rev)}
                    className="w-full text-left px-4 py-3 hover:bg-[#2F2C28] transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {rev.whiteUsername} vs {rev.blackUsername}
                      </p>
                      <p className="text-[11px] text-[#9E9D9A] truncate mt-0.5">
                        {rev.openingName} · Errori: {rev.mistakeCount} · Blunder: {rev.blunderCount}
                      </p>
                    </div>
                    <div className="text-right shrink-0 font-mono-tabular">
                      <p className="text-xs font-extrabold text-[#81B64C]">{rev.accuracyPct}%</p>
                      <p className="text-[10px] text-[#9E9D9A]">
                        {rev.result === 'win' ? 'Vinta' : rev.result === 'loss' ? 'Persa' : 'Patta'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
