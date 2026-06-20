'use client';

import { useState, useEffect } from 'react';

interface TournamentDrawProps {
  totalTeams: number;
}

export default function TournamentDraw({ totalTeams }: TournamentDrawProps) {
  const [drawGenerated, setDrawGenerated] = useState(false);
  const [matchups, setMatchups] = useState<Array<{ id: string; teamA: string; teamB: string; round: number }>>([]);

  const generateDraw = () => {
    const teams = Array.from({ length: totalTeams }, (_, i) => `Équipe ${i + 1}`);
    const generated: typeof matchups = [];

    if (totalTeams < 2) {
      alert('Au moins 2 équipes requises');
      return;
    }

    // Generate round 1 matchups
    if (totalTeams <= 16) {
      // Standard bracket - fill to 16 with byes if needed
      const bracket = totalTeams === 16 ? teams : [...teams, ...Array(16 - totalTeams).fill('BYE')];
      for (let i = 0; i < bracket.length; i += 2) {
        generated.push({
          id: `match-1-${generated.length}`,
          teamA: bracket[i],
          teamB: bracket[i + 1],
          round: 1,
        });
      }
    } else {
      // Preliminary round for >16 teams
      for (let i = 0; i < totalTeams; i += 2) {
        generated.push({
          id: `match-1-${generated.length}`,
          teamA: teams[i],
          teamB: teams[i + 1] || 'BYE',
          round: 1,
        });
      }
    }

    setMatchups(generated);
    setDrawGenerated(true);
  };

  return (
    <div className="space-y-6">
      <div className="glass p-6 rounded-lg border border-ocean-500/20">
        <h3 className="text-xl font-bold text-white mb-4">Tirage au Sort</h3>

        {!drawGenerated ? (
          <div className="space-y-4">
            <div className="p-4 bg-ocean-500/10 border border-ocean-500/30 rounded-lg">
              <p className="text-ocean-200 text-sm mb-2">
                <strong>Total d'équipes inscrits:</strong> <span className="text-xl font-bold">{totalTeams}</span>
              </p>
              <p className="text-ocean-100 text-sm">
                {totalTeams < 16
                  ? `${16 - totalTeams} BYEs seront accordés à la première ronde`
                  : totalTeams > 16
                  ? `Phase de qualification préliminaire pour les équipes supplémentaires`
                  : 'Bracket complet sans BYE'}
              </p>
            </div>

            <button
              onClick={generateDraw}
              disabled={totalTeams < 2}
              className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-ocean-400 to-ocean-600 text-white font-semibold hover:shadow-glow transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Générer le Tirage au Sort
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-ocean-400">Ronde 1 - Qualifications</h4>
              <button
                onClick={() => {
                  setDrawGenerated(false);
                  setMatchups([]);
                }}
                className="px-4 py-2 text-sm rounded-lg border border-ocean-400/50 text-ocean-300 hover:bg-ocean-400/10 transition-smooth"
              >
                Régénérer
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {matchups.map((match) => (
                <div key={match.id} className="glass p-4 rounded-lg border border-ocean-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-ocean-200 text-sm font-medium">{match.teamA}</p>
                    </div>
                    <div className="px-3 py-1 bg-ocean-500/20 rounded text-ocean-300 text-xs font-semibold">
                      VS
                    </div>
                    <div className="flex-1 text-right">
                      <p className="text-ocean-200 text-sm font-medium">{match.teamB}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-accent-gold/10 border border-accent-gold/30 rounded-lg">
              <p className="text-accent-gold text-sm font-semibold">
                ✓ {matchups.length} matchs générés et prêts
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tournament Structure Info */}
      <div className="glass p-6 rounded-lg border border-ocean-500/20">
        <h4 className="font-semibold text-ocean-400 mb-4">Structure du Tournoi</h4>
        <div className="space-y-3 text-ocean-100 text-sm">
          <p>
            <strong>Ronde 1:</strong> 1/8 de finale (Qualifications) - Vainqueurs → OR, Perdants → BRONZE
          </p>
          <p>
            <strong>Ronde 2:</strong> Quarts de finale
            <br />
            • OR: Vainqueurs restent OR → Demi-finales, Perdants → ARGENT
            <br />
            • BRONZE: Vainqueurs restent BRONZE → Demi-finales, Perdants → CUIVRE
          </p>
          <p>
            <strong>Rondes 3 & 4:</strong> Demi-finales & Finales par tableau (Places finales fixées)
          </p>
        </div>
      </div>
    </div>
  );
}
