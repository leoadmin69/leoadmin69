import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { updateMatchScore } from '@/lib/tournament'

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('organizer_token')?.value

    if (!token) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const { matchId, team1_score, team2_score, winner_id } = await request.json()

    if (!matchId || !team1_score || !team2_score || !winner_id) {
      return NextResponse.json(
        { error: 'Données manquantes' },
        { status: 400 }
      )
    }

    updateMatchScore(matchId, team1_score, team2_score, winner_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Score update error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du score' },
      { status: 500 }
    )
  }
}
