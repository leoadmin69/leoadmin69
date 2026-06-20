'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const playerSchema = z.object({
  firstName: z.string().min(2, 'Prénom requis'),
  lastName: z.string().min(2, 'Nom requis'),
  age: z.number().min(1).max(150),
  gender: z.enum(['male', 'female']),
  nationality: z.string().min(2),
  governorate: z.string().min(2),
  phone: z.string().regex(/^\+?[0-9]{8,}/, 'Téléphone invalide'),
  email: z.string().email('Email invalide'),
  level: z.enum(['beginner', 'intermediate', 'confirmed']),
  isCaptain: z.boolean(),
});

const registrationSchema = z.object({
  players: z
    .array(playerSchema)
    .length(2, 'Exactement 2 joueurs requis')
    .refine(
      (players) => {
        const genders = players.map((p) => p.gender);
        return genders.includes('male') && genders.includes('female');
      },
      'L\'équipe doit être mixte (1 Homme + 1 Femme)'
    ),
  racketsNeeded: z.number().min(0).max(2),
  restaurationOption: z.string(),
  paymentMethod: z.enum(['online', 'cash']),
  paymentType: z.enum(['single', 'shared']),
}).refine(
  (data) => {
    const hasCaptain = data.players.some((p) => p.isCaptain);
    return hasCaptain;
  },
  'Au moins un capitaine doit être désigné'
);

type RegistrationFormData = z.infer<typeof registrationSchema>;

interface RegistrationFormProps {
  onSuccess: () => void;
}

