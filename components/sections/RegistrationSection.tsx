'use client';

import { useState } from 'react';
import RegistrationForm from '@/components/forms/RegistrationForm';

export default function RegistrationSection() {
  const [showForm, setShowForm] = useState(false);
  const [registeredTeams, setRegisteredTeams] = useState(0);

  const handleTeamRegistered = () => {
    setRegisteredTeams((prev) => prev + 1);
  };

  return (
    <section id="registration" className="relative py-24 px-4 sm:px-6 lg:px-8">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-ocean-500/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-4xl lg:text-5xl font-bold gradient-text">
            Inscription des Équipes
          </h2>
          <p className="text-lg text-ocean-200 max-w-2xl mx-auto">
            Formez votre équipe mixte (1 Homme + 1 Femme) et rejoignez l'aventure Bizerte Beach Tennis
          </p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="glass p-6 rounded-xl border border-ocean-500/20 text-center">
            <div className="text-4xl font-bold gradient-text mb-2">{registeredTeams}</div>
            <p className="text-ocean-300">Équipes inscrites</p>
          </div>
          <div className="glass p-6 rounded-xl border border-ocean-500/20 text-center">
            <div className="text-4xl font-bold text-accent-gold mb-2">80 DT</div>
            <p className="text-ocean-300">Confirmés / Intermédiaires</p>
          </div>
          <div className="glass p-6 rounded-xl border border-ocean-500/20 text-center">
            <div className="text-4xl font-bold text-accent-gold mb-2">50 DT</div>
            <p className="text-ocean-300">Débutants / Étudiants / -18ans</p>
          </div>
        </div>

        {/* Form Section */}
        {!showForm ? (
          <div className="text-center">
            <button
              onClick={() => setShowForm(true)}
              className="px-8 py-4 rounded-lg bg-gradient-to-r from-ocean-400 to-ocean-600 text-white font-semibold text-lg hover:shadow-glow transition-smooth mb-6"
            >
              Démarrer l'inscription
            </button>
            <p className="text-ocean-200 text-sm">
              Cliquez pour remplir le formulaire d'inscription de votre équipe
            </p>
          </div>
        ) : (
          <div className="glass p-8 rounded-xl border border-ocean-500/20">
            <button
              onClick={() => setShowForm(false)}
              className="mb-6 text-ocean-300 hover:text-ocean-400 transition-smooth flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5m7 7l-7-7 7-7" />
              </svg>
              Retour
            </button>
            <RegistrationForm onSuccess={() => {
              handleTeamRegistered();
              setShowForm(false);
            }} />
          </div>
        )}

        {/* Payment Instructions */}
        <div className="mt-16 glass p-8 rounded-xl border border-ocean-500/20">
          <h3 className="text-2xl font-bold text-white mb-6">💳 Modalités de Paiement</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-ocean-400 mb-4">Paiement En Ligne</h4>
              <p className="text-ocean-100 mb-3">
                Sécurisé et instantané via notre plateforme:
              </p>
              <ul className="space-y-2 text-ocean-100 text-sm">
                <li>✓ Carte bancaire (Visa/Mastercard)</li>
                <li>✓ Portefeuille électronique</li>
                <li>✓ Confirmation immédiate</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-ocean-400 mb-4">Paiement Cash</h4>
              <p className="text-ocean-100 mb-3">
                Sur place au jour de l'événement:
              </p>
              <ul className="space-y-2 text-ocean-100 text-sm">
                <li>✓ À la réception le jour J</li>
                <li>✓ Apportez votre ID de confirmation</li>
                <li>✓ Espèces uniquement</li>
              </ul>
            </div>
          </div>
          <div className="mt-6 p-4 bg-ocean-500/10 border border-ocean-500/30 rounded-lg">
            <p className="text-ocean-200 text-sm">
              <strong>📧 Confirmation:</strong> Un identifiant unique sera envoyé par e-mail à votre équipe et à bizertebtf@gmail.com pour le suivi du paiement.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
