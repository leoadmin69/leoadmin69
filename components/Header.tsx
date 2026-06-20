'use client';

import { useState } from 'react';

interface HeaderProps {
  onOrganizerClick: () => void;
}

export default function Header({ onOrganizerClick }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMenuOpen(false);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-ocean-500/20">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-smooth">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-ocean-400 to-ocean-600 flex items-center justify-center font-bold text-dark-950">
            🎾
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg gradient-text">Bizerte BTF</span>
            <span className="text-xs text-ocean-300">Beach Tennis</span>
          </div>
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-8">
          <button
            onClick={() => scrollToSection('concept')}
            className="text-ocean-200 hover:text-ocean-400 transition-smooth text-sm font-medium"
          >
            Concept
          </button>
          <button
            onClick={() => scrollToSection('registration')}
            className="text-ocean-200 hover:text-ocean-400 transition-smooth text-sm font-medium"
          >
            Inscription
          </button>
          <button
            onClick={() => scrollToSection('partners')}
            className="text-ocean-200 hover:text-ocean-400 transition-smooth text-sm font-medium"
          >
            Partenaires
          </button>
          <button
            onClick={onOrganizerClick}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-accent-gold to-orange-600 text-dark-950 font-semibold text-sm hover:shadow-glow-orange transition-smooth"
          >
            Organisateurs
          </button>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 text-ocean-300 hover:text-ocean-400"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </nav>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden glass border-t border-ocean-500/20 p-4 flex flex-col gap-3">
          <button
            onClick={() => scrollToSection('concept')}
            className="text-left px-4 py-2 text-ocean-200 hover:text-ocean-400 transition-smooth text-sm font-medium"
          >
            Concept
          </button>
          <button
            onClick={() => scrollToSection('registration')}
            className="text-left px-4 py-2 text-ocean-200 hover:text-ocean-400 transition-smooth text-sm font-medium"
          >
            Inscription
          </button>
          <button
            onClick={() => scrollToSection('partners')}
            className="text-left px-4 py-2 text-ocean-200 hover:text-ocean-400 transition-smooth text-sm font-medium"
          >
            Partenaires
          </button>
          <button
            onClick={onOrganizerClick}
            className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-accent-gold to-orange-600 text-dark-950 font-semibold text-sm hover:shadow-glow-orange transition-smooth"
          >
            Organisateurs
          </button>
        </div>
      )}
    </header>
  );
}
