import Database from 'better-sqlite3'
import path from 'path'

let db: Database.Database | null = null

export function getDb() {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'data', 'bizerte.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    initializeDatabase()
  }
  return db
}

function initializeDatabase() {
  if (!db) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      player1_name TEXT NOT NULL,
      player1_surname TEXT NOT NULL,
      player1_age INTEGER NOT NULL,
      player1_nationality TEXT NOT NULL,
      player1_governorate TEXT NOT NULL,
      player1_phone TEXT NOT NULL,
      player1_email TEXT NOT NULL,
      player1_level TEXT NOT NULL,
      player1_is_captain BOOLEAN NOT NULL,
      player2_name TEXT NOT NULL,
      player2_surname TEXT NOT NULL,
      player2_age INTEGER NOT NULL,
      player2_nationality TEXT NOT NULL,
      player2_governorate TEXT NOT NULL,
      player2_phone TEXT NOT NULL,
      player2_email TEXT NOT NULL,
      player2_level TEXT NOT NULL,
      player2_is_captain BOOLEAN NOT NULL,
      rackets_needed INTEGER NOT NULL,
      food_options TEXT NOT NULL,
      cost INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      payment_split TEXT NOT NULL,
      payment_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      round INTEGER NOT NULL,
      bracket TEXT NOT NULL,
      team1_id TEXT,
      team2_id TEXT,
      team1_score TEXT,
      team2_score TEXT,
      winner_id TEXT,
      status TEXT DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team1_id) REFERENCES teams(id),
      FOREIGN KEY (team2_id) REFERENCES teams(id),
      FOREIGN KEY (winner_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS bracket_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bracket TEXT NOT NULL,
      position INTEGER NOT NULL,
      team_id TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS organizer_sessions (
      token TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_teams_created ON teams(created_at);
    CREATE INDEX IF NOT EXISTS idx_matches_bracket ON matches(bracket);
    CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round);
  `)
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}
