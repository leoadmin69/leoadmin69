// Contrôle de matériel (lumières, prises, relais, capteurs, Raspberry Pi…) avec autorisation de l'admin.
// L'IA ne peut déclencher QUE les actions que l'admin a déclarées : jamais d'URL ou de commande inventée.
//
// Types d'appareils :
//  - 'homeassistant' : passe par Home Assistant (couvre la plupart des objets connectés : Zigbee, Wi-Fi, Shelly, ESPHome…)
//  - 'http'          : appareil avec une API web (ESP32, Tasmota, Shelly, relais réseau…)
//  - 'command'       : commande lancée sur la machine qui héberge l'IA (ex : GPIO d'un Raspberry Pi)
//  - 'remote'        : appareil distant (PC, Raspberry Pi, serveur…) sur lequel tourne l'agent nova-agent.mjs.
//                      L'agent se connecte à l'IA (connexion sortante), donc l'appareil est joignable de n'importe où.
//
// Permission par appareil : 'off' (interdit), 'ask' (autorisation à chaque fois), 'auto' (libre).
import { spawn } from 'node:child_process';
import { load, newId } from './store.js';
import { defineTool } from './tools.js';
import { notify } from './notify.js';

// ---------- Appareils distants : file d'ordres relevée par l'agent ----------
const queues = new Map();  // deviceId -> [job]
const waiters = new Map(); // deviceId -> fonction qui réveille l'agent en attente
const results = new Map(); // jobId -> resolve
const seen = new Map();    // deviceId -> { at, host, os }
export const deviceOnline = (id) => Date.now() - (seen.get(id)?.at || 0) < 60000;
export const deviceInfo = (id) => seen.get(id) || null;

/** Appelé par l'agent : attend un ordre (jusqu'à 25 s). */
export function remotePoll(id, info) {
  seen.set(id, { at: Date.now(), ...info });
  const q = queues.get(id) || [];
  if (q.length) return Promise.resolve(q.shift());
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiters.delete(id); seen.set(id, { at: Date.now(), ...info }); resolve(null); }, 25000);
    waiters.set(id, () => { clearTimeout(timer); waiters.delete(id); resolve((queues.get(id) || []).shift() || null); });
  });
}
export function remoteResult(jobId, data) { results.get(jobId)?.(data); results.delete(jobId); }

function runRemote(d, command, value, label) {
  if (!deviceOnline(d.id)) throw new Error(`L'appareil « ${d.name} » est hors ligne (l'agent distant n'est pas connecté).`);
  const job = { id: newId() + newId(), command, value: value ?? '', label };
  return new Promise((resolve) => {
    const timer = setTimeout(() => { results.delete(job.id); resolve("Pas de réponse de l'appareil après 120 s."); }, 120000);
    results.set(job.id, (r) => { clearTimeout(timer); resolve(`Code ${r.code}\n${String(r.output || '').slice(0, 6000)}`); });
    queues.set(d.id, [...(queues.get(d.id) || []), job]);
    waiters.get(d.id)?.();
  });
}

const findDevice = (ref) => {
  const r = String(ref || '').toLowerCase();
  return load('devices').find((d) => d.id === ref || d.name.toLowerCase() === r);
};
const entities = (d) => (d.entities || '').split(/[\s,]+/).map((e) => e.trim()).filter(Boolean);
const findAction = (d, name) => (d.actions || []).find((a) => a.name.toLowerCase() === String(name || '').toLowerCase());

