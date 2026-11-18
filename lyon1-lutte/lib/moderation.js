// Liste noire du chat : gros mots, insultes, propos haineux, menaces.
// Le texte est « normalisé » avant comparaison pour attraper les contournements :
// majuscules, accents, chiffres à la place des lettres (s4l0pe), lettres répétées (connnnard),
// lettres séparées par des espaces ou des points (s.a.l.o.p.e).
// Les modos ajoutent leurs propres mots depuis l'espace modo (onglet Chat).
import { db } from './store.js';

// Mots et expressions interdits (écrits normalement ; la normalisation s'applique aussi à eux).
export const BANNED_BASE = [
  // Gros mots et insultes
  'putain', 'pute', 'putes', 'salope', 'salopes', 'salaud', 'salauds', 'connard', 'connards', 'connasse', 'connasses',
  'enculé', 'enculée', 'enculés', 'enculer', 'encule', 'enfoiré', 'enfoirée', 'enfoirés', 'batard', 'bâtard', 'bâtarde', 'batards',
  'merde', 'merdeux', 'merdeuse', 'chier', 'fils de pute', 'fdp', 'ntm', 'nique ta mère', 'nique ta mere', 'niquer', 'nique', 'niques',
  'ta gueule', 'ferme ta gueule', 'ftg', 'tg', 'va te faire foutre', 'va te faire enculer', 'vtff', 'bordel', 'couille', 'couilles', 'bite', 'bites',
  'teub', 'zob', 'pétasse', 'petasse', 'pouffiasse', 'grognasse', 'trou du cul', 'trouduc', 'abruti', 'abrutie', 'débile', 'debile',
  'crétin', 'cretin', 'crétine', 'imbécile', 'imbecile', 'bouffon', 'bouffonne', 'clochard', 'cassos', 'boloss', 'bolosse',
  'sac à merde', 'tocard', 'tocarde', 'branleur', 'branleuse', 'branlette', 'suceur', 'suceuse', 'catin', 'traînée', 'trainee',
  'mange tes morts', 'ta mère la pute', 'ta race', 'wesh ta race',
  // Validisme
  'mongol', 'mongolien', 'mongolienne', 'attardé', 'attardée', 'triso', 'trisomique', 'autiste de merde', 'handicapé de merde', 'gogol',
  // Homophobie, transphobie, sexisme
  'pd', 'pédé', 'pede', 'pédés', 'tapette', 'tarlouze', 'tantouze', 'gouine', 'gouines', 'travelo', 'sale trans', 'sale pd', 'sale gouine',
  'grosse pute', 'sale pute', 'sale chienne',
  // Racisme, antisémitisme, islamophobie
  'nègre', 'negre', 'négro', 'negro', 'nigga', 'nigger', 'bamboula', 'bougnoule', 'bougnoul', 'bicot', 'crouille',
  'youpin', 'youpine', 'youtre', 'feuj de merde', 'sale juif', 'sale juive', 'sale arabe', 'sale noir', 'sale noire', 'sale blanc', 'sale noich',
  'sale chinois', 'chinetoque', 'chintok', 'bridé', 'sale rebeu', 'sale renoi', 'sale musulman', 'sale musulmane', 'sale migrant',
  'retourne dans ton pays', 'sale roumain', 'romanichel', 'manouche de merde', 'sale gitan',
  // Menaces et violence
  'je vais te tuer', 'je vais te buter', 'je vais te défoncer', 'je vais te frapper', 'on va te tuer', 'on va te retrouver',
  'va crever', 'va mourir', 'suicide toi', 'suicide-toi', 'pends toi', 'pends-toi', 'kys', 'heil', 'sieg heil', 'je vais te violer',
];

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '€': 'e' };
// minuscule, sans accents, chiffres → lettres, autres caractères → espace, lettres répétées réduites à une seule
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[0134578@$€]/g, (c) => LEET[c])
    .replace(/[^a-z]+/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .trim();
}

export const bannedList = () => [...new Set([...BANNED_BASE, ...(db.settings?.chatBanned || []), ...(process.env.CHAT_BANNED_WORDS || '').split(',')].map(normalize).filter(Boolean))];

// Renvoie le premier mot interdit trouvé (forme normalisée), ou null.
export function findBanned(text, list = bannedList()) {
  const n = ` ${normalize(text)} `;
  // lettres isolées séparées (« s a l o p e ») recollées
  const glued = ` ${n.replace(/\b([a-z]) (?=[a-z]\b)/g, '$1').replace(/([a-z])\1+/g, '$1')} `;
  for (const w of list) {
    if (n.includes(` ${w} `) || glued.includes(` ${w} `)) return w;
  }
  return null;
}
