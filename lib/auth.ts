import crypto from 'crypto'
import { getDb } from './db'

const ORGANIZER_PASSWORD = process.env.ORGANIZER_PASSWORD || 'bizerte2024'

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + process.env.SALT || 'bizerte-salt').digest('hex')
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function createOrganizerSession(): string {
  const db = getDb()
  const token = generateToken()
  const passwordHash = hashPassword(ORGANIZER_PASSWORD)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  db.prepare(`
    INSERT INTO organizer_sessions (token, password_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(token, passwordHash, expiresAt)

  return token
}

export function verifyOrganizerToken(token: string, password: string): boolean {
  const db = getDb()
  const session = db.prepare(`
    SELECT password_hash, expires_at FROM organizer_sessions
    WHERE token = ?
  `).get(token) as any

  if (!session) return false
  if (new Date(session.expires_at) < new Date()) return false
  return verifyPassword(password, session.password_hash)
}
