'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import TennisRacket3D from './3D/TennisRacket3D';

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

        {/* 3D Racket */}
        <div className="hidden lg:block h-96 relative">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-ocean-300">Chargement...</div>}>
            <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
              <ambientLight intensity={0.8} />
              <pointLight position={[10, 10, 10]} intensity={1.2} />
              <TennisRacket3D />
            </Canvas>
          </Suspense>
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
