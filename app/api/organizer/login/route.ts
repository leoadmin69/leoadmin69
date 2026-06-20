import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// In production, use environment variables
const ADMIN_PASSWORD = process.env.ORGANIZER_PASSWORD || 'admin2024';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Mot de passe requis' },
        { status: 400 }
      );
    }

    // Validate password
    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Mot de passe incorrect' },
        { status: 401 }
      );
    }

    // Set secure session cookie
    const cookieStore = await cookies();
    cookieStore.set('organizer_session', generateSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600 * 8, // 8 hours
    });

    return NextResponse.json(
      { success: true, message: 'Authentification réussie' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la connexion' },
      { status: 500 }
    );
  }
}

function generateSessionToken(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}
