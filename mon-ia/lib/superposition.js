// Raisonnement « en superposition » (inspiré de l'idée quantique, mais 100 % classique) :
// garder plusieurs hypothèses ouvertes à la fois, leur donner un poids, les confronter à des preuves,
// et ne trancher qu'au moment de décider. Pas de calcul quantique : c'est une méthode de raisonnement.
//
// Trois usages :
//  1. Raisonnement : hypothèses pondérées, puis mise à jour par les preuves.
//  2. Exécution : avant une action risquée, simuler les issues possibles et choisir la plus robuste.
//  3. Apprentissage : noter les hypothèses et leur issue, pour recalibrer les poids plus tard.
import { load, save, newId, now } from './store.js';
import { chainFor, complete } from './llm.js';

const clamp = (x) => Math.min(0.99, Math.max(0.01, x));
const normalize = (hs) => {
  const sum = hs.reduce((s, h) => s + h.weight, 0) || 1;
  return hs.map((h) => ({ ...h, weight: +(h.weight / sum).toFixed(3) }));
};

/** Demande à un modèle de proposer des hypothèses distinctes, avec un poids initial et ce qui les départagerait. */
export async function openHypotheses(question, { n = 3 } = {}) {
  const provider = chainFor('smart')[0];
  if (!provider) return [];
  const text = await complete(provider, [
    { role: 'system', content: `Tu listes ${n} hypothèses DISTINCTES et plausibles pour répondre à la question ou résoudre le problème. Pour chacune : une phrase, un poids initial entre 0 et 1 (le total fait 1), et la preuve qui la confirmerait ou l'infirmerait. Réponds UNIQUEMENT en JSON : {"hypotheses":[{"text":"…","weight":0.5,"test":"…"}]}` },
    { role: 'user', content: question.slice(0, 6000) },
  ], { maxTokens: 700 });
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    return normalize(j.hypotheses.slice(0, n).map((h) => ({ id: newId(), text: String(h.text), weight: clamp(Number(h.weight) || 1 / n), test: String(h.test || '') })));
  } catch { return []; }
}

/** Met à jour les poids selon une preuve : bayésien simple, sans jamais annuler une hypothèse à 0 ou 1. */
export async function updateWeights(hypotheses, evidence) {
  const provider = chainFor('fast')[0] || chainFor('smart')[0];
  if (!provider || !hypotheses.length) return hypotheses;
  const text = await complete(provider, [
    { role: 'system', content: 'Pour chaque hypothèse, donne la vraisemblance de la preuve si elle est vraie (0 à 1). Réponds UNIQUEMENT en JSON : {"likelihoods":[0.2,0.8,…]} dans le même ordre.' },
    { role: 'user', content: `Hypothèses :\n${hypotheses.map((h, i) => `${i + 1}. ${h.text}`).join('\n')}\n\nPreuve observée :\n${String(evidence).slice(0, 4000)}` },
  ], { maxTokens: 200 });
  try {
    const like = JSON.parse(text.match(/\{[\s\S]*\}/)[0]).likelihoods;
    return normalize(hypotheses.map((h, i) => ({ ...h, weight: clamp(h.weight * clamp(Number(like[i]) || 0.5)) })));
  } catch { return hypotheses; }
}

/** Avant une action risquée : simuler les issues possibles et choisir la plus robuste. */
export async function simulateOutcomes(action, context = '') {
  const provider = chainFor('smart')[0];
  if (!provider) return null;
  const text = await complete(provider, [
    { role: 'system', content: 'Tu anticipes une action avant de l\'exécuter. Liste 3 issues possibles (réussite, échec, réussite partielle) avec une probabilité (somme 1), le dommage éventuel si l\'issue arrive, et une précaution réduisant ce dommage. Puis recommande : exécuter, exécuter avec précaution, ou demander l\'accord de l\'admin. Réponds en JSON : {"outcomes":[{"name":"…","p":0.5,"damage":"…","safeguard":"…"}],"recommendation":"execute|careful|ask","reason":"…"}' },
    { role: 'user', content: `Action : ${action}\nContexte : ${String(context).slice(0, 2000)}` },
  ], { maxTokens: 500 });
  try { return JSON.parse(text.match(/\{[\s\S]*\}/)[0]); } catch { return null; }
}

/** Journal : chaque raisonnement en superposition est noté, avec son issue réelle quand elle est connue. */
export function recordHypotheses(question, hypotheses, chosen) {
  const log = load('hypothesisLog');
  log.unshift({ id: newId(), question: question.slice(0, 300), hypotheses: hypotheses.map(({ text, weight }) => ({ text, weight })), chosen: chosen || null, outcome: null, createdAt: now() });
  save('hypothesisLog', log.slice(0, 300));
  return log[0].id;
}
export function settleHypothesis(id, outcome) {
  const log = load('hypothesisLog');
  const e = log.find((x) => x.id === id);
  if (!e) return false;
  e.outcome = String(outcome).slice(0, 500); e.settledAt = now();
  save('hypothesisLog', log);
  return true;
}

/** Pour l'apprentissage : taux de réussite des hypothèses qu'elle avait privilégiées. */
export function calibration() {
  const done = load('hypothesisLog').filter((e) => e.outcome && e.chosen);
  if (!done.length) return null;
  return { settled: done.length, examples: done.slice(0, 5).map((e) => ({ question: e.question, chosen: e.chosen, outcome: e.outcome })) };
}
