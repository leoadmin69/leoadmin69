// Données de départ : la liste des bâtiments et des salons. Tout est modifiable par les modos.
// Aucun statut n'est inventé : chaque bâtiment démarre « non renseigné ».
import { db, newId, now, save } from './store.js';

const BUILDINGS = [
  ['La Doua', ['Déambulatoire', 'Thémis', 'Nautibus', 'Braconnier', 'Lippmann', 'Darwin', 'Grignard', 'Forel', 'Mendel', 'Ariane', 'Astrée', 'Omega', 'Quai 43', 'Chevreul', 'Curien', 'BU Sciences']],
  ['Rockefeller (Santé)', ['Bâtiment principal', 'BU Santé']],
  ['Lyon Sud', ['Faculté Lyon Sud']],
  ['Gerland', ['Campus Gerland']],
  ['IUT Lyon 1', ['IUT Doua']],
];

const CHANNELS = [
  ['general', 'Général', 'Tout le monde, tous campus'],
  ['doua', 'La Doua', 'Infos et entraide sur le campus de la Doua'],
  ['sante', 'Santé', 'Rockefeller, Laennec, Lyon Sud'],
  ['ag', 'Débrief AG', 'Questions et retours sur les assemblées générales'],
  ['entraide', 'Entraide', 'Cours, partiels, covoiturage, logement, soutien'],
];

export function seed() {
  if (!db.buildings.length) {
    for (const [campus, names] of BUILDINGS) {
      for (const name of names) db.buildings.push({ id: newId(), name, campus, status: 'inconnu', note: '', updatedAt: null, by: '' });
    }
  }
  if (!db.channels.length) {
    db.channels = CHANNELS.map(([id, name, description]) => ({ id, name, description }));
  }
  if (!db.feed.length) db.feed.push({ at: now(), level: 'ok', text: 'Plateforme en ligne. En attente des premières infos des modos.' });
  save();
}
