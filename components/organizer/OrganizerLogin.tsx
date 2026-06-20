'use client';

import { useState } from 'react';

interface OrganizerLoginProps {
  onAuthenticate: (value: boolean) => void;
}

export default function OrganizerLogin({ onAuthenticate }: OrganizerLoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/organizer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        onAuthenticate(true);
      } else {
        setError('Mot de passe incorrect');
      }
    } catch {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 max-w-md mx-auto">
      <div className="text-5xl mb-6">🔐</div>
      <h2 className="text-2xl font-bold text-white mb-2 text-center">
        Accès Sécurisé
      </h2>
      <p className="text-ocean-300 text-center mb-8">
        Entrez le mot de passe pour accéder au tableau de bord du tournoi
      </p>

      <form onSubmit={handleLogin} className="w-full space-y-4">
        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            className="w-full px-4 py-3 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none focus:ring-2 focus:ring-ocean-500/20"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-ocean-400 to-ocean-600 text-white font-semibold hover:shadow-glow transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Vérification...' : 'Se connecter'}
        </button>
      </form>

      <div className="mt-8 p-4 bg-ocean-500/10 border border-ocean-500/30 rounded-lg text-ocean-200 text-sm">
        <p>
          <strong>💡 Pour les tests:</strong> Utilisez le mot de passe <code className="text-ocean-400">admin2024</code>
        </p>
      </div>
    </div>
  );
}
