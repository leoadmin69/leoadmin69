// Calcul quantique : un simulateur exact intégré (gratuit, instantané, jusqu'à 20 qubits)
// et l'accès aux vrais ordinateurs quantiques d'IBM (via Qiskit, avec le jeton de l'admin).
// Les circuits s'écrivent en OpenQASM 2, le langage standard.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { load } from './store.js';
import { defineTool } from './tools.js';

const MAX_QUBITS = 20;

// ---------- Lecture d'un circuit OpenQASM 2 ----------

function evalParam(expr) {
  if (!/^[0-9eE.+\-*/() pi]+$/.test(expr)) throw new Error(`Paramètre invalide : ${expr}`);
  const v = Function(`"use strict"; const pi = Math.PI; return (${expr});`)();
  if (!Number.isFinite(v)) throw new Error(`Paramètre invalide : ${expr}`);
  return v;
}

export function parseQasm(src) {
  const qregs = {}; const cregs = {};
  let nq = 0; let nc = 0;
  const ops = [];
  const text = String(src).replace(/\/\/.*$/gm, '');
  const resolve = (regs, arg) => {
    const m = arg.trim().match(/^(\w+)(?:\[(\d+)\])?$/);
    if (!m || !regs[m[1]]) throw new Error(`Registre inconnu : ${arg.trim()}`);
    const r = regs[m[1]];
    if (m[2] === undefined) return Array.from({ length: r.size }, (_, i) => r.start + i);
    if (Number(m[2]) >= r.size) throw new Error(`Indice hors limite : ${arg.trim()}`);
    return [r.start + Number(m[2])];
  };
  for (const raw of text.split(';')) {
    const st = raw.trim().replace(/\s+/g, ' ');
    if (!st || /^(OPENQASM|include|barrier)\b/.test(st)) continue;
    let m;
    if ((m = st.match(/^qreg (\w+)\[(\d+)\]$/))) { qregs[m[1]] = { start: nq, size: Number(m[2]) }; nq += Number(m[2]); continue; }
    if ((m = st.match(/^creg (\w+)\[(\d+)\]$/))) { cregs[m[1]] = { start: nc, size: Number(m[2]) }; nc += Number(m[2]); continue; }
    if ((m = st.match(/^measure (.+) -> (.+)$/))) {
      const q = resolve(qregs, m[1]); const c = resolve(cregs, m[2]);
      if (q.length !== c.length) throw new Error(`measure : tailles différentes (${st})`);
      q.forEach((qi, i) => ops.push({ gate: 'measure', q: [qi], c: c[i] }));
      continue;
    }
    if ((m = st.match(/^(\w+)\s*(?:\(([^)]*)\))?\s*(.+)$/))) {
      const params = m[2] ? m[2].split(',').map((p) => evalParam(p.trim())) : [];
      const lists = m[3].split(',').map((a) => resolve(qregs, a));
      const n = Math.max(...lists.map((l) => l.length));
      for (let i = 0; i < n; i++) ops.push({ gate: m[1].toLowerCase(), params, q: lists.map((l) => (l.length === 1 ? l[0] : l[i])) });
      continue;
    }
    throw new Error(`Instruction non comprise : ${st}`);
  }
  if (!nq) throw new Error('Aucun qubit déclaré (qreg q[n];)');
  if (nq > MAX_QUBITS) throw new Error(`Trop de qubits pour le simulateur (${nq} > ${MAX_QUBITS}). Utilise un vrai ordinateur quantique.`);
  return { nq, nc, ops };
}

// ---------- Simulation exacte (vecteur d'état) ----------

