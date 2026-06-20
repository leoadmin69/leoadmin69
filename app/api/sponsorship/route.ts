import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.companyName || !body.email || !body.phone) {
      return NextResponse.json(
        { error: 'Informations incomplètes' },
        { status: 400 }
      );
    }

    const sponsorshipData = {
      id: `SPONSOR-${Date.now()}`,
      ...body,
      submittedAt: new Date(),
      status: 'new',
    };

    // Save to database and send notification
    await saveSponsorshipRequest(sponsorshipData);
    await notifyOrganizers(sponsorshipData);

    return NextResponse.json(
      {
        success: true,
        message: 'Demande de partenariat reçue'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Sponsorship error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la soumission' },
      { status: 500 }
    );
  }
}

async function saveSponsorshipRequest(data: any) {
  // Database save would go here
  console.log('Saving sponsorship request:', data.id);
}

async function notifyOrganizers(data: any) {
  // Send notification to organizers
  console.log('Notifying organizers about new sponsorship request from:', data.companyName);
}
