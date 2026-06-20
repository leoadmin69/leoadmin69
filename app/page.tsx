'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import ConceptSection from '@/components/sections/ConceptSection';
import RegistrationSection from '@/components/sections/RegistrationSection';
import PartnersSection from '@/components/sections/PartnersSection';
import OrganizerSection from '@/components/sections/OrganizerSection';

export default function Home() {
  const [showOrganizerModal, setShowOrganizerModal] = useState(false);
  const [isOrganizerAuthenticated, setIsOrganizerAuthenticated] = useState(false);

  return (
    <main className="min-h-screen bg-dark-950">
      <Header onOrganizerClick={() => setShowOrganizerModal(true)} />
      <Hero />

      {/* Public Sections */}
      <ConceptSection />
      <RegistrationSection />
      <PartnersSection />

      {/* Organizer Modal */}
      {showOrganizerModal && (
        <OrganizerSection
          isAuthenticated={isOrganizerAuthenticated}
          onAuthenticate={setIsOrganizerAuthenticated}
          onClose={() => setShowOrganizerModal(false)}
        />
      )}
    </main>
  );
}
