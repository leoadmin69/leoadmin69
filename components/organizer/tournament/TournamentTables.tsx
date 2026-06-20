'use client';

interface TableTeam {
  position: number;
  name: string;
  players: string[];
  wins: number;
  losses: number;
  points: number;
}

export default function TournamentTables() {
  // Sample data structure
  const tables = [
    {
      name: 'OR (Tableau Principal)',
      color: 'accent-gold',
      icon: '🥇',
      teams: [
        { position: 1, name: 'Équipe A', players: ['Joueur 1', 'Joueur 2'], wins: 3, losses: 0, points: 30 },
        { position: 2, name: 'Équipe B', players: ['Joueur 3', 'Joueur 4'], wins: 2, losses: 1, points: 20 },
        { position: 3, name: 'Équipe C', players: ['Joueur 5', 'Joueur 6'], wins: 1, losses: 2, points: 10 },
        { position: 4, name: 'Équipe D', players: ['Joueur 7', 'Joueur 8'], wins: 0, losses: 3, points: 0 },
      ] as TableTeam[],
    },
    {
      name: 'ARGENT (Deuxième)',
      color: 'gray',
      icon: '🥈',
      teams: [
        { position: 5, name: 'Équipe E', players: ['Joueur 9', 'Joueur 10'], wins: 2, losses: 1, points: 20 },
        { position: 6, name: 'Équipe F', players: ['Joueur 11', 'Joueur 12'], wins: 1, losses: 2, points: 10 },
        { position: 7, name: 'Équipe G', players: ['Joueur 13', 'Joueur 14'], wins: 0, losses: 2, points: 0 },
      ] as TableTeam[],
    },
    {
      name: 'BRONZE (Troisième)',
      color: 'accent-bronze',
      icon: '🥉',
      teams: [
        { position: 9, name: 'Équipe H', players: ['Joueur 15', 'Joueur 16'], wins: 2, losses: 1, points: 20 },
        { position: 10, name: 'Équipe I', players: ['Joueur 17', 'Joueur 18'], wins: 1, losses: 2, points: 10 },
      ] as TableTeam[],
    },
    {
      name: 'CUIVRE (Consolante)',
      color: 'accent-copper',
      icon: '🎖️',
      teams: [
        { position: 12, name: 'Équipe J', players: ['Joueur 19', 'Joueur 20'], wins: 1, losses: 1, points: 10 },
        { position: 13, name: 'Équipe K', players: ['Joueur 21', 'Joueur 22'], wins: 0, losses: 2, points: 0 },
      ] as TableTeam[],
    },
  ];

  return (
    <div className="space-y-8">
      <div className="p-4 bg-ocean-500/10 border border-ocean-500/30 rounded-lg">
        <p className="text-ocean-200 text-sm">
          <strong>📊 Classement en Temps Réel:</strong> Les tableaux se mettent à jour automatiquement avec les résultats des matchs.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {tables.map((table, idx) => (
          <div key={idx} className="glass p-6 rounded-lg border border-ocean-500/20">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-3xl">{table.icon}</span>
              <h3 className="text-xl font-bold text-white">{table.name}</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ocean-500/30">
                    <th className="text-left py-3 px-3 text-ocean-300 font-semibold">Pos</th>
                    <th className="text-left py-3 px-3 text-ocean-300 font-semibold">Équipe</th>
                    <th className="text-center py-3 px-3 text-ocean-300 font-semibold">V-D</th>
                    <th className="text-right py-3 px-3 text-ocean-300 font-semibold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.teams.map((team) => (
                    <tr key={team.position} className="border-b border-ocean-500/10 hover:bg-ocean-500/5 transition-smooth">
                      <td className="py-3 px-3">
                        <span className="font-bold text-ocean-400">{team.position}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div>
                          <p className="text-white font-medium">{team.name}</p>
                          <p className="text-xs text-ocean-400 mt-1">
                            {team.players.join(' & ')}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-ocean-200 font-semibold">
                          {team.wins}-{team.losses}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="font-bold text-accent-gold">{team.points}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="glass p-6 rounded-lg border border-ocean-500/20">
        <h3 className="text-xl font-bold text-white mb-6">Résumé du Tournoi</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-dark-800/50 rounded-lg">
            <p className="text-ocean-300 text-sm mb-1">Total Matchs</p>
            <p className="text-2xl font-bold text-ocean-400">12</p>
          </div>
          <div className="p-4 bg-dark-800/50 rounded-lg">
            <p className="text-ocean-300 text-sm mb-1">Terminés</p>
            <p className="text-2xl font-bold text-accent-gold">8</p>
          </div>
          <div className="p-4 bg-dark-800/50 rounded-lg">
            <p className="text-ocean-300 text-sm mb-1">En cours</p>
            <p className="text-2xl font-bold text-orange-400">2</p>
          </div>
          <div className="p-4 bg-dark-800/50 rounded-lg">
            <p className="text-ocean-300 text-sm mb-1">En attente</p>
            <p className="text-2xl font-bold text-ocean-300">2</p>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="glass p-6 rounded-lg border border-ocean-500/20">
        <h3 className="text-xl font-bold text-white mb-4">Actions</h3>
        <div className="flex gap-4 flex-wrap">
          <button className="px-6 py-2 rounded-lg bg-ocean-500/20 hover:bg-ocean-500/30 text-ocean-300 font-semibold transition-smooth">
            📋 Télécharger PDF
          </button>
          <button className="px-6 py-2 rounded-lg bg-ocean-500/20 hover:bg-ocean-500/30 text-ocean-300 font-semibold transition-smooth">
            📊 Exporter Excel
          </button>
          <button className="px-6 py-2 rounded-lg bg-ocean-500/20 hover:bg-ocean-500/30 text-ocean-300 font-semibold transition-smooth">
            🔄 Actualiser
          </button>
        </div>
      </div>
    </div>
  );
}
