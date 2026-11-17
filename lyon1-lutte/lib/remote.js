// Stockage permanent GRATUIT pour les hébergeurs sans disque (Render gratuit…) : Supabase Storage.
// - la base (db.json) y est recopiée après chaque modification, et relue au démarrage ;
// - les photos/vidéos validées y sont envoyées, puis servies par le site.
// Configuration : SUPABASE_URL (https://xxxx.supabase.co) et SUPABASE_SERVICE_KEY (clé « service_role » ou « secret »).
// Le compartiment (bucket) est PRIVÉ : rien n'est accessible sans passer par le site.
import fs from 'node:fs';
import { Readable } from 'node:stream';

const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = () => process.env.SUPABASE_SERVICE_KEY || '';
export const BUCKET = process.env.SUPABASE_BUCKET || 'ladoua-en-lutte';
export const remoteEnabled = () => !!(URL_() && KEY());

function headers(extra = {}) {
  const k = KEY();
  // Les nouvelles clés « sb_secret_… » vont seulement dans l'en-tête apikey ; les anciennes (JWT) dans les deux.
  return { apikey: k, ...(k.startsWith('sb_') ? {} : { Authorization: `Bearer ${k}` }), ...extra };
}
const objUrl = (p) => `${URL_()}/storage/v1/object/${BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`;

async function check(res, what) {
  if (res.ok) return res;
  const body = await res.text().catch(() => '');
  const e = new Error(`Supabase ${what} : HTTP ${res.status} ${body.slice(0, 200)}`);
  e.status = res.status;
  throw e;
}

// Crée le compartiment privé s'il n'existe pas encore.
export async function ensureBucket() {
  const res = await fetch(`${URL_()}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    signal: AbortSignal.timeout(20000),
  });
  if (res.ok) return 'created';
  const body = await res.text().catch(() => '');
  if (res.status === 409 || /already exists|Duplicate/i.test(body)) return 'exists';
  throw new Error(`Supabase bucket : HTTP ${res.status} ${body.slice(0, 200)}`);
}

export async function getJson(p) {
  const res = await fetch(objUrl(p), { headers: headers(), signal: AbortSignal.timeout(30000) });
  if (res.status === 404 || res.status === 400) {
    const body = await res.text().catch(() => '');
    if (res.status === 404 || /not.?found/i.test(body)) return null;
    throw new Error(`Supabase lecture : HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  await check(res, 'lecture');
  return res.json();
}

export async function putBuffer(p, buf, type = 'application/json') {
  const res = await fetch(objUrl(p), {
    method: 'POST',
    headers: headers({ 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'no-cache' }),
    body: buf,
    signal: AbortSignal.timeout(60000),
  });
  await check(res, 'écriture');
}

export async function putFile(p, file, type) {
  const size = fs.statSync(file).size;
  const res = await fetch(objUrl(p), {
    method: 'POST',
    headers: headers({ 'Content-Type': type, 'Content-Length': String(size), 'x-upsert': 'true' }),
    body: Readable.toWeb(fs.createReadStream(file)),
    duplex: 'half',
    signal: AbortSignal.timeout(10 * 60000),
  });
  await check(res, 'envoi de fichier');
}

// Renvoie la réponse brute (pour la transmettre au navigateur, lecture vidéo par morceaux comprise).
export function fetchObject(p, range) {
  return fetch(objUrl(p), { headers: headers(range ? { Range: range } : {}), signal: AbortSignal.timeout(60000) });
}

export async function removeObjects(paths) {
  if (!paths.length) return;
  const res = await fetch(`${URL_()}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: paths }),
    signal: AbortSignal.timeout(30000),
  });
  await check(res, 'suppression');
}
