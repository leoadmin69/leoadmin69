'use client'

import React, { useState } from 'react'

export default function TeamRegistrationForm() {
  const [formData, setFormData] = useState({
    player1_name: '',
    player1_surname: '',
    player1_age: '',
    player1_nationality: '',
    player1_governorate: '',
    player1_phone: '',
    player1_email: '',
    player1_level: 'Intermédiaire',
    player1_is_captain: false,
    player2_name: '',
    player2_surname: '',
    player2_age: '',
    player2_nationality: '',
    player2_governorate: '',
    player2_phone: '',
    player2_email: '',
    player2_level: 'Intermédiaire',
    player2_is_captain: false,
    rackets_needed: 0,
    food_options: [],
    payment_method: 'cash',
    payment_split: 'single',
  })

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/teams/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'enregistrement')
      }

      setMessage(`✓ Inscription réussie! ID équipe: ${data.teamId}. Coût: ${data.cost} DT`)
      setFormData({
        player1_name: '',
        player1_surname: '',
        player1_age: '',
        player1_nationality: '',
        player1_governorate: '',
        player1_phone: '',
        player1_email: '',
        player1_level: 'Intermédiaire',
        player1_is_captain: false,
        player2_name: '',
        player2_surname: '',
        player2_age: '',
        player2_nationality: '',
        player2_governorate: '',
        player2_phone: '',
        player2_email: '',
        player2_level: 'Intermédiaire',
        player2_is_captain: false,
        rackets_needed: 0,
        food_options: [],
        payment_method: 'cash',
        payment_split: 'single',
      })
    } catch (error) {
      setMessage(`✗ ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Joueur 1 */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-accent">Joueur 1 (Homme)</h3>
          <input
            type="text"
            name="player1_name"
            placeholder="Prénom"
            value={formData.player1_name}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            name="player1_surname"
            placeholder="Nom"
            value={formData.player1_surname}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="number"
            name="player1_age"
            placeholder="Âge"
            value={formData.player1_age}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="email"
            name="player1_email"
            placeholder="Email"
            value={formData.player1_email}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="tel"
            name="player1_phone"
            placeholder="Téléphone"
            value={formData.player1_phone}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <select
            name="player1_level"
            value={formData.player1_level}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white focus:outline-none focus:border-accent"
          >
            <option>Débutant</option>
            <option>Intermédiaire</option>
            <option>Confirmé</option>
          </select>
          <label className="flex items-center space-x-2 text-gray-400">
            <input
              type="checkbox"
              name="player1_is_captain"
              checked={formData.player1_is_captain}
              onChange={handleChange}
              className="accent-accent"
            />
            <span>Capitaine</span>
          </label>
        </div>

        {/* Joueur 2 */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-accent">Joueur 2 (Femme)</h3>
          <input
            type="text"
            name="player2_name"
            placeholder="Prénom"
            value={formData.player2_name}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            name="player2_surname"
            placeholder="Nom"
            value={formData.player2_surname}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="number"
            name="player2_age"
            placeholder="Âge"
            value={formData.player2_age}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="email"
            name="player2_email"
            placeholder="Email"
            value={formData.player2_email}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <input
            type="tel"
            name="player2_phone"
            placeholder="Téléphone"
            value={formData.player2_phone}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <select
            name="player2_level"
            value={formData.player2_level}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-dark-card border border-accent/30 rounded text-white focus:outline-none focus:border-accent"
          >
            <option>Débutant</option>
            <option>Intermédiaire</option>
            <option>Confirmé</option>
          </select>
          <label className="flex items-center space-x-2 text-gray-400">
            <input
              type="checkbox"
              name="player2_is_captain"
              checked={formData.player2_is_captain}
              onChange={handleChange}
              className="accent-accent"
            />
            <span>Capitaine</span>
          </label>
        </div>
      </div>

      {/* Logistique */}
      <div className="space-y-4 p-4 bg-dark-card rounded border border-accent/30">
        <h3 className="text-lg font-bold text-accent-gold">Logistique</h3>
        <div>
          <label className="block text-gray-400 mb-2">Raquettes nécessaires</label>
          <select
            name="rackets_needed"
            value={formData.rackets_needed}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-dark border border-accent/30 rounded text-white"
          >
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </div>
      </div>

      {/* Paiement */}
      <div className="space-y-4 p-4 bg-dark-card rounded border border-accent/30">
        <h3 className="text-lg font-bold text-accent-gold">Paiement</h3>
        <div>
          <label className="block text-gray-400 mb-2">Tarif</label>
          <p className="text-accent font-bold">80 DT (Adultes Confirmés/Intermédiaires) ou 50 DT (Étudiants/-18 ans/Débutants)</p>
        </div>
        <div>
          <label className="block text-gray-400 mb-2">Méthode de paiement</label>
          <select
            name="payment_method"
            value={formData.payment_method}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-dark border border-accent/30 rounded text-white"
          >
            <option value="cash">Cash</option>
            <option value="online">En ligne</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-accent hover:bg-accent/80 disabled:bg-gray-600 text-dark font-bold rounded transition"
      >
        {loading ? 'Enregistrement...' : 'Enregistrer l\'équipe'}
      </button>

      {message && (
        <div
          className={`p-4 rounded ${
            message.startsWith('✓')
              ? 'bg-green-900/20 border border-green-500 text-green-400'
              : 'bg-red-900/20 border border-red-500 text-red-400'
          }`}
        >
          {message}
        </div>
      )}
    </form>
  )
}
