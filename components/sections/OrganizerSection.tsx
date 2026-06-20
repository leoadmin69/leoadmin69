'use client';

import { useState } from 'react';
import OrganizerLogin from '@/components/organizer/OrganizerLogin';
import TournamentDashboard from '@/components/organizer/TournamentDashboard';

interface OrganizerSectionProps {
  isAuthenticated: boolean;
  onAuthenticate: (value: boolean) => void;
  onClose: () => void;
}

export default function OrganizerSection({
  isAuthenticated,
  onAuthenticate,
  onClose,
}: OrganizerSectionProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto glass rounded-xl border border-ocean-500/20">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-6 border-b border-ocean-500/20 sticky top-0 glass">
          <h2 className="text-2xl font-bold gradient-text">
            🔒 Espace Organisateurs & Arbitres
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-ocean-500/10 rounded-lg transition-smooth"
          >
            <svg className="w-6 h-6 text-ocean-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {!isAuthenticated ? (
            <OrganizerLogin onAuthenticate={onAuthenticate} />
          ) : (
            <TournamentDashboard onLogout={() => {
              onAuthenticate(false);
              onClose();
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
