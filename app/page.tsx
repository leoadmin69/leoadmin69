'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import TeamRegistrationForm from './components/TeamRegistrationForm'
import OrganizerLogin from './components/OrganizerLogin'
import OrganizerPortal from './components/OrganizerPortal'

const Racket3D = dynamic(() => import('./components/Racket3D'), { ssr: false })

export default function Home() {
  const [isOrganizerLoggedIn, setIsOrganizerLoggedIn] = useState(false)
  const [organizerToken, setOrganizerToken] = useState('')
  const [activeSection, setActiveSection] = useState('home')

  const handleOrganizerLogin = (token: string) => {
    setOrganizerToken(token)
    setIsOrganizerLoggedIn(true)
    setActiveSection('organizer')
  }

  const handleOrganizerLogout = () => {
    setIsOrganizerLoggedIn(false)
    setOrganizerToken('')
    setActiveSection('home')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark via-dark-card to-dark">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-dark/80 backdrop-blur border-b border-accent/20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold gradient-text">🏐 Bizerte Beach Tennis</h1>
          <div className="flex gap-4">
            {!isOrganizerLoggedIn && (
              <button
                onClick={() => setActiveSection('organizer')}
                className="px-4 py-2 text-sm border border-accent/50 hover:border-accent rounded text-accent hover:bg-accent/10 transition"
              >
                Espace Organisateurs
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Organizer Login Modal */}
      {activeSection === 'organizer' && !isOrganizerLoggedIn && (
        <OrganizerLogin onLogin={handleOrganizerLogin} />
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        {isOrganizerLoggedIn ? (
          // Organizer Portal
          <OrganizerPortal onLogout={handleOrganizerLogout} />
        ) : (
          <>
            {/* Hero Section */}
            <section id="home" className="mb-20">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-5xl font-bold mb-6 leading-tight">
                    <span className="gradient-text">Premier Événement</span>
                    <br />
                    Beach Tennis en Tunisie
                  </h2>
                  <p className="text-lg text-gray-300 mb-4">
                    Découvrez une expérience unique alliant sport, musique et convivialité sur les magnifiques plages de Bizerte en Méditerranée.
                  </p>
                  <p className="text-gray-400 mb-8">
                    <strong>2 Jours d'événement:</strong> Initiations, tournois amicaux, tournoi officiel et partage en famille.
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setActiveSection('registration')
                        document.getElementById('registration')?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="px-8 py-3 bg-accent hover:bg-accent/80 text-dark font-bold rounded transition card-shadow"
                    >
                      S'inscrire Maintenant
                    </button>
                    <button
                      onClick={() => {
                        setActiveSection('concept')
                        document.getElementById('concept')?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="px-8 py-3 border-2 border-accent text-accent hover:bg-accent/10 font-bold rounded transition"
                    >
                      En Savoir Plus
                    </button>
                  </div>
                </div>
                <div>
                  <Racket3D />
                </div>
              </div>
            </section>

            {/* Concept Section */}
            <section id="concept" className="mb-20 scroll-mt-20">
              <div className="bg-dark-card border border-accent/30 rounded-lg p-8 card-shadow">
                <h2 className="text-4xl font-bold text-accent-gold mb-8">Le Concept</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-4">
                    <div className="text-4xl">🏐</div>
                    <h3 className="text-xl font-bold text-accent">Sport d'Excellence</h3>
                    <p className="text-gray-400">
                      Tournoi de Beach Tennis mêlant initiations, matchs amicaux et compétition officielle dans l'atmosphère chaleureuse de la Méditerranée.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="text-4xl">🎵</div>
                    <h3 className="text-xl font-bold text-accent">Ambiance Festive</h3>
                    <p className="text-gray-400">
                      Musique live, animations et partage convivial pour créer une expérience inoubliable entre passion du sport et plaisir de se rencontrer.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="text-4xl">🌊</div>
                    <h3 className="text-xl font-bold text-accent">Cadre Unique</h3>
                    <p className="text-gray-400">
                      Les plus belles plages de Bizerte en bord de Méditerranée pour un événement mémorable alliant sport, nature et joie de vivre tunisienne.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Registration Section */}
            <section id="registration" className="mb-20 scroll-mt-20">
              <h2 className="text-4xl font-bold text-accent-gold mb-8">Inscription Équipe Mixte</h2>
              <div className="bg-dark-card border border-accent/30 rounded-lg p-8 card-shadow">
                <div className="mb-6 p-4 bg-accent/10 border border-accent/30 rounded">
                  <p className="text-gray-300">
                    <strong className="text-accent">Composition obligatoire:</strong> 1 Homme + 1 Femme par équipe
                  </p>
                </div>
                <TeamRegistrationForm />
              </div>
            </section>

            {/* Pricing Section */}
            <section className="mb-20">
              <h2 className="text-4xl font-bold text-accent-gold mb-8">Tarifs & Paiement</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-dark-card border border-accent/30 rounded-lg p-8 card-shadow">
                  <h3 className="text-2xl font-bold text-accent-gold mb-4">80 DT / Équipe</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li>✓ Adultes Confirmés</li>
                    <li>✓ Adultes Intermédiaires</li>
                  </ul>
                </div>
                <div className="bg-dark-card border border-accent/30 rounded-lg p-8 card-shadow">
                  <h3 className="text-2xl font-bold text-accent-gold mb-4">50 DT / Équipe</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li>✓ Étudiants</li>
                    <li>✓ Moins de 18 ans</li>
                    <li>✓ Adultes Débutants</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Partners Section */}
            <section id="partners" className="mb-20 scroll-mt-20">
              <h2 className="text-4xl font-bold text-accent-gold mb-8">Partenaires & Sponsoring</h2>
              <div className="bg-dark-card border border-accent/30 rounded-lg p-8 card-shadow">
                <h3 className="text-2xl font-bold text-accent mb-6">Rejoignez-nous en tant que partenaire</h3>
                <form className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <input
                      type="text"
                      placeholder="Nom de l'entreprise"
                      className="px-4 py-2 bg-dark border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                    />
                    <input
                      type="email"
                      placeholder="Email de contact"
                      className="px-4 py-2 bg-dark border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                    />
                    <input
                      type="tel"
                      placeholder="Téléphone"
                      className="px-4 py-2 bg-dark border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                    />
                    <select className="px-4 py-2 bg-dark border border-accent/30 rounded text-white focus:outline-none focus:border-accent">
                      <option>Type de partenariat</option>
                      <option>Sponsoring</option>
                      <option>Partenariat média</option>
                      <option>Autre</option>
                    </select>
                  </div>
                  <textarea
                    placeholder="Message et détails du partenariat"
                    rows={4}
                    className="w-full px-4 py-2 bg-dark border border-accent/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    className="w-full px-6 py-3 bg-accent-gold hover:bg-yellow-600 text-dark font-bold rounded transition"
                  >
                    Envoyer votre demande
                  </button>
                </form>
              </div>
            </section>

            {/* Rules Section */}
            <section className="mb-20">
              <h2 className="text-4xl font-bold text-accent-gold mb-8">Règles du Tournoi</h2>
              <div className="bg-dark-card border border-accent/30 rounded-lg p-8 card-shadow">
                <div className="space-y-8">
                  <div>
                    <h3 className="text-2xl font-bold text-accent mb-4">Format Flash (Max 30 min)</h3>
                    <ul className="space-y-2 text-gray-300">
                      <li>• 2 Sets de 4 jeux (première équipe à 4)</li>
                      <li>• À 3-3 → Tie-break en 5 points</li>
                      <li>• Point Décisif (No-Ad) à 40-40</li>
                      <li>• Super Tie-break en 7 points si 1 set partout (2 points d'écart)</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-accent mb-4">Système de Tableaux</h3>
                    <div className="space-y-3 text-gray-300">
                      <p><strong>Ronde 1:</strong> Qualifications (1/8 de finale) - Vainqueurs → OR, Perdants → BRONZE</p>
                      <p><strong>Ronde 2:</strong> Quarts - Vainqueurs restent dans leur tableau, Perdants descendent</p>
                      <p><strong>Rondes 3 & 4:</strong> Demi-finales & Finales avec classement final</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Contact Section */}
            <section className="mb-20">
              <h2 className="text-4xl font-bold text-accent-gold mb-8">Nous Contacter</h2>
              <div className="bg-dark-card border border-accent/30 rounded-lg p-8 card-shadow text-center">
                <p className="text-gray-300 mb-4">Pour toute question ou information supplémentaire:</p>
                <p className="text-2xl font-bold text-accent mb-2">📧 bizertebtf@gmail.com</p>
                <p className="text-gray-400">Plage de Bizerte, Méditerranée - Tunisie</p>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-accent/20 bg-dark/50 mt-20 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500">
          <p>&copy; 2024 Bizerte Beach Tennis. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  )
}
