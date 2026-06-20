'use client';

import { useState, useEffect } from 'react';

interface TeamData {
  id: string;
  teamId: string;
  teamName: string;
  player1: string;
  player2: string;
  level: string;
  paymentStatus: 'pending' | 'confirmed' | 'cancelled';
  paymentMethod: string;
  registrationDate: string;
}

export default function TeamManagement() {
  const [teams, setTeams] = useState<TeamData[]>([
    {
      id: '1',
      teamId: 'BTBF-001',
      teamName: 'Équipe Alpha',
      player1: 'Joueur 1 (H)',
      player2: 'Joueuse 1 (F)',
      level: 'Confirmé',
      paymentStatus: 'confirmed',
      paymentMethod: 'online',
      registrationDate: '2024-01-15',
    },
    {
      id: '2',
      teamId: 'BTBF-002',
      teamName: 'Équipe Beta',
      player1: 'Joueur 2 (H)',
      player2: 'Joueuse 2 (F)',
      level: 'Intermédiaire',
      paymentStatus: 'pending',
      paymentMethod: 'cash',
      registrationDate: '2024-01-16',
    },
  ]);

  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'confirmed'>('all');

  const filteredTeams = teams.filter((team) => {
    if (filterStatus === 'all') return true;
    return team.paymentStatus === filterStatus;
  });

  const confirmedCount = teams.filter((t) => t.paymentStatus === 'confirmed').length;
  const pendingCount = teams.filter((t) => t.paymentStatus === 'pending').length;

  const updatePaymentStatus = (teamId: string, status: 'confirmed' | 'cancelled') => {
    setTeams((prev) =>
      prev.map((team) =>
        team.id === teamId ? { ...team, paymentStatus: status } : team
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-6 rounded-lg border border-ocean-500/20">
          <p className="text-ocean-300 text-sm mb-1">Total d'équipes</p>
          <p className="text-3xl font-bold text-ocean-400">{teams.length}</p>
        </div>
        <div className="glass p-6 rounded-lg border border-ocean-500/20">
          <p className="text-ocean-300 text-sm mb-1">Paiements confirmés</p>
          <p className="text-3xl font-bold text-accent-gold">{confirmedCount}</p>
          <p className="text-xs text-ocean-300 mt-1">{Math.round((confirmedCount / teams.length) * 100)}%</p>
        </div>
        <div className="glass p-6 rounded-lg border border-ocean-500/20">
          <p className="text-ocean-300 text-sm mb-1">En attente</p>
          <p className="text-3xl font-bold text-orange-400">{pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'confirmed', 'pending'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg font-medium transition-smooth ${
              filterStatus === status
                ? 'bg-ocean-500/30 border border-ocean-400 text-ocean-200'
                : 'glass border border-ocean-500/20 text-ocean-300 hover:border-ocean-400/50'
            }`}
          >
            {status === 'all' ? 'Tous' : status === 'confirmed' ? '✓ Confirmés' : '⏳ En attente'}
          </button>
        ))}
      </div>

      {/* Teams Table */}
      <div className="glass p-6 rounded-lg border border-ocean-500/20 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ocean-500/30">
              <th className="text-left py-3 px-3 text-ocean-300 font-semibold">ID Équipe</th>
              <th className="text-left py-3 px-3 text-ocean-300 font-semibold">Équipe</th>
              <th className="text-left py-3 px-3 text-ocean-300 font-semibold">Joueurs</th>
              <th className="text-center py-3 px-3 text-ocean-300 font-semibold">Niveau</th>
              <th className="text-center py-3 px-3 text-ocean-300 font-semibold">Statut</th>
              <th className="text-center py-3 px-3 text-ocean-300 font-semibold">Paiement</th>
              <th className="text-center py-3 px-3 text-ocean-300 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeams.map((team) => (
              <tr key={team.id} className="border-b border-ocean-500/10 hover:bg-ocean-500/5 transition-smooth">
                <td className="py-4 px-3">
                  <code className="text-ocean-400 font-mono text-xs">{team.teamId}</code>
                </td>
                <td className="py-4 px-3">
                  <p className="text-white font-medium">{team.teamName}</p>
                  <p className="text-xs text-ocean-400 mt-1">{team.registrationDate}</p>
                </td>
                <td className="py-4 px-3">
                  <div className="text-xs space-y-1">
                    <p className="text-ocean-200">{team.player1}</p>
                    <p className="text-ocean-200">{team.player2}</p>
                  </div>
                </td>
                <td className="py-4 px-3 text-center">
                  <span className="text-xs font-semibold text-ocean-400">{team.level}</span>
                </td>
                <td className="py-4 px-3 text-center">
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                      team.paymentStatus === 'confirmed'
                        ? 'bg-accent-gold/20 text-accent-gold'
                        : team.paymentStatus === 'pending'
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {team.paymentStatus === 'confirmed'
                      ? '✓ Confirmé'
                      : team.paymentStatus === 'pending'
                      ? '⏳ En attente'
                      : '✗ Annulé'}
                  </span>
                </td>
                <td className="py-4 px-3 text-center">
                  <span className="text-xs text-ocean-300">{team.paymentMethod === 'online' ? '💳' : '💵'}</span>
                </td>
                <td className="py-4 px-3 text-center">
                  {team.paymentStatus === 'pending' && (
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => updatePaymentStatus(team.id, 'confirmed')}
                        className="px-2 py-1 text-xs rounded bg-accent-gold/20 hover:bg-accent-gold/30 text-accent-gold font-semibold transition-smooth"
                      >
                        Confirmer
                      </button>
                      <button
                        onClick={() => updatePaymentStatus(team.id, 'cancelled')}
                        className="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold transition-smooth"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredTeams.length === 0 && (
          <div className="text-center py-8">
            <p className="text-ocean-300">Aucune équipe à afficher</p>
          </div>
        )}
      </div>

      {/* Export */}
      <div className="flex gap-4">
        <button className="px-6 py-2 rounded-lg bg-ocean-500/20 hover:bg-ocean-500/30 text-ocean-300 font-semibold transition-smooth">
          📋 Télécharger Liste
        </button>
        <button className="px-6 py-2 rounded-lg bg-ocean-500/20 hover:bg-ocean-500/30 text-ocean-300 font-semibold transition-smooth">
          📧 Envoyer Rappel Paiement
        </button>
      </div>
    </div>
  );
}
