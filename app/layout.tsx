import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'

export const metadata: Metadata = {
  title: 'LocalGhost — notas locales para reuniones',
  description: 'ZERO FOOTPRINT • ZERO BOTS. Tu asistente local para reuniones.',
  generator: 'LocalGhost',
  icons: { icon: '/localghost-icon.png', apple: '/localghost-icon.png' },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#09090b',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // CSP nonces are created per request in proxy.ts, so the document must render per request.
  await headers()
  return (
    <html lang="es" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  )
}
