import { NextRequest, NextResponse } from 'next/server'
import { createOrganizerSession, verifyPassword, hashPassword } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json(
        { error: 'Mot de passe requis' },
        { status: 400 }
      )
    }

    const correctPasswordHash = hashPassword(process.env.ORGANIZER_PASSWORD || 'bizerte2024')
    const providedPasswordHash = hashPassword(password)

    if (providedPasswordHash !== correctPasswordHash) {
      return NextResponse.json(
        { error: 'Mot de passe incorrect' },
        { status: 401 }
      )
    }

    const token = createOrganizerSession()

    const response = NextResponse.json({ success: true, token })
    response.cookies.set('organizer_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60,
    })

    return response
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json(
      { error: 'Erreur d\'authentification' },
      { status: 500 }
    )
  }
}