const S2 = Math.SQRT1_2;
const c = (re, im = 0) => [re, im];
const expi = (t) => [Math.cos(t), Math.sin(t)];
const GATES = {
  id: () => [c(1), c(0), c(0), c(1)],
  x: () => [c(0), c(1), c(1), c(0)],
  y: () => [c(0), c(0, -1), c(0, 1), c(0)],
  z: () => [c(1), c(0), c(0), c(-1)],
  h: () => [c(S2), c(S2), c(S2), c(-S2)],
  s: () => [c(1), c(0), c(0), c(0, 1)],
  sdg: () => [c(1), c(0), c(0), c(0, -1)],
  t: () => [c(1), c(0), c(0), expi(Math.PI / 4)],
  tdg: () => [c(1), c(0), c(0), expi(-Math.PI / 4)],
  sx: () => [c(0.5, 0.5), c(0.5, -0.5), c(0.5, -0.5), c(0.5, 0.5)],
  rx: (t) => [c(Math.cos(t / 2)), c(0, -Math.sin(t / 2)), c(0, -Math.sin(t / 2)), c(Math.cos(t / 2))],
  ry: (t) => [c(Math.cos(t / 2)), c(-Math.sin(t / 2)), c(Math.sin(t / 2)), c(Math.cos(t / 2))],
  rz: (t) => [expi(-t / 2), c(0), c(0), expi(t / 2)],
  p: (l) => [c(1), c(0), c(0), expi(l)],
  u: (t, p, l) => [c(Math.cos(t / 2)), [-Math.cos(l) * Math.sin(t / 2), -Math.sin(l) * Math.sin(t / 2)],
    [Math.cos(p) * Math.sin(t / 2), Math.sin(p) * Math.sin(t / 2)], [Math.cos(p + l) * Math.cos(t / 2), Math.sin(p + l) * Math.cos(t / 2)]],
};
GATES.u1 = GATES.p; GATES.u3 = GATES.u; GATES.u2 = (p, l) => GATES.u(Math.PI / 2, p, l);
// Portes contrôlées : [nombre de contrôles, porte de base]
const CONTROLLED = { cx: [1, 'x'], cnot: [1, 'x'], cy: [1, 'y'], cz: [1, 'z'], ch: [1, 'h'], crx: [1, 'rx'], cry: [1, 'ry'], crz: [1, 'rz'], cp: [1, 'p'], cu1: [1, 'p'], ccx: [2, 'x'], toffoli: [2, 'x'] };

function apply(re, im, m, target, controls) {
  const bit = 1 << target;
  let mask = 0;
  for (const k of controls) mask |= 1 << k;
  const [[a, b], [cR, cI], [d, e], [f, g]] = m; // m00, m01, m10, m11
  for (let i = 0; i < re.length; i++) {
    if (i & bit || (i & mask) !== mask) continue;
    const j = i | bit;
    const r0 = re[i], i0 = im[i], r1 = re[j], i1 = im[j];
    re[i] = a * r0 - b * i0 + cR * r1 - cI * i1; im[i] = a * i0 + b * r0 + cR * i1 + cI * r1;
    re[j] = d * r0 - e * i0 + f * r1 - g * i1; im[j] = d * i0 + e * r0 + f * i1 + g * r1;
  }
}

export function simulate(qasm, shots = 1024) {
  const { nq, nc, ops } = parseQasm(qasm);
  const re = new Float64Array(1 << nq); const im = new Float64Array(1 << nq);
  re[0] = 1;
  const measured = []; // [qubit, bit classique]
  for (const op of ops) {
    if (op.gate === 'measure') { measured.push([op.q[0], op.c]); continue; }
    if (measured.some(([q]) => op.q.includes(q))) throw new Error('Ce simulateur ne gère que les mesures en fin de circuit.');
    if (op.gate === 'swap') { for (const [a, b] of [[0, 1], [1, 0], [0, 1]]) apply(re, im, GATES.x(), op.q[b], [op.q[a]]); continue; }
    const ctl = CONTROLLED[op.gate];
    const base = ctl ? ctl[1] : op.gate;
    if (!GATES[base]) throw new Error(`Porte non prise en charge : ${op.gate}. Portes : ${[...Object.keys(GATES), ...Object.keys(CONTROLLED), 'swap'].join(', ')}`);
    const nCtl = ctl ? ctl[0] : 0;
    if (op.q.length !== nCtl + 1 || new Set(op.q).size !== op.q.length) throw new Error(`Mauvais qubits pour ${op.gate}`);
    apply(re, im, GATES[base](...op.params), op.q[nCtl], op.q.slice(0, nCtl));
  }
  // Sans mesure explicite : on mesure tous les qubits.
  const map = measured.length ? measured : Array.from({ length: nq }, (_, i) => [i, i]);
  const width = measured.length ? nc : nq;
  const probs = {};
  for (let i = 0; i < re.length; i++) {
    const p = re[i] * re[i] + im[i] * im[i];
    if (p < 1e-12) continue;
    const bits = Array(width).fill('0');
    for (const [q, cb] of map) bits[width - 1 - cb] = (i >> q) & 1 ? '1' : '0'; // convention Qiskit : bit 0 à droite
    const key = bits.join('');
    probs[key] = (probs[key] || 0) + p;
  }
  const keys = Object.keys(probs);
  const counts = {};
  for (let s = 0; s < shots; s++) {
    let r = Math.random(); let k = keys[keys.length - 1];
    for (const key of keys) { r -= probs[key]; if (r <= 0) { k = key; break; } }
    counts[k] = (counts[k] || 0) + 1;
  }
  const top = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 32));
  return { qubits: nq, shots, probabilities: top(Object.fromEntries(keys.map((k) => [k, Number(probs[k].toFixed(6))]))), counts: top(counts) };
}