export default function RegistrationForm({ onSuccess }: RegistrationFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      players: [
        { firstName: '', lastName: '', age: 18, gender: 'male', nationality: '', governorate: '', phone: '', email: '', level: 'intermediate', isCaptain: true },
        { firstName: '', lastName: '', age: 18, gender: 'female', nationality: '', governorate: '', phone: '', email: '', level: 'intermediate', isCaptain: false },
      ],
      racketsNeeded: 0,
      restaurationOption: 'none',
      paymentMethod: 'online',
      paymentType: 'single',
    },
  });

  const { fields } = useFieldArray({ control, name: 'players' });
  const players = watch('players');
  const level = watch('players.0.level');
  const price = level === 'beginner' ? 50 : level === 'intermediate' ? 80 : 80;

  const onSubmit = async (data: RegistrationFormData) => {
    setSubmitting(true);
    try {
      // Generate unique team ID
      const teamId = `BTBF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Here you would send to your backend
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, teamId }),
      });

      if (response.ok) {
        const result = await response.json();
        setSuccessMessage(`✓ Équipe inscrite! Identifiant: ${teamId}`);
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (error) {
      console.error('Registration error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">✓</div>
        <p className="text-xl font-semibold text-ocean-400 mb-2">{successMessage}</p>
        <p className="text-ocean-200">Confirmation envoyée à votre e-mail</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Players Section */}
      {fields.map((field, playerIdx) => (
        <div key={field.id} className="space-y-6 p-6 bg-dark-800/50 rounded-lg border border-ocean-500/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-ocean-400">
              Joueur {playerIdx + 1}
            </h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register(`players.${playerIdx}.isCaptain`)}
                className="w-4 h-4"
              />
              <span className="text-sm text-ocean-300">Capitaine</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Prénom"
              {...register(`players.${playerIdx}.firstName`)}
              className="px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Nom"
              {...register(`players.${playerIdx}.lastName`)}
              className="px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="number"
              placeholder="Âge"
              {...register(`players.${playerIdx}.age`, { valueAsNumber: true })}
              className="px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
            />
            <select
              {...register(`players.${playerIdx}.gender`)}
              className="px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white focus:border-ocean-400 focus:outline-none"
            >
              <option value="male">Homme</option>
              <option value="female">Femme</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Nationalité"
              {...register(`players.${playerIdx}.nationality`)}
              className="px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Gouvernorat"
              {...register(`players.${playerIdx}.governorate`)}
              className="px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="tel"
              placeholder="Téléphone"
              {...register(`players.${playerIdx}.phone`)}
              className="px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
            />
            <input
              type="email"
              placeholder="Email"
              {...register(`players.${playerIdx}.email`)}
              className="px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white placeholder-ocean-400/50 focus:border-ocean-400 focus:outline-none"
            />
          </div>

          <select
            {...register(`players.${playerIdx}.level`)}
            className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white focus:border-ocean-400 focus:outline-none"
          >
            <option value="beginner">Niveau: Débutant</option>
            <option value="intermediate">Niveau: Intermédiaire</option>
            <option value="confirmed">Niveau: Confirmé</option>
          </select>

          {errors.players?.[playerIdx] && (
            <p className="text-red-400 text-sm">{errors.players[playerIdx]?.firstName?.message}</p>
          )}
        </div>
      ))}

      {/* Equipment & Preferences */}
      <div className="space-y-4 p-6 bg-dark-800/50 rounded-lg border border-ocean-500/10">
        <h3 className="text-xl font-semibold text-ocean-400 mb-4">Équipement & Préférences</h3>

        <div>
          <label className="block text-ocean-300 text-sm font-medium mb-2">Raquettes requises</label>
          <select
            {...register('racketsNeeded', { valueAsNumber: true })}
            className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white focus:border-ocean-400 focus:outline-none"
          >
            <option value={0}>Aucune (on apporte les nôtres)</option>
            <option value={1}>1 raquette</option>
            <option value={2}>2 raquettes</option>
          </select>
        </div>

        <div>
          <label className="block text-ocean-300 text-sm font-medium mb-2">Options de restauration</label>
          <select
            {...register('restaurationOption')}
            className="w-full px-4 py-2 bg-dark-900 border border-ocean-500/20 rounded-lg text-white focus:border-ocean-400 focus:outline-none"
          >
            <option value="none">Aucune</option>
            <option value="lunch">Déjeuner inclus</option>
            <option value="both">Déjeuner + Dîner</option>
          </select>
        </div>
      </div>

      {/* Payment Section */}
      <div className="space-y-4 p-6 bg-dark-800/50 rounded-lg border border-ocean-500/10">
        <h3 className="text-xl font-semibold text-ocean-400 mb-4">Paiement</h3>

        <div className="p-4 bg-ocean-500/10 border border-ocean-500/30 rounded-lg">
          <p className="text-ocean-200">
            <strong>Montant à payer:</strong> <span className="text-xl font-bold text-accent-gold">{price} DT</span>
          </p>
        </div>

        <div>
          <label className="block text-ocean-300 text-sm font-medium mb-2">Méthode de paiement</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                value="online"
                {...register('paymentMethod')}
                className="w-4 h-4"
              />
              <span className="text-ocean-300">En ligne (Carte / Portefeuille)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                value="cash"
                {...register('paymentMethod')}
                className="w-4 h-4"
              />
              <span className="text-ocean-300">Cash (Jour de l'événement)</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-ocean-300 text-sm font-medium mb-2">Type de paiement</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                value="single"
                {...register('paymentType')}
                className="w-4 h-4"
              />
              <span className="text-ocean-300">Payé par une seule personne</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                value="shared"
                {...register('paymentType')}
                className="w-4 h-4"
              />
              <span className="text-ocean-300">Partagé entre les joueurs</span>
            </label>
          </div>
        </div>
      </div>

      {/* Errors Summary */}
      {Object.keys(errors).length > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 font-semibold mb-2">Erreurs dans le formulaire:</p>
          {errors.players && <p className="text-red-300 text-sm">{errors.players?.message}</p>}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-ocean-400 to-ocean-600 text-white font-semibold hover:shadow-glow transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Inscription en cours...' : 'Inscrire l\'équipe'}
      </button>
    </form>
  );
}
