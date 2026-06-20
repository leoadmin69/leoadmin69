'use client';

import { useState } from 'react';
import SponsorshipForm from '@/components/forms/SponsorshipForm';

export default function PartnersSection() {
  const [showForm, setShowForm] = useState(false);

  const sponsorshipLevels = [
    {
      name: 'Platinum',
      color: 'from-gray-300 to-gray-400',
      benefits: [
        'Logo visible à l\'entrée',
        'Logo sur les t-shirts',
        'Booth dédié sur site',
        'Présence lors de la cérémonie',
        'Montant: Négocié',
      ],
    },
    {
      name: 'Gold',
      color: 'from-accent-gold to-orange-500',
      benefits: [
        'Logo visible à l\'entrée',
        'Logo sur les affiches',
        'Booth partagé',
        'Montant: 5000 DT+',
      ],
    },
    {
      name: 'Silver',
      color: 'from-gray-400 to-gray-300',
      benefits: [
        'Logo sur les affiches',
        'Mention sur les réseaux',
        'Invitation aux finales',
        'Montant: 2500 DT+',
      ],
    },
    {
      name: 'Partner',
      color: 'from-accent-bronze to-accent-copper',
      benefits: [
        'Logo sur la page partenaires',
        'Mention sur les réseaux',
        'Tarif flexibilité',
        'Montant: Négocié',
      ],
    },
  ];

  return (
    <section id="partners" className="relative py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-dark-950 via-dark-900 to-dark-950">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-4xl lg:text-5xl font-bold gradient-text">
            Partenaires & Sponsoring
          </h2>
          <p className="text-lg text-ocean-200 max-w-2xl mx-auto">
            Devenez partenaire du premier événement Beach Tennis de Tunisie
          </p>
        </div>

        {/* Sponsorship Levels */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {sponsorshipLevels.map((level, idx) => (
            <div
              key={idx}
              className={`glass p-6 rounded-xl border border-ocean-500/20 hover:border-ocean-400/50 transition-smooth`}
            >
              <div className={`h-1 w-16 bg-gradient-to-r ${level.color} rounded-full mb-4`} />
              <h3 className={`text-xl font-bold mb-4 bg-gradient-to-r ${level.color} bg-clip-text text-transparent`}>
                {level.name}
              </h3>
              <ul className="space-y-3">
                {level.benefits.map((benefit, bidx) => (
                  <li key={bidx} className="flex gap-3 items-start">
                    <span className="text-ocean-400 mt-1">✓</span>
                    <span className="text-sm text-ocean-100">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mb-12">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-8 py-4 rounded-lg bg-gradient-to-r from-accent-gold to-orange-600 text-dark-950 font-semibold text-lg hover:shadow-glow-orange transition-smooth"
          >
            {showForm ? 'Masquer le formulaire' : 'Devenir Partenaire'}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="glass p-8 rounded-xl border border-ocean-500/20 max-w-2xl mx-auto">
            <SponsorshipForm onSuccess={() => setShowForm(false)} />
          </div>
        )}

        {/* Why Partner */}
        <div className="mt-16 glass p-8 rounded-xl border border-ocean-500/20">
          <h3 className="text-2xl font-bold text-white mb-6">Pourquoi Nous Soutenir?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <div className="text-3xl">👥</div>
              <h4 className="font-semibold text-ocean-400">Audience Qualifiée</h4>
              <p className="text-ocean-100 text-sm">
                Connexion avec plus de 500 participants et partenaires de la région
              </p>
            </div>
            <div className="space-y-3">
              <div className="text-3xl">📱</div>
              <h4 className="font-semibold text-ocean-400">Médiatisation</h4>
              <p className="text-ocean-100 text-sm">
                Visibilité sur les réseaux sociaux et presse locale/nationale
              </p>
            </div>
            <div className="space-y-3">
              <div className="text-3xl">🎯</div>
              <h4 className="font-semibold text-ocean-400">Engagement RSE</h4>
              <p className="text-ocean-100 text-sm">
                Contribuer au développement du sport en Tunisie
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