// ---------- Vrais ordinateurs quantiques IBM (via Qiskit) ----------

function ibm(args, stdin = '') {
  const cfg = load('settings').quantum || {};
  return new Promise((resolve) => {
    const child = spawn(cfg.python || 'python3', [path.resolve('scripts/ibm_quantum.py'), ...args], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, IBM_QUANTUM_TOKEN: cfg.ibmToken || '', IBM_QUANTUM_INSTANCE: cfg.ibmInstance || '' },
    });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const t = setTimeout(() => child.kill('SIGKILL'), 180000);
    child.on('close', () => {
      clearTimeout(t);
      try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ error: (err || out || 'Aucune réponse').slice(-600) }); }
    });
    child.on('error', (e) => { clearTimeout(t); resolve({ error: `Python introuvable : ${e.message}` }); });
    child.stdin.end(stdin);
  });
}

const QASM_HELP = 'Circuit en OpenQASM 2, ex : OPENQASM 2.0; include "qelib1.inc"; qreg q[2]; creg c[2]; h q[0]; cx q[0],q[1]; measure q -> c;';

export const QUANTUM_TOOLS = [
  defineTool('quantum_simulate', `Simuler exactement un circuit quantique (jusqu'à ${MAX_QUBITS} qubits) : renvoie les probabilités et les résultats de mesure. Gratuit et instantané.`, {
    qasm: { type: 'string', description: QASM_HELP }, shots: { type: 'integer', description: 'Nombre de mesures (1024 par défaut)' },
  }, ['qasm'], ({ qasm, shots = 1024 }) => simulate(qasm, Math.min(Math.max(shots, 1), 100000))),
  defineTool('quantum_run_ibm', "Envoyer un circuit sur un VRAI ordinateur quantique IBM (quota gratuit limité : à utiliser avec parcimonie, après avoir validé le circuit avec quantum_simulate). Renvoie un identifiant de job.", {
    qasm: { type: 'string', description: QASM_HELP }, shots: { type: 'integer' }, backend: { type: 'string', description: 'Nom de la machine (optionnel : la moins occupée par défaut)' },
  }, ['qasm'], ({ qasm, shots = 1024, backend }) => {
    parseQasm(qasm.replace(/qreg (\w+)\[(\d+)\]/g, (m, n, s) => (Number(s) > MAX_QUBITS ? `qreg ${n}[1]` : m))); // validation rapide de la syntaxe
    return ibm(['submit', '--shots', String(Math.min(shots, 8192)), ...(backend ? ['--backend', backend] : [])], qasm);
  }, { kind: 'exec', adminOnly: true }),
  defineTool('quantum_ibm_result', "Récupérer l'état ou le résultat d'un job envoyé sur un ordinateur quantique IBM.", { job_id: { type: 'string' } }, ['job_id'],
    ({ job_id }) => { if (!/^[\w-]+$/.test(job_id)) throw new Error('Identifiant invalide'); return ibm(['result', job_id]); }, { adminOnly: true }),
];
