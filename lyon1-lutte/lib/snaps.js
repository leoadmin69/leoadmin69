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

// Retire les blocs APPn (EXIF, XMP…) et les commentaires d'un JPEG, et coupe tout ce qui suit la fin de l'image
// (vidéo des « photos animées », fichier caché…). Renvoie null si ce n'est pas un vrai JPEG.
export function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2, sof = false;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xda) {
      if (!sof) return null;
      // données compressées : la fin d'image est le premier FF D9 (FF 00 et FF D0-D7 font partie des données)
      for (let k = i + 2; k < buf.length - 1; k++) {
        if (buf[k] === 0xff && buf[k + 1] === 0xd9) { out.push(buf.subarray(i, k + 2)); return Buffer.concat(out); }
      }
      return null;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) sof = true;
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
  for (const b of db.buildings || []) {
    if (!b.terrainProof) continue;
    if (Date.now() - new Date(b.terrainProof.at).getTime() > SNAP_TTL) { deleteSnap(b.terrainProof.id); delete b.terrainProof; n++; }
  }
  if (n) save();
  return n;
}

// Ménage : fichiers du dossier qui ne correspondent à aucune photo en cours (envoi interrompu, plantage…)
export function sweepSnaps(isUsed) {
  let n = 0;
  for (const f of fs.readdirSync(DIR)) {
    const id = f.replace(/\.jpg$/, '');
    try {
      if (isUsed(id)) continue;
      if (Date.now() - fs.statSync(path.join(DIR, f)).mtimeMs < 10 * 60e3) continue; // en cours d'envoi
      fs.unlinkSync(path.join(DIR, f)); n++;
    } catch {}
  }
  return n;
}
