'use client';

import { useState } from 'react';

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  setA: number;
  setB: number;
  gameA: number;
  gameB: number;
  isTiebreak: boolean;
  status: 'pending' | 'in_progress' | 'completed';
}

export default function LiveScoring() {
  const [matches, setMatches] = useState<Match[]>([
    {
      id: 'match-1',
      teamA: 'Équipe 1',
      teamB: 'Équipe 2',
      setA: 0,
      setB: 0,
      gameA: 0,
      gameB: 0,
      isTiebreak: false,
      status: 'in_progress',
    },
  ]);
  const [selectedMatch, setSelectedMatch] = useState<string | null>('match-1');

  const currentMatch = matches.find((m) => m.id === selectedMatch);

  const updateScore = (matchId: string, type: 'gameA' | 'gameB', increment: number) => {
    setMatches((prev) =>
      prev.map((match) => {
        if (match.id !== matchId) return match;

        let updated = { ...match };

        if (type === 'gameA') {
          updated.gameA = Math.max(0, updated.gameA + increment);
        } else {
          updated.gameB = Math.max(0, updated.gameB + increment);
        }

        // Check for set win (4 games)
        if (updated.gameA === 4 || updated.gameB === 4) {
          if (updated.gameA === 4) {
            updated.setA += 1;
          } else {
            updated.setB += 1;
          }
          updated.gameA = 0;
          updated.gameB = 0;
        }

        // Check for tiebreak at 3-3
        if (updated.gameA === 3 && updated.gameB === 3) {
          updated.isTiebreak = true;
        }

        // Check for match win (2 sets)
        if (updated.setA === 2 || updated.setB === 2) {
          updated.status = 'completed';
        }

        return updated;
      })
    );
  };

  const completeMatch = (matchId: string, winner: 'teamA' | 'teamB') => {
    setMatches((prev) =>
      prev.map((match) => {
        if (match.id !== matchId) return match;
        return { ...match, status: 'completed' };
      })
    );
  };

  if (!currentMatch) {
    return (
      <div className="text-center py-12">
        <p className="text-ocean-300">Aucun match sélectionné</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Match Selector */}
      <div className="glass p-6 rounded-lg border border-ocean-500/20">
        <h3 className="font-semibold text-ocean-400 mb-4">Sélectionner un Match</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {matches.map((match) => (
            <button
              key={match.id}
              onClick={() => setSelectedMatch(match.id)}
              className={`p-3 rounded-lg border transition-smooth ${
                selectedMatch === match.id
                  ? 'bg-ocean-500/20 border-ocean-400'
                  : 'glass border-ocean-500/20 hover:border-ocean-400/50'
              }`}
            >
              <p className="text-sm font-medium text-ocean-200">{match.teamA}</p>
              <p className="text-xs text-ocean-400">vs</p>
              <p className="text-sm font-medium text-ocean-200">{match.teamB}</p>
              <div className="mt-2 text-xs text-ocean-300">
                {match.status === 'completed' ? '✓ Terminé' : '🔴 En cours'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Scoring Interface */}
      <div className="glass p-8 rounded-lg border border-ocean-500/20">
        <div className="text-center mb-8">
          <p className="text-ocean-300 text-sm mb-2">Match en cours</p>
          <h2 className="text-3xl font-bold text-white mb-4">
            {currentMatch.teamA} <span className="text-accent-gold">vs</span> {currentMatch.teamB}
          </h2>

          {/* Score Display */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            {/* Team A */}
            <div className="space-y-4">
              <h3 className="font-semibold text-ocean-300">{currentMatch.teamA}</h3>
              <div className="space-y-2">
                <div className="text-5xl font-bold text-accent-gold">{currentMatch.setA}</div>
                <p className="text-ocean-300 text-sm">Sets</p>
              </div>
              <div className="space-y-2">
                <div className="text-4xl font-bold text-ocean-400">{currentMatch.gameA}</div>
                <p className="text-ocean-300 text-sm">Jeux</p>
              </div>
            </div>

            {/* Center - Info */}
            <div className="flex flex-col justify-center items-center space-y-4">
              <div className="text-2xl">🎾</div>
              {currentMatch.isTiebreak && (
                <span className="px-3 py-1 bg-accent-gold/20 text-accent-gold text-sm font-semibold rounded-full">
                  Tie-break
                </span>
              )}
              <p className={`font-semibold ${currentMatch.status === 'completed' ? 'text-accent-gold' : 'text-ocean-400'}`}>
                {currentMatch.status === 'completed' ? '✓ Terminé' : '🔴 En cours'}
              </p>
            </div>

            {/* Team B */}
            <div className="space-y-4">
              <h3 className="font-semibold text-ocean-300">{currentMatch.teamB}</h3>
              <div className="space-y-2">
                <div className="text-5xl font-bold text-accent-gold">{currentMatch.setB}</div>
                <p className="text-ocean-300 text-sm">Sets</p>
              </div>
              <div className="space-y-2">
                <div className="text-4xl font-bold text-ocean-400">{currentMatch.gameB}</div>
                <p className="text-ocean-300 text-sm">Jeux</p>
              </div>
            </div>
          </div>

          {/* Control Buttons */}
          {currentMatch.status !== 'completed' && (
            <div className="space-y-6">
              {/* Scoring Controls */}
              <div className="flex gap-4 justify-center">
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-ocean-300 font-medium">Jeu {currentMatch.teamA}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateScore(currentMatch.id, 'gameA', -1)}
                      className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-smooth"
                    >
                      -
                    </button>
                    <button
                      onClick={() => updateScore(currentMatch.id, 'gameA', 1)}
                      className="px-4 py-2 rounded-lg bg-accent-gold/20 hover:bg-accent-gold/30 text-accent-gold font-bold transition-smooth"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="w-px bg-ocean-500/20" />

                <div className="flex flex-col gap-2">
                  <p className="text-sm text-ocean-300 font-medium">Jeu {currentMatch.teamB}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateScore(currentMatch.id, 'gameB', -1)}
                      className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-smooth"
                    >
                      -
                    </button>
                    <button
                      onClick={() => updateScore(currentMatch.id, 'gameB', 1)}
                      className="px-4 py-2 rounded-lg bg-accent-gold/20 hover:bg-accent-gold/30 text-accent-gold font-bold transition-smooth"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Complete Match */}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => completeMatch(currentMatch.id, 'teamA')}
                  className="px-6 py-2 rounded-lg bg-accent-gold/20 hover:bg-accent-gold/30 text-accent-gold font-semibold transition-smooth"
                >
                  {currentMatch.teamA} Gagne
                </button>
                <button
                  onClick={() => completeMatch(currentMatch.id, 'teamB')}
                  className="px-6 py-2 rounded-lg bg-accent-gold/20 hover:bg-accent-gold/30 text-accent-gold font-semibold transition-smooth"
                >
                  {currentMatch.teamB} Gagne
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rules Reference */}
      <div className="glass p-6 rounded-lg border border-ocean-500/20">
        <h4 className="font-semibold text-ocean-400 mb-3">Rappel des Règles</h4>
        <ul className="space-y-2 text-ocean-100 text-sm">
          <li>✓ 2 sets de 4 jeux chacun (première à 4)</li>
          <li>✓ À 3-3 → Tie-break en 5 points</li>
          <li>✓ Super tie-break à 1-1 en sets (7 points)</li>
          <li>✓ Durée max: 30 minutes</li>
        </ul>
      </div>
    </div>
  );
}
