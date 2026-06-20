'use client'

import React, { useState, useEffect } from 'react'
import { getAllMatches } from '@/lib/tournament'

interface Match {
  id: string
  round: number
  bracket: string
  team1_score?: string
  team2_score?: string
  winner_id?: string
  status: string
}

export default function OrganizerPortal({ onLogout }: { onLogout: () => void }) {
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [team1Score, setTeam1Score] = useState('')
  const [team2Score, setTeam2Score] = useState('')
  const [winnerId, setWinnerId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const response = await fetch('/api/matches/list')
        const data = await response.json()
        setMatches(data)
      } catch (error) {
        console.error('Error fetching matches:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchMatches()
  }, [])

  const handleUpdateScore = async () => {
    if (!selectedMatch || !team1Score || !team2Score || !winnerId) {
      alert('Veuillez remplir tous les champs')
      return
    }

    try {
      const response = await fetch('/api/matches/update-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          team1_score: team1Score,
          team2_score: team2Score,
          winner_id: winnerId,
        }),
      })

      if (response.ok) {
        alert('Score mis à jour avec succès!')
        setTeam1Score('')
        setTeam2Score('')
        setWinnerId('')
        setSelectedMatch(null)

        const updatedResponse = await fetch('/api/matches/list')
        const updatedData = await updatedResponse.json()
        setMatches(updatedData)
      }
    } catch (error) {
      console.error('Error updating score:', error)
      alert('Erreur lors de la mise à jour du score')
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-accent">Chargement...</div>
  }

  const brackets = ['OR', 'ARGENT', 'BRONZE', 'CUIVRE']

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-accent">Espace Organisateurs</h2>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          Déconnexion
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Matchs */}
        <div>
          <h3 className="text-2xl font-bold text-accent-gold mb-4">Matchs</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {matches.map((match) => (
              <div
                key={match.id}
                onClick={() => setSelectedMatch(match)}
                className={`p-4 rounded cursor-pointer transition ${
                  selectedMatch?.id === match.id
                    ? 'bg-accent/20 border border-accent'
                    : 'bg-dark-card border border-accent/30 hover:border-accent'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-mono text-accent-gold">{match.bracket}</span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    match.status === 'completed' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'
                  }`}>
                    {match.status === 'completed' ? 'Joué' : 'À jouer'}
                  </span>
                </div>
                <div className="text-sm text-gray-400">Round {match.round}</div>
                {match.status === 'completed' && (
                  <div className="mt-2 text-accent font-bold">
                    {match.team1_score} - {match.team2_score}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Formulaire de score */}
        {selectedMatch && (
          <div className="bg-dark-card border border-accent/30 rounded p-6">
            <h3 className="text-2xl font-bold text-accent-gold mb-4">Enregistrer le score</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 mb-2">Équipe 1: Score</label>
                <input
                  type="text"
                  placeholder="ex: 4-2, 3-4, 5-3"
                  value={team1Score}
                  onChange={(e) => setTeam1Score(e.target.value)}
                  className="w-full px-4 py-2 bg-dark border border-accent/30 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-2">Équipe 2: Score</label>
                <input
                  type="text"
                  placeholder="ex: 4-2, 3-4, 5-3"
                  value={team2Score}
                  onChange={(e) => setTeam2Score(e.target.value)}
                  className="w-full px-4 py-2 bg-dark border border-accent/30 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-2">Équipe gagnante (ID)</label>
                <input
                  type="text"
                  placeholder="ID de l'équipe gagnante"
                  value={winnerId}
                  onChange={(e) => setWinnerId(e.target.value)}
                  className="w-full px-4 py-2 bg-dark border border-accent/30 rounded text-white"
                />
              </div>
              <button
                onClick={handleUpdateScore}
                className="w-full px-4 py-2 bg-accent hover:bg-accent/80 text-dark font-bold rounded transition"
              >
                Valider le score
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vue par tableau */}
      <div className="space-y-6">
        {brackets.map((bracket) => (
          <div key={bracket} className="bg-dark-card border border-accent/30 rounded p-6">
            <h4 className="text-xl font-bold text-accent-gold mb-4">Tableau {bracket}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matches
                .filter((m) => m.bracket === bracket)
                .map((match) => (
                  <div key={match.id} className="bg-dark p-3 rounded border border-accent/20">
                    <div className="text-sm text-gray-400 mb-2">Round {match.round}</div>
                    {match.status === 'completed' ? (
                      <div className="text-accent font-bold text-center">
                        {match.team1_score} - {match.team2_score}
                      </div>
                    ) : (
                      <div className="text-gray-500 text-sm text-center">À jouer</div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
