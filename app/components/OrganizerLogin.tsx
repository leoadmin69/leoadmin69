'use client'

import React, { useState } from 'react'

interface OrganizerLoginProps {
  onLogin: (token: string) => void
}

export default function OrganizerLogin({ onLogin }: OrganizerLoginProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/organizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Authentification échouée')
      }

      onLogin(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d\'authentification')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-card border border-accent p-8 rounded-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-accent-gold mb-6">Accès Organisateurs</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 bg-dark border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            disabled={loading}
          />
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-accent hover:bg-accent/80 disabled:bg-gray-600 text-dark font-bold rounded transition"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
