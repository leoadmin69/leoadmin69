// Cookie anonyme d'appareil (l1_dev), SIGNÉ par le serveur : « aléa.naissance.signature ».
// Avant, n'importe quel texte aléatoire était accepté : un script pouvait s'inventer un nouvel « appareil » à chaque
// requête (revoter, re-signaler, contourner un blocage). Maintenant, seul le serveur fabrique des appareils, au compte-gouttes
// par réseau, et chaque appareil a un âge vérifiable (un appareil tout neuf pèse moins dans les actions sensibles).
// L'identité reste la partie « aléa » : les anciens cookies (aléa seul) sont convertis sans rien perdre (votes, pseudo…).
import crypto from 'node:crypto';
import { SECRET, parseCookies } from './auth.js';

export const DEVICE_COOKIE = 'l1_dev';
const RAW = /^[A-Za-z0-9_-]{20,64}$/;
const SIGNED = /^([A-Za-z0-9_-]{20,64})\.([0-9a-z]{6,12})\.([A-Za-z0-9_-]{16})$/;
const sign = (id, born36) => crypto.createHmac('sha256', SECRET).update(`dev|${id}|${born36}`).digest('base64url').slice(0, 16);

// { id, born, signed } ou null
export function readDevice(cookieHeader) {
  const v = parseCookies(cookieHeader)[DEVICE_COOKIE] || '';
  const m = SIGNED.exec(v);
  if (m) {
    const a = Buffer.from(m[3]), b = Buffer.from(sign(m[1], m[2]));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { id: m[1], born: parseInt(m[2], 36), signed: true };
    return null; // signature fausse : cookie fabriqué
  }
  if (RAW.test(v)) return { id: v, born: null, signed: false }; // ancien cookie (avant la signature)
  return null;
}

export function deviceCookie(id, born = Date.now()) {
  const b36 = born.toString(36);
  return `${DEVICE_COOKIE}=${id}.${b36}.${sign(id, b36)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 86400}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export const newDeviceId = () => crypto.randomBytes(24).toString('base64url');

// Remplace la valeur du cookie dans la requête par l'identité seule : le reste du code (empreintes, votes) ne change pas.
export function setRequestDevice(req, id) {
  const parts = String(req.headers.cookie || '').split(/;\s*/).filter((p) => p && !p.startsWith(`${DEVICE_COOKIE}=`));
  if (id) parts.push(`${DEVICE_COOKIE}=${id}`);
  req.headers.cookie = parts.join('; ');
}
