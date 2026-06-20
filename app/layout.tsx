import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bizerte Beach Tennis',
  description: 'Premier événement de Beach Tennis en Tunisie - Plage de Bizerte',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className="bg-dark text-white font-sans">
        {children}
      </body>
    </html>
  )
}
