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

// Revendications du communiqué de la mobilisation (Lyon 1, INSA, IUT, Polytech). Ajoutées une seule fois,
// puis modifiables par les modos. D'autres revendications sont discutées en AG.
const DEMANDS_V1 = [
  ['Plus de moyens', 'Abolir la réforme raciste « Bienvenue en France »', ''],
  ['Plus de moyens', 'Annuler la suppression des APL pour les étudiant·es extra-communautaires', ''],
  ['Plus de moyens', 'Stopper la baisse des heures de TP et TD', ''],
  ['Plus de moyens', 'Mettre un terme au recours aux contractuels et à la surcharge des titulaires', ''],
  ['Plus de moyens', 'Abolir Parcoursup et MonMaster et garantir une place à tous·tes dans l’ESR', ''],
  ['Plus de moyens', 'Assurer le repas à 1 € pour tous·tes avec les moyens matériels et humains', ''],
  ['Plus de moyens', 'Rénover thermiquement les bâtiments et logements universitaires inadaptés aux fortes chaleurs et basses températures', ''],
  ['Plus de moyens', 'Suspendre les enseignant·es accusé·es de VSS ou de discriminations systémiques', ''],
  ['Contre l’influence des entreprises destructrices', 'Abroger les partenariats de l’ESR avec toutes les entreprises génocidaires, complices de crimes de guerre et écocidaires, et les entreprises d’armement profiteuses de guerres',
    'Les lieux d’études et de recherche du campus ont par exemple des collaborations avec MBDA, Thalès (fournissant des armes à Israël), TotalEnergies (polluant et accusé de crimes de guerre au Mozambique).'],
  ['Contre l’influence des entreprises destructrices', 'Mettre en place des instances démocratiques de contrôle des partenariats, composées de représentant·es étudiant·es élu·es démocratiquement', ''],
  ['INSA', 'Conventionner CROUS les restaurants INSA', 'Afin de désengorger le restaurant Puvis de Chavannes, qui ne peut répondre à lui seul aux demandes des étudiant·es du campus.'],
  ['INSA', 'Maintenir les Filières Internationales de l’INSA', ''],
  ['Lyon 1', 'Augmenter les moyens de la Mission Handicap et du Service de Santé Étudiant', 'Les délais dépassent un mois pour une consultation.'],
];

const CONTEXT_V1 = {
  title: 'Le contexte',
  text: `Les lycéen·nes se battent contre le manque de budget dans les collèges et les lycées, contre le manque de personnels dans l’éducation (AESH, profs, psychologues, infirmières), pour la suppression de Parcoursup, etc. Mais leur lutte dépasse les revendications purement scolaires : elle dénonce le racisme d’État, les inégalités sociales, les violences policières et les crimes de l’État français. La jeunesse lutte pour avoir des perspectives d’avenir, vivre et ne plus survivre.

Depuis plusieurs semaines, Lyon 1, l’INSA, l’IUT et Polytech se mobilisent en soutien aux lycéen·nes, comme la majorité des lieux d’étude ! Les blocages permettent de sensibiliser les étudiant·es pour qu’iels s’organisent, sans avoir d’absences non justifiées. Le but est de déranger les responsables de l’enseignement supérieur, et d’éveiller un maximum d’étudiant·es et de personnels pour intensifier le rapport de force contre le gouvernement.`,
  call: 'On a besoin de tout le monde pour faire plier le gouvernement et les présidences d’université !',
  closing: `Pour obtenir ces revendications, la seule solution est d’être le plus nombreux possible ! Unissons-nous, lycéen·nes, étudiant·es, travailleur·euses, car c’est ensemble qu’on peut gagner !

C’est pour toutes ces raisons qu’on va continuer à se mobiliser sur le campus de la Doua, comme partout.`,
  source: 'Cette liste regroupe les revendications issues d’un communiqué. D’autres revendications sont portées par des étudiant·es et des personnels, et elles sont discutées en AG.',
};

export function seed() {
  if (!db.settings.seededDemandsV1) {
    DEMANDS_V1.forEach(([category, title, text], i) => {
      if (db.demands.some((d) => d.title.toLowerCase() === title.toLowerCase())) return;
      db.demands.push({ id: newId(), title, text, category, status: 'en-lutte', order: i + 1, createdAt: now(), org: 'Communiqué de la mobilisation' });
    });
    db.settings.context ||= CONTEXT_V1;
    db.settings.seededDemandsV1 = true;
  }
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
