import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import crypto from 'crypto'
import nodemailer from 'nodemailer'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const db = getDb()

    const teamId = `TEAM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

    const player1Level = data.player1_level || 'Intermediate'
    const player2Level = data.player2_level || 'Intermediate'

    let cost = 80
    if (
      (player1Level === 'Débutant' || data.player1_is_student) ||
      (player2Level === 'Débutant' || data.player2_is_student)
    ) {
      cost = 50
    }

    db.prepare(`
      INSERT INTO teams (
        id, player1_name, player1_surname, player1_age, player1_nationality,
        player1_governorate, player1_phone, player1_email, player1_level,
        player1_is_captain, player2_name, player2_surname, player2_age,
        player2_nationality, player2_governorate, player2_phone, player2_email,
        player2_level, player2_is_captain, rackets_needed, food_options,
        cost, payment_method, payment_split, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      teamId,
      data.player1_name, data.player1_surname, data.player1_age, data.player1_nationality,
      data.player1_governorate, data.player1_phone, data.player1_email, player1Level,
      data.player1_is_captain || false,
      data.player2_name, data.player2_surname, data.player2_age, data.player2_nationality,
      data.player2_governorate, data.player2_phone, data.player2_email, player2Level,
      data.player2_is_captain || false,
      data.rackets_needed || 0, JSON.stringify(data.food_options || []),
      cost, data.payment_method || 'cash', data.payment_split || 'single', 'pending'
    )

    const emails = [data.player1_email, data.player2_email, 'bizertebtf@gmail.com']

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })

      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@bizertbeachtennis.tn',
        to: emails.join(','),
        subject: `[Bizerte Beach Tennis] Inscription confirmée - ID: ${teamId}`,
        html: `
          <h2>Bienvenue sur Bizerte Beach Tennis!</h2>
          <p>Votre équipe a été enregistrée avec succès.</p>
          <h3>Détails de l'équipe:</h3>
          <ul>
            <li>ID d'équipe: <strong>${teamId}</strong></li>
            <li>Montant à payer: <strong>${cost} DT</strong></li>
            <li>Méthode de paiement: ${data.payment_method === 'online' ? 'En ligne' : 'Cash'}</li>
          </ul>
          <p>Veuillez conserver cet identifiant pour le suivi de votre paiement.</p>
        `,
      })
    } catch (emailError) {
      console.error('Email sending failed:', emailError)
    }

    return NextResponse.json(
      { teamId, cost, payment_status: 'pending' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'enregistrement' },
      { status: 500 }
    )
  }
}
