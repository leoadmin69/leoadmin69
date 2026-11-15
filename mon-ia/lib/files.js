// Fichiers envoyés à l'IA : images et captures d'écran (vision), PDF, Word, PowerPoint, Excel, textes et code.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DATA_DIR, newId, now } from './store.js';
import { defineTool } from './tools.js';

const UP = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UP, { recursive: true });

const TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html?|css|js|mjs|ts|tsx|jsx|py|java|c|cpp|h|cs|go|rs|php|rb|sh|sql|yaml|yml|ini|toml|log|env\.example|svg)$/i;
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)$/i;
export const MAX_UPLOAD = 20e6;

function kindOf(name, type) {
  if (IMAGE_TYPES.test(type) || /\.(png|jpe?g|gif|webp)$/i.test(name)) return 'image';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (/\.(docx|pptx|xlsx)$/i.test(name)) return 'office';
  if (/^text\//.test(type) || TEXT_EXT.test(name)) return 'text';
  return 'other';
}

// ---------- Extraction de texte ----------

export async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 500); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(`--- Page ${i} ---\n` + tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n').trim());
  }
  const text = pages.join('\n\n');
  return text.replace(/--- Page \d+ ---/g, '').trim()
    ? `(${doc.numPages} pages)\n\n${text}`
    : `(${doc.numPages} pages) Ce PDF ne contient pas de texte extractible (document scanné) : demande à l'utilisateur une capture d'écran des pages utiles.`;
}

// Petit lecteur ZIP (les fichiers Office sont des archives ZIP de XML).
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Archive invalide');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = () => (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    p += 46 + nameLen + extra + comment;
  }
  return files;
}
const xmlText = (xml) => xml.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function officeText(buf, name) {
  const z = unzip(buf);
  const ordered = (re) => Object.keys(z).filter((k) => re.test(k)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/(\d+)\.xml$/)?.[1] || 0));
  if (/\.docx$/i.test(name)) {
    return xmlText(z['word/document.xml']().replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n')).replace(/\n{3,}/g, '\n\n').trim();
  }
  if (/\.pptx$/i.test(name)) {
    return ordered(/^ppt\/slides\/slide\d+\.xml$/).map((k, i) => `--- Diapositive ${i + 1} ---\n` + xmlText(z[k]().replace(/<\/a:p>/g, '\n'))).join('\n\n').trim();
  }
  // xlsx : cellules de chaque feuille, ligne par ligne
  const shared = z['xl/sharedStrings.xml'] ? [...z['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1])) : [];
  return ordered(/^xl\/worksheets\/sheet\d+\.xml$/).map((k, i) => {
    const rows = [...z[k]().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => [...r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '')?.[1] ?? xmlText(/<is>([\s\S]*?)<\/is>/.exec(c[2] || '')?.[1] || '');
      return /t="s"/.test(c[1]) ? shared[Number(v)] ?? '' : v;
    }).join(' | '));
    return `--- Feuille ${i + 1} ---\n` + rows.join('\n');
  }).join('\n\n').trim();
}

export async function extractText(buffer, name, type) {
  const kind = kindOf(name, type);
  if (kind === 'pdf') return pdfText(buffer);
  if (kind === 'office') return officeText(buffer, name);
  if (kind === 'text') return buffer.toString('utf8');
  return '';
}

// ---------- Stockage ----------

const metaPath = (id) => path.join(UP, `${id}.json`);
export function getUpload(id) {
  if (!/^[\w-]+$/.test(id || '')) return null;
  try { return JSON.parse(fs.readFileSync(metaPath(id), 'utf8')); } catch { return null; }
}
export const uploadPath = (meta) => path.join(UP, meta.file);
export function uploadText(id) { try { return fs.readFileSync(path.join(UP, `${id}.txt`), 'utf8'); } catch { return ''; } }

export async function saveUpload(buffer, name, type) {
  if (buffer.length > MAX_UPLOAD) throw new Error('Fichier trop volumineux (20 Mo max).');
  const id = newId() + newId();
  const safeName = String(name || 'fichier').replace(/[^\w.\- ()À-ÿ]/g, '_').slice(0, 120);
  const ext = (path.extname(safeName) || '').toLowerCase().slice(0, 8);
  const kind = kindOf(safeName, type);
  if (kind === 'other') throw new Error('Type de fichier non pris en charge (images, PDF, Word, PowerPoint, Excel, textes et code).');
  const meta = { id, name: safeName, type: type || 'application/octet-stream', size: buffer.length, kind, file: id + ext, createdAt: now() };
  fs.writeFileSync(path.join(UP, meta.file), buffer);
  if (kind !== 'image') {
    let text = '';
    try { text = await extractText(buffer, safeName, type); } catch (e) { text = `(Lecture impossible : ${e.message})`; }
    fs.writeFileSync(path.join(UP, `${id}.txt`), text);
    meta.chars = text.length;
  }
  fs.writeFileSync(metaPath(id), JSON.stringify(meta));
  return meta;
}

// ---------- Construction du message pour le modèle ----------

const DOC_INLINE = 30000;

/** Transforme un message utilisateur avec pièces jointes au format multimodal (compatible OpenAI). */
export function toModelContent(text, fileIds = [], { withImages = true } = {}) {
  const files = fileIds.map(getUpload).filter(Boolean);
  if (!files.length) return text;
  const parts = [];
  let docs = '';
  for (const f of files) {
    if (f.kind === 'image') {
      if (withImages) {
        const b64 = fs.readFileSync(uploadPath(f)).toString('base64');
        parts.push({ type: 'image_url', image_url: { url: `data:${f.type};base64,${b64}` } });
      } else docs += `\n[Image jointe plus tôt : ${f.name}]`;
    } else {
      const t = uploadText(f.id);
      docs += `\n\n=== Document joint : ${f.name} (id ${f.id}) ===\n${t.slice(0, DOC_INLINE)}`;
      if (t.length > DOC_INLINE) docs += `\n… [document long : ${t.length} caractères au total. Lis la suite avec read_document id=${f.id} offset=${DOC_INLINE}]`;
    }
  }
  const fullText = (text || '(voir pièces jointes)') + docs;
  return parts.length ? [{ type: 'text', text: fullText }, ...parts] : fullText;
}

export const FILE_TOOLS = [
  defineTool('read_document', "Lire la suite d'un document joint (PDF, Word…) à partir d'une position.", {
    id: { type: 'string' }, offset: { type: 'integer' },
  }, ['id'], ({ id, offset = 0 }) => {
    const meta = getUpload(id);
    if (!meta) throw new Error('Document introuvable');
    const t = uploadText(id);
    const chunk = t.slice(offset, offset + 20000);
    return chunk + (offset + 20000 < t.length ? `\n… [suite : offset=${offset + 20000} sur ${t.length}]` : '\n[fin du document]');
  }),
];
