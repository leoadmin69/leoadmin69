// Comptes modos (étudiant·es syndiqué·es) : mot de passe haché (scrypt), session = cookie signé (HMAC).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, newId, now, save, DATA_DIR } from './store.js';

const SECRET_FILE = path.join(DATA_DIR, 'secret');
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch {}
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}
export const SECRET = loadSecret();
const SESSION_DAYS = 14;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') };
}
export function verifyPassword(pw, mod) {
  if (!mod?.salt) return false;
  const h = crypto.scryptSync(String(pw), mod.salt, 64);
  const ref = Buffer.from(mod.hash, 'hex');
  return h.length === ref.length && crypto.timingSafeEqual(h, ref);
}

const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
export function createToken(mod) {
  const payload = Buffer.from(JSON.stringify({ uid: mod.id, v: mod.version || 1, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (p.exp < Date.now()) return null;
    const mod = db.mods.find((m) => m.id === p.uid && !m.disabled);
    if (!mod || (mod.version || 1) !== p.v) return null;
    return mod;
  } catch { return null; }
}

export const COOKIE = 'l1_session';
export function cookieHeader(token, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}
export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Premier compte admin créé depuis les variables d'environnement.
export function ensureAdmin() {
  if (db.mods.some((m) => m.role === 'admin')) return;
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    console.log(`\n[admin] Aucun ADMIN_PASSWORD fourni. Compte créé : ${username} / ${password}\n[admin] Change-le dès la première connexion.\n`);
  }
  db.mods.push({ id: newId(), username, org: 'Administration du site', role: 'admin', ...hashPassword(password), createdAt: now(), version: 1 });
  save();
}

export const publicMod = (m) => ({ id: m.id, username: m.username, org: m.org, role: m.role, createdAt: m.createdAt, disabled: !!m.disabled });
