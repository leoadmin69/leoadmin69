'use client';

export default function Hero() {
  return (
    <section className="relative w-full h-screen pt-20 flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark-900 via-dark-950 to-dark-950 pointer-events-none" />

      {/* Animated background elements */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-ocean-500/10 rounded-full blur-3xl animate-pulse-slow" />
      <div className="absolute bottom-20 left-10 w-72 h-72 bg-accent-gold/5 rounded-full blur-3xl animate-pulse-slow" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Content */}
        <div className="flex flex-col justify-center space-y-8">
          <div className="space-y-4">
            <div className="inline-block px-4 py-2 rounded-full glass border border-ocean-500/50 text-ocean-300 text-sm font-semibold">
              ✨ Premier événement en Tunisie
            </div>
            <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold gradient-text leading-tight">
              Bizerte Beach Tennis
            </h1>
            <p className="text-lg text-ocean-100 leading-relaxed max-w-md">
              Découvrez l'expérience unique où le Beach Tennis rencontre la musique sur les plages dorées de la Méditerranée.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-gold to-orange-600 flex items-center justify-center text-dark-950 font-bold">
                📅
              </span>
              <div>
                <p className="font-semibold text-white">2 Jours de Compétition</p>
                <p className="text-sm text-ocean-300">Initiations, tournois et convivialité</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-gold to-orange-600 flex items-center justify-center text-dark-950 font-bold">
                🏖️
              </span>
              <div>
                <p className="font-semibold text-white">Plage de Bizerte</p>
                <p className="text-sm text-ocean-300">Méditerranée - Atmosphère festive</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-gold to-orange-600 flex items-center justify-center text-dark-950 font-bold">
                🎵
              </span>
              <div>
                <p className="font-semibold text-white">Musique Live</p>
                <p className="text-sm text-ocean-300">Animations et divertissements</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <a
              href="#registration"
              className="px-8 py-3 rounded-lg bg-gradient-to-r from-ocean-400 to-ocean-600 text-white font-semibold hover:shadow-glow transition-smooth"
            >
              S'inscrire
            </a>
            <a
              href="#concept"
              className="px-8 py-3 rounded-lg glass border border-ocean-400/50 text-ocean-200 font-semibold hover:bg-ocean-400/10 transition-smooth"
            >
              En savoir plus
            </a>
          </div>
        </div>

        {/* 3D Racket - Interactive Animation */}
        <div className="hidden lg:flex h-96 relative items-center justify-center">
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Animated Racket Illustration */}
            <div className="animate-spin-slow">
              <svg className="w-64 h-64" viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
                {/* Handle */}
                <rect x="85" y="180" width="30" height="80" fill="#8B4513" rx="15" />

                {/* Frame */}
                <circle cx="100" cy="90" r="70" fill="none" stroke="#FFD700" strokeWidth="8" />

                {/* Strings */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                  const rad = (angle * Math.PI) / 180;
                  const x1 = 100 + 60 * Math.cos(rad);
                  const y1 = 90 + 60 * Math.sin(rad);
                  const x2 = 100;
                  const y2 = 90;
                  return (
                    <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="1" opacity="0.7" />
                  );
                })}

                {/* Glow Effect */}
                <circle cx="100" cy="90" r="75" fill="none" stroke="#0ea5e9" strokeWidth="2" opacity="0.3" />
              </svg>
            </div>

            {/* Decorative Glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-80 h-80 rounded-full bg-ocean-500/20 blur-3xl animate-pulse-slow" />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="flex flex-col items-center gap-2">
          <span className="text-ocean-300 text-sm font-medium">Découvrir</span>
          <svg className="w-5 h-5 text-ocean-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  );
}
