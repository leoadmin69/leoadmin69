import { NextRequest, NextResponse } from 'next/server'
import { getAllMatches, getMatchesByBracket } from '@/lib/tournament'

export async function GET(request: NextRequest) {
  try {
    const bracket = request.nextUrl.searchParams.get('bracket')

    let matches
    if (bracket) {
      matches = getMatchesByBracket(bracket as any)
    } else {
      matches = getAllMatches()
    }

    return NextResponse.json(matches)
  } catch (error) {
    console.error('Matches list error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des matchs' },
      { status: 500 }
    )
  }
}
