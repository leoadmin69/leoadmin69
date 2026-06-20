import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.players || body.players.length !== 2) {
      return NextResponse.json(
        { error: 'Exactement 2 joueurs requis' },
        { status: 400 }
      );
    }

    // Validate mixed team
    const genders = body.players.map((p: any) => p.gender);
    if (!genders.includes('male') || !genders.includes('female')) {
      return NextResponse.json(
        { error: 'L\'équipe doit être mixte (1 Homme + 1 Femme)' },
        { status: 400 }
      );
    }

    const teamData = {
      teamId: body.teamId,
      players: body.players,
      level: body.players[0].level,
      racketsNeeded: body.racketsNeeded,
      restaurationOption: body.restaurationOption,
      paymentMethod: body.paymentMethod,
      paymentType: body.paymentType,
      amount: body.players[0].level === 'beginner' ? 50 : 80,
      paymentStatus: body.paymentMethod === 'online' ? 'pending' : 'pending',
      registrationDate: new Date(),
    };

    // Send confirmation emails
    await sendConfirmationEmails(teamData);

    return NextResponse.json(
      {
        success: true,
        teamId: teamData.teamId,
        message: 'Équipe inscrite avec succès'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'inscription' },
      { status: 500 }
    );
  }
}

async function sendConfirmationEmails(teamData: any) {
  // Email configuration would go here
  // This is a placeholder for email service integration
  console.log('Sending confirmation emails for team:', teamData.teamId);
}
