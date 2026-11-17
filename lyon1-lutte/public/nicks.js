// Pseudos du chat et de l'entraide : toujours donnés par le système, jamais tapés à la main.
// Fichier partagé : l'app tire les pseudos, le serveur vérifie qu'un pseudo vient bien de ces listes.
// Style familier français / anglais + mèmes TikTok + un nombre (ex. « Lil Croissant 69 »).
export const NICK_TITLES = ['Lil', 'Big', 'Mister', 'Miss', 'Captain', 'DJ', 'MC', 'King', 'Queen', 'Doc', 'Boss', 'Agent', 'Baby', 'Tonton', 'Tata', 'Petit', 'Super', 'Professeur', 'Le Sang', 'Señor', 'Chef', 'Lord', 'Sensei', 'Coach', 'Wesh', 'Gros', 'Frérot', 'Askip', 'Le Vrai', 'Team', 'Daddy', 'Mamie', 'Papi', 'Lowkey'];
export const NICK_WORDS = ['Croissant', 'Baguette', 'Chocolatine', 'Pain au Choc', 'Raclette', 'Crêpe', 'Galette', 'Kebab', 'Tacos', 'Couscous', 'Mafé', 'Bissap', 'Café Crème', 'Madeleine', 'Camembert', 'Wifi', 'Chill', 'Flow', 'Vibes', 'Mood', 'Swag', 'Freestyle', 'Banger', 'Playlist', 'Hoodie', 'Sneakers', 'Zbeul', 'Daron', 'Ninja', 'Panda', 'Pixel', 'Skate', 'Vélo', 'Tram', 'Night', 'Sunshine', 'Thunder', 'Cookie', 'Brownie', 'Nugget',
  // mèmes et expressions TikTok françaises
  'Quoicoubeh', 'Apagnan', 'Skibidi', 'Rizz', 'Sigma', 'Aura', 'Ratio', 'Cheh', 'Flemme', 'Masterclass', 'Dinguerie', 'Chokbar', 'Zinzin', 'Gênance', 'Cringe', 'Crush', 'Wallah', 'Askip', 'Pas Ouf', 'Oklm', 'Tqt', 'Mdr', 'Ptdr', 'Jpp', 'Goat', 'Gamos', 'Pépouze', 'Tranquillou', 'Flex', 'Big Up', 'Poto', 'Frérot', 'Bichon', 'Ratatouille', 'Mamacita', 'Ça Passe Crème', 'Gros Chat', 'Ouais Ouais', 'Le Sang de la Veine', 'Bescherelle', 'Apéro', 'Choupi', 'Chouchou'];
// 69 = le Rhône
export const NICK_NUMBERS = ['69', '007', '404', '2000', '3000', '9000', '1er', '24', '42', '99'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const nickNumber = () => (Math.random() < 0.35 ? pick(NICK_NUMBERS) : String(Math.floor(Math.random() * 90) + 10));

export function randomNick() {
  for (let i = 0; i < 50; i++) {
    const t = pick(NICK_TITLES), w = pick(NICK_WORDS);
    if (t === w) continue;
    const n = `${t} ${w} ${nickNumber()}`;
    if (n.length <= 24) return n;
  }
  return `Lil Chill ${nickNumber()}`;
}

// Vrai si le pseudo a pu être donné par randomNick()
export function isSystemNick(n) {
  if (typeof n !== 'string' || n.length > 24) return false;
  const m = n.match(/^(.+) (\S+)$/);
  if (!m || !(NICK_NUMBERS.includes(m[2]) || /^[1-9]\d$/.test(m[2]))) return false;
  return NICK_TITLES.some((t) => m[1].startsWith(t + ' ') && NICK_WORDS.includes(m[1].slice(t.length + 1)) && m[1].slice(t.length + 1) !== t);
}
