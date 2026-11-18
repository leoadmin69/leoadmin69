// Photos éphémères du chat (« instants ») : prises avec la caméra dans l'app, jamais importées.
// - une seule vue par appareil (vérifiée ici, côté serveur) ; ensuite la bulle reste floue ;
// - les modos peuvent toujours la voir et la supprimer ;
// - effacées automatiquement au bout de 24 h ;
// - métadonnées retirées (photo ré-encodée par le téléphone + nettoyage des blocs EXIF ici).
// Note honnête : un site web ne peut pas bloquer les captures d'écran ; l'app les décourage
// (affichage 10 s, pseudo du·de la spectateur·rice en filigrane, fermeture si on quitte l'app).
import fs from 'node:fs';
import path from 'node:path';
import { db, save, DATA_DIR } from './store.js';
import { remoteEnabled, putBuffer, fetchObject, removeObjects } from './remote.js';

export const SNAP_TTL = Number(process.env.CHAT_PHOTO_HOURS || 24) * 3600e3;
const DIR = path.join(DATA_DIR, 'snaps');
fs.mkdirSync(DIR, { recursive: true });
const file = (id) => path.join(DIR, `${id}.jpg`);

// Retire les blocs APPn (EXIF, XMP…) et les commentaires d'un JPEG.
export function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); }
    const len = buf.readUInt16BE(i + 2);
    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}
export const isJpeg = (b) => b?.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export async function saveSnap(id, buf) {
  fs.writeFileSync(file(id), buf);
  if (remoteEnabled()) await putBuffer(`snaps/${id}.jpg`, buf, 'image/jpeg').catch((e) => console.error('[photo] Supabase', e.message));
}
export async function readSnap(id) {
  if (fs.existsSync(file(id))) return fs.readFileSync(file(id));
  if (!remoteEnabled()) return null;
  const r = await fetchObject(`snaps/${id}.jpg`).catch(() => null);
  if (!r?.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file(id), buf); // copie locale pour les vues suivantes
  return buf;
}
export function deleteSnap(id) {
  try { fs.unlinkSync(file(id)); } catch {}
  if (remoteEnabled()) removeObjects([`snaps/${id}.jpg`]).catch((e) => console.error('[photo] suppression', e.message));
}

// Efface les photos de plus de 24 h (le message reste, marqué « expirée »)
export function purgeSnaps() {
  let n = 0;
  for (const m of db.messages || []) {
    if (!m.photo || m.photo.gone) continue;
    if (Date.now() - new Date(m.at).getTime() > SNAP_TTL) { deleteSnap(m.photo.id); m.photo.gone = true; m.photo.thumb = ''; n++; }
  }
  if (n) save();
  return n;
}