function runCommand(command, value) {
  return new Promise((resolve) => {
    // La valeur est passée en variable d'environnement (VALUE), jamais insérée dans la commande : pas d'injection possible.
    const child = spawn('bash', ['-c', command], { env: { PATH: process.env.PATH, HOME: process.env.HOME, VALUE: value ?? '' } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const t = setTimeout(() => child.kill('SIGKILL'), 30000);
    child.on('close', (code) => { clearTimeout(t); resolve(`Code ${code}\n${out.slice(0, 3000)}`); });
    child.on('error', (e) => { clearTimeout(t); resolve('Erreur : ' + e.message); });
  });
}

async function httpAction(a, value) {
  const fill = (s, enc) => String(s || '').replaceAll('{{value}}', enc ? encodeURIComponent(value ?? '') : JSON.stringify(value ?? '').slice(1, -1));
  const r = await fetch(fill(a.url, true), {
    method: a.method || 'GET',
    headers: a.body ? { 'Content-Type': 'application/json' } : {},
    body: a.body && a.method !== 'GET' ? fill(a.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return `HTTP ${r.status}\n${(await r.text()).slice(0, 3000)}`;
}

async function ha(d, path, body) {
  const r = await fetch(`${d.haUrl.replace(/\/$/, '')}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${d.haToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Home Assistant HTTP ${r.status} : ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}
const haState = (s) => ({ entity: s.entity_id, state: s.state, unit: s.attributes?.unit_of_measurement, name: s.attributes?.friendly_name });

// ---------- Outils ----------

function listDevices() {
  const list = load('devices').filter((d) => d.permission !== 'off');
  if (!list.length) return "Aucun appareil autorisé. L'admin peut en ajouter dans Admin → Appareils.";
  return list.map((d) => {
    const perm = d.permission === 'auto' ? 'contrôle libre' : 'autorisation requise à chaque action';
    const what = d.type === 'homeassistant'
      ? `entités : ${entities(d).join(', ')} (actions : turn_on, turn_off, toggle, ou un service Home Assistant comme light.turn_on)`
      : `actions : ${(d.actions || []).map((a) => `${a.name}${a.read ? ' (lecture)' : ''}${a.description ? ' — ' + a.description : ''}`).join(' ; ')}` +
        (d.type === 'remote' && d.allowShell ? ' ; shell (commande libre : mets la commande dans value)' : '');
    const net = d.type === 'remote' ? (deviceOnline(d.id) ? `, EN LIGNE (${deviceInfo(d.id)?.os || '?'})` : ', HORS LIGNE') : '';
    return `• ${d.name} [${d.type}, ${perm}${net}] ${d.description || ''}\n  ${what}`;
  }).join('\n');
}

async function readDevice({ device, target }) {
  const d = findDevice(device);
  if (!d || d.permission === 'off') throw new Error(`Appareil inconnu ou désactivé : ${device}`);
  if (d.type === 'homeassistant') {
    const list = target ? [target] : entities(d);
    for (const e of list) if (!entities(d).includes(e)) throw new Error(`Entité non autorisée : ${e}`);
    const states = await Promise.all(list.map((e) => ha(d, `states/${e}`)));
    return states.map(haState);
  }
  const a = target ? findAction(d, target) : (d.actions || []).find((x) => x.read);
  if (!a || !a.read) throw new Error(`Aucune action de lecture « ${target || ''} » sur ${d.name}.`);
  if (d.type === 'remote') return runRemote(d, a.command, '', `Lecture : ${a.name}`);
  return d.type === 'http' ? httpAction(a) : runCommand(a.command);
}

async function controlDevice({ device, action, entity, value }, ctx) {
  const d = findDevice(device);
  if (!d || d.permission === 'off') throw new Error(`Appareil inconnu ou désactivé : ${device}`);
  const label = `${d.name} → ${action}${entity ? ' ' + entity : ''}${value !== undefined ? ' = ' + JSON.stringify(value) : ''}`;

  // Autorisation : demandée à chaque fois pour les appareils en mode « ask », même en mode Auto.
  if (d.permission === 'ask') {
    if (ctx.mission) {
      await notify('🔐 Autorisation matériel demandée', `Mission « ${ctx.mission} » voulait : ${label}. Action non effectuée (l'appareil demande ton autorisation). Passe-le en « auto » ou lance l'action toi-même.`, { priority: 'high' });
      throw new Error("Cet appareil exige l'autorisation de l'admin, absent pendant une mission. Notification envoyée, action non effectuée.");
    }
    const ok = await ctx.approve({ name: 'control_device', args: { device: d.name, action, entity, value }, agent: ctx.agentName });
    if (!ok) throw new Error("L'admin a refusé cette action matérielle.");
  }

  if (d.type === 'homeassistant') {
    if (!entity || !entities(d).includes(entity)) throw new Error(`Précise une entité autorisée : ${entities(d).join(', ')}`);
    const [domain, service] = action.includes('.') ? action.split('.') : [entity.split('.')[0], action];
    let data = { entity_id: entity };
    if (value !== undefined && value !== '') {
      if (typeof value === 'object') data = { ...value, entity_id: entity };
      else if (domain === 'light' && !isNaN(value)) data.brightness_pct = Number(value);
      else if (domain === 'climate' && !isNaN(value)) data.temperature = Number(value);
      else if (!isNaN(value)) data.value = Number(value);
      else data.option = value;
    }
    await ha(d, `services/${domain}/${service}`, data);
    const [s] = await ha(d, `states/${entity}`).then((x) => [x]).catch(() => [null]);
    return `Fait : ${label}.${s ? ` Nouvel état : ${s.state}` : ''}`;
  }
  if (d.type === 'remote' && action === 'shell') {
    if (!d.allowShell) throw new Error("Les commandes libres ne sont pas autorisées sur cet appareil : utilise une action déclarée.");
    if (!value) throw new Error('Mets la commande à exécuter dans value.');
    return `Fait : ${d.name} → $ ${value}\n${await runRemote(d, String(value), '', `$ ${String(value).slice(0, 120)}`)}`;
  }
  const a = findAction(d, action);
  if (!a) throw new Error(`Action inconnue « ${action} ». Actions : ${(d.actions || []).map((x) => x.name).join(', ')}`);
  const out = d.type === 'http' ? await httpAction(a, value) : d.type === 'remote' ? await runRemote(d, a.command, value, `Action : ${a.name}`) : await runCommand(a.command, value);
  return `Fait : ${label}\n${out}`;
}

export const DEVICE_TOOLS = [
  defineTool('list_devices', 'Lister les appareils (matériel) que tu as le droit de lire ou contrôler.', {}, [], listDevices, { adminOnly: true, group: 'devices' }),
  defineTool('read_device', "Lire l'état d'un appareil ou d'un capteur (température, état allumé/éteint…).", {
    device: { type: 'string' }, target: { type: 'string', description: "Entité Home Assistant ou action de lecture (optionnel)" },
  }, ['device'], readDevice, { adminOnly: true, group: 'devices' }),
  defineTool('control_device', 'Agir sur un appareil (allumer, éteindre, régler…). Uniquement les actions déclarées par l\'admin.', {
    device: { type: 'string' }, action: { type: 'string', description: 'Nom de l\'action, ou turn_on/turn_off/toggle/service pour Home Assistant' },
    entity: { type: 'string', description: 'Entité Home Assistant (ex : light.salon)' }, value: { type: 'string', description: 'Valeur optionnelle (luminosité, température…)' },
  }, ['device', 'action'], controlDevice, { kind: 'device', adminOnly: true, group: 'devices' }),
];
