'use client';

export default function ConceptSection() {
  const features = [
    {
      icon: '🏐',
      title: 'Beach Tennis',
      description: 'Format innovant: 2 joueurs par équipe (1H + 1F), sets de 4 jeux max 30 min',
    },
    {
      icon: '🎵',
      title: 'Ambiance Festive',
      description: 'Musique live, animations et convivialité tout au long de l\'événement',
    },
    {
      icon: '🏆',
      title: 'Tournoi Officiel',
      description: 'Tableaux par niveau: OR, ARGENT, BRONZE, CUIVRE avec classement final',
    },
    {
      icon: '🌊',
      title: 'Plage de Bizerte',
      description: 'Cadre idyllique sur les côtes méditerranéennes tunisiennes',
    },
  ];

  const schedule = [
    {
      day: 'Jour 1',
      title: 'Initiations & Qualifications',
      events: [
        '09:00 - Accueil et initiation pour les débutants',
        '11:00 - Début des matches de qualifications (1/8 de finale)',
        '16:00 - Pose déjeuner et animations',
        '18:00 - Fin des qualifications, résultats affichés',
      ],
    },
    {
      day: 'Jour 2',
      title: 'Tournoi & Finales',
      events: [
        '09:00 - Quarts de finale (Tableaux OR/BRONZE)',
        '13:00 - Pause déjeuner festive',
        '15:00 - Demi-finales et finales des 4 tableaux',
        '19:00 - Cérémonie de remise des prix',
        '20:00 - Soirée festive avec musique live',
      ],
    },
  ];

  return (
    <section id="concept" className="relative py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-4xl lg:text-5xl font-bold gradient-text">
            Le Concept Bizerte Beach Tennis
          </h2>
          <p className="text-xl text-ocean-200 max-w-3xl mx-auto">
            Un événement unique combinant sport, musique et convivialité sur les plus belles plages de la Méditerranée
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="glass p-6 rounded-xl border border-ocean-500/20 hover:border-ocean-400/50 transition-smooth group cursor-pointer"
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition-smooth">{feature.icon}</div>
              <h3 className="text-lg font-semibold mb-2 text-ocean-300">{feature.title}</h3>
              <p className="text-sm text-ocean-100">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Schedule */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {schedule.map((day, idx) => (
            <div key={idx} className="glass p-8 rounded-xl border border-ocean-500/20">
              <div className="inline-block px-3 py-1 rounded-full bg-accent-gold/20 text-accent-gold text-sm font-semibold mb-3">
                {day.day}
              </div>
              <h3 className="text-2xl font-bold text-white mb-6">{day.title}</h3>
              <div className="space-y-4">
                {day.events.map((event, eventIdx) => (
                  <div key={eventIdx} className="flex gap-4 items-start">
                    <div className="w-2 h-2 rounded-full bg-ocean-400 mt-2 flex-shrink-0" />
                    <p className="text-ocean-100">{event}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Rules Summary */}
        <div className="mt-16 glass p-8 rounded-xl border border-ocean-500/20">
          <h3 className="text-2xl font-bold text-white mb-6">📋 Règles du Match</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-ocean-400 mb-3">Format du Match</h4>
              <ul className="space-y-2 text-ocean-100">
                <li>✓ 2 sets de 4 jeux (première à 4)</li>
                <li>✓ Durée max: 30 minutes</li>
                <li>✓ Tie-break à 3-3 (5 points)</li>
                <li>✓ Super tie-break si 1-1 (7 points)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-ocean-400 mb-3">Règles Spécifiques</h4>
              <ul className="space-y-2 text-ocean-100">
                <li>✓ Mixte obligatoire: 1 Homme + 1 Femme</li>
                <li>✓ Homme sert à l'homme, Femme à la femme</li>
                <li>✓ Point décisif (No-Ad) à 40-40</li>
                <li>✓ Relanceur choisit le côté</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
