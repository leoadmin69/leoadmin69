'use client';

import { useState, useEffect } from 'react';
import TournamentDraw from './tournament/TournamentDraw';
import LiveScoring from './tournament/LiveScoring';
import TournamentTables from './tournament/TournamentTables';
import TeamManagement from './tournament/TeamManagement';

type TabType = 'teams' | 'draw' | 'scoring' | 'results';

interface TournamentDashboardProps {
  onLogout: () => void;
}

export default function TournamentDashboard({ onLogout }: TournamentDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('teams');
  const [totalTeams, setTotalTeams] = useState(0);
  const [tournamentStarted, setTournamentStarted] = useState(false);

  useEffect(() => {
    // Fetch tournament data
    const fetchData = async () => {
      try {
        const response = await fetch('/api/organizer/tournament');
        if (response.ok) {
          const data = await response.json();
          setTotalTeams(data.totalTeams || 0);
          setTournamentStarted(data.status === 'active');
        }
      } catch (error) {
        console.error('Failed to fetch tournament data:', error);
      }
    };
    fetchData();
  }, []);

  const tabs: Array<{ id: TabType; label: string; icon: string }> = [
    { id: 'teams', label: 'Équipes', icon: '👥' },
    { id: 'draw', label: 'Tirage au Sort', icon: '🎲' },
    { id: 'scoring', label: 'Scores (Live)', icon: '📊' },
    { id: 'results', label: 'Résultats', icon: '🏆' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Tableau de Bord Tournoi
          </h2>
          <p className="text-ocean-300">
            {tournamentStarted ? '🔴 Tournoi en cours' : '🟢 En préparation'}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="px-6 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-smooth"
        >
          Déconnexion
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass p-6 rounded-lg border border-ocean-500/20">
          <p className="text-ocean-300 text-sm mb-1">Total d'équipes</p>
          <p className="text-3xl font-bold text-ocean-400">{totalTeams}</p>
        </div>
        <div className="glass p-6 rounded-lg border border-ocean-500/20">
          <p className="text-ocean-300 text-sm mb-1">Statut</p>
          <p className="text-lg font-semibold text-ocean-400">
            {tournamentStarted ? 'En cours' : 'Planification'}
          </p>
        </div>
        <div className="glass p-6 rounded-lg border border-ocean-500/20">
          <p className="text-ocean-300 text-sm mb-1">Matchs prévus</p>
          <p className="text-3xl font-bold text-ocean-400">
            {totalTeams > 0 ? totalTeams - 1 : 0}
          </p>
        </div>
        <div className="glass p-6 rounded-lg border border-ocean-500/20">
          <p className="text-ocean-300 text-sm mb-1">Tableaux</p>
          <p className="text-lg font-semibold text-accent-gold">OR, AR, BZ, CU</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 rounded-lg font-semibold transition-smooth whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-ocean-400 to-ocean-600 text-white shadow-glow'
                : 'glass border border-ocean-500/20 text-ocean-300 hover:border-ocean-400/50'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-96">
        {activeTab === 'teams' && <TeamManagement />}
        {activeTab === 'draw' && <TournamentDraw totalTeams={totalTeams} />}
        {activeTab === 'scoring' && <LiveScoring />}
        {activeTab === 'results' && <TournamentTables />}
      </div>
    </div>
  );
}
