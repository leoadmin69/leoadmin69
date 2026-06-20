import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // In production, fetch from database
    const tournamentData = {
      id: 'tournament-2024',
      totalTeams: 12,
      status: 'planning', // or 'active', 'completed'
      registeredTeams: [
        { id: '1', name: 'Équipe Alpha', level: 'confirmed' },
        { id: '2', name: 'Équipe Beta', level: 'intermediate' },
        { id: '3', name: 'Équipe Gamma', level: 'beginner' },
      ],
      matches: [],
      goldTable: [],
      silverTable: [],
      bronzeTable: [],
      copperTable: [],
    };

    return NextResponse.json(tournamentData, { status: 200 });
  } catch (error) {
    console.error('Tournament fetch error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des données' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle tournament updates (scores, status changes, etc.)
    if (body.action === 'update_score') {
      return updateMatchScore(body);
    }

    if (body.action === 'generate_draw') {
      return generateTournamentDraw(body);
    }

    return NextResponse.json(
      { error: 'Action non reconnue' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Tournament update error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    );
  }
}

function updateMatchScore(data: any) {
  // Update match score and determine progression through tables
  console.log('Updating match score:', data);
  return NextResponse.json({ success: true }, { status: 200 });
}

function generateTournamentDraw(data: any) {
  // Generate tournament bracket based on number of teams
  const { totalTeams } = data;

  if (totalTeams < 2) {
    return NextResponse.json(
      { error: 'Au moins 2 équipes requises' },
      { status: 400 }
    );
  }

  const matches = generateBracket(totalTeams);

  return NextResponse.json(
    { success: true, matches, totalTeams },
    { status: 200 }
  );
}

function generateBracket(totalTeams: number): any[] {
  const matches = [];

  if (totalTeams <= 16) {
    const bracketSize = 16;
    const byesNeeded = bracketSize - totalTeams;

    for (let i = 0; i < bracketSize / 2; i++) {
      const teamA = i < totalTeams ? `Team ${i + 1}` : 'BYE';
      const teamB = i + bracketSize / 2 < totalTeams ? `Team ${i + bracketSize / 2 + 1}` : 'BYE';

      matches.push({
        id: `match-r1-${i}`,
        round: 1,
        teamA,
        teamB,
        table: 'gold', // All start in gold
      });
    }
  } else {
    // Preliminary round for >16 teams
    for (let i = 0; i < totalTeams; i += 2) {
      matches.push({
        id: `match-r1-${i / 2}`,
        round: 1,
        teamA: `Team ${i + 1}`,
        teamB: i + 1 < totalTeams ? `Team ${i + 2}` : 'BYE',
        table: 'prelim',
      });
    }
  }

  return matches;
}
