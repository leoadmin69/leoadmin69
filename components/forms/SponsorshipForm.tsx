'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const sponsorshipSchema = z.object({
  companyName: z.string().min(2, 'Nom de l\'entreprise requis'),
  contactName: z.string().min(2, 'Nom du contact requis'),
  email: z.string().email('Email invalide'),
  phone: z.string().regex(/^\+?[0-9]{8,}/, 'Téléphone invalide'),
  sponsorshipLevel: z.enum(['platinum', 'gold', 'silver', 'partner']),
  message: z.string().min(10, 'Le message doit contenir au moins 10 caractères'),
});

type SponsorshipFormData = z.infer<typeof sponsorshipSchema>;

interface SponsorshipFormProps {
  onSuccess: () => void;
}

export default function SponsorshipForm({ onSuccess }: SponsorshipFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SponsorshipFormData>({
    resolver: zodResolver(sponsorshipSchema),
    defaultValues: {
      companyName: '',
      contactName: '',
      email: '',
      phone: '',
      sponsorshipLevel: 'gold',
      message: '',
    },
  });

  const onSubmit = async (data: SponsorshipFormData) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/sponsorship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setSuccessMessage('✓ Demande de partenariat reçue! Nous vous contacterons bientôt.');
        reset();
        setTimeout(() => {
          setSuccessMessage(null);
          onSuccess();
        }, 2000);
      }
    } catch (error) {
      console.error('Sponsorship error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">✓</div>
        <p className="text-xl font-semibold text-ocean-400 mb-2">{successMessage}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-ocean-300 text-sm font-medium mb-2">
            Nom de l'entreprise
          </label>
          <input
            type="text"
            placeholder="Votre entreprise"
            {...register('companyName')}
            className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
          />
          {errors.companyName && (
            <p className="text-red-400 text-sm mt-1">{errors.companyName.message}</p>
          )}
        </div>

        <div>
          <label className="block text-ocean-300 text-sm font-medium mb-2">
            Nom du contact
          </label>
          <input
            type="text"
            placeholder="Nom complet"
            {...register('contactName')}
            className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
          />
          {errors.contactName && (
            <p className="text-red-400 text-sm mt-1">{errors.contactName.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-ocean-300 text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            placeholder="contact@entreprise.com"
            {...register('email')}
            className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
          />
          {errors.email && (
            <p className="text-red-400 text-sm mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-ocean-300 text-sm font-medium mb-2">Téléphone</label>
          <input
            type="tel"
            placeholder="+216 XX XXX XXX"
            {...register('phone')}
            className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
          />
          {errors.phone && (
            <p className="text-red-400 text-sm mt-1">{errors.phone.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-ocean-300 text-sm font-medium mb-2">
          Niveau de partenariat souhaité
        </label>
        <select
          {...register('sponsorshipLevel')}
          className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white focus:border-ocean-400 focus:outline-none"
        >
          <option value="platinum">Platinum (Montant négocié)</option>
          <option value="gold">Gold (5000 DT+)</option>
          <option value="silver">Silver (2500 DT+)</option>
          <option value="partner">Partner (Flexible)</option>
        </select>
      </div>

      <div>
        <label className="block text-ocean-300 text-sm font-medium mb-2">
          Message / Proposition
        </label>
        <textarea
          placeholder="Décrivez votre intérêt et vos idées de collaboration..."
          {...register('message')}
          rows={5}
          className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none resize-none"
        />
        {errors.message && (
          <p className="text-red-400 text-sm mt-1">{errors.message.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-accent-gold to-orange-600 text-dark-950 font-semibold hover:shadow-glow-orange transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Envoi en cours...' : 'Envoyer la demande'}
      </button>
    </form>
  );
}
