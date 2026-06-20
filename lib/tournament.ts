import { getDb } from './db'
import crypto from 'crypto'

export type Bracket = 'OR' | 'ARGENT' | 'BRONZE' | 'CUIVRE'

export interface Match {
  id: string
  round: number
  bracket: Bracket
  team1_id: string | null
  team2_id: string | null
  team1_score?: string
  team2_score?: string
  winner_id?: string
  status: 'scheduled' | 'in_progress' | 'completed'
}

export function generateTournamentBracket(totalTeams: number) {
  const db = getDb()

  db.prepare('DELETE FROM matches').run()
  db.prepare('DELETE FROM bracket_positions').run()

  const brackets: Bracket[] = ['OR', 'ARGENT', 'BRONZE', 'CUIVRE']
  const teamsPerBracket = Math.ceil(totalTeams / 4)

  if (totalTeams < 16) {
    const qualifyingRounds = Math.ceil(Math.log2(totalTeams))
    generateAdaptiveBracket(totalTeams, qualifyingRounds)
  } else {
    generateStandardBracket(16)
  }
}

function generateAdaptiveBracket(totalTeams: number, qualifyingRounds: number) {
  const db = getDb()
  const rounds = Math.ceil(Math.log2(totalTeams))

  let matchId = 1
  for (let round = 1; round <= rounds; round++) {
    const teamsInRound = Math.pow(2, rounds - round + 1)
    const matchesInRound = teamsInRound / 2

    for (let i = 0; i < matchesInRound; i++) {
      const id = `match_${matchId++}`
      const bracket = round === 1 ? 'OR' : 'OR'

      db.prepare(`
        INSERT INTO matches (id, round, bracket, status)
        VALUES (?, ?, ?, 'scheduled')
      `).run(id, round, bracket)
    }
  }
}

function generateStandardBracket(totalTeams: number) {
  const db = getDb()
  const brackets: Bracket[] = ['OR', 'ARGENT', 'BRONZE', 'CUIVRE']

  // Round 1: Qualifications (1/8 finals) - 8 matches
  for (let i = 0; i < 8; i++) {
    const id = `match_r1_${i}`
    db.prepare(`
      INSERT INTO matches (id, round, bracket, status)
      VALUES (?, 1, 'OR', 'scheduled')
    `).run(id)
  }

  // Round 2: Quarts de finale - OR and BRONZE
  for (let i = 0; i < 4; i++) {
    db.prepare(`
      INSERT INTO matches (id, round, bracket, status)
      VALUES (?, 2, 'OR', 'scheduled')
    `).run(`match_r2_or_${i}`)

    db.prepare(`
      INSERT INTO matches (id, round, bracket, status)
      VALUES (?, 2, 'BRONZE', 'scheduled')
    `).run(`match_r2_bronze_${i}`)
  }

  // Round 3: Demi-finales
  for (const bracket of brackets) {
    db.prepare(`
      INSERT INTO matches (id, round, bracket, status)
      VALUES (?, 3, ?, 'scheduled')
    `).run(`match_r3_${bracket.toLowerCase()}_1`, bracket)

    db.prepare(`
      INSERT INTO matches (id, round, bracket, status)
      VALUES (?, 3, ?, 'scheduled')
    `).run(`match_r3_${bracket.toLowerCase()}_2`, bracket)
  }

  // Round 4: Finales
  for (const bracket of brackets) {
    db.prepare(`
      INSERT INTO matches (id, round, bracket, status)
      VALUES (?, 4, ?, 'scheduled')
    `).run(`match_r4_${bracket.toLowerCase()}`, bracket)
  }
}

export function updateMatchScore(
  matchId: string,
  team1Score: string,
  team2Score: string,
  winnerId: string
) {
  const db = getDb()

  db.prepare(`
    UPDATE matches
    SET team1_score = ?, team2_score = ?, winner_id = ?, status = 'completed'
    WHERE id = ?
  `).run(team1Score, team2Score, winnerId, matchId)

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as any

  if (match.round === 1) {
    const isLoser = match.team1_id !== winnerId
    const nextBracket = isLoser ? 'BRONZE' : 'OR'
    // Route loser to next bracket
  }
}

export function getAllMatches() {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM matches
    ORDER BY round, bracket, id
  `).all()
}

export function getMatchesByBracket(bracket: Bracket) {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM matches
    WHERE bracket = ?
    ORDER BY round
  `).all(bracket)
}
