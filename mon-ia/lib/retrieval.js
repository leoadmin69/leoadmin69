// Recherche dans la base de connaissances (BM25 simplifié, sans dépendance).
// C'est ce qui permet à l'IA de « se souvenir » de ce que l'admin lui apprend.

const STOP = new Set(('le la les un une des de du d l et ou a au aux en dans pour par sur avec ' +
  'ce cet cette ces qui que quoi est sont etre avoir je tu il elle on nous vous ils elles ' +
  'mon ma mes ton ta tes son sa ses ne pas plus the of and to is in it what how').split(' '));

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

// Découpe les longs documents en morceaux d'environ 800 caractères.
export function chunk(text, size = 800) {
  const paras = text.split(/\n\s*\n/);
  const out = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > size && cur) { out.push(cur.trim()); cur = ''; }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function search(entries, query, k = 4) {
  const q = tokenize(query);
  if (!q.length || !entries.length) return [];
  const docs = entries.map((e) => tokenize(`${e.title} ${e.title} ${e.tags || ''} ${e.content}`));
  const avg = docs.reduce((s, d) => s + d.length, 0) / docs.length || 1;
  const df = {};
  for (const d of docs) for (const t of new Set(d)) df[t] = (df[t] || 0) + 1;
  const N = docs.length;
  const scored = entries.map((e, i) => {
    const d = docs[i];
    const tf = {};
    for (const t of d) tf[t] = (tf[t] || 0) + 1;
    let score = 0;
    for (const t of q) {
      if (!tf[t]) continue;
      const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      score += idf * (tf[t] * 2.2) / (tf[t] + 1.2 * (0.25 + 0.75 * d.length / avg));
    }
    return { entry: e, score };
  });
  return scored.filter((s) => s.score > 0.5).sort((a, b) => b.score - a.score).slice(0, k).map((s) => s.entry);
}
