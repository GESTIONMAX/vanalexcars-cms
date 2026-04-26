import React from 'react'

export const metadata = {
  title: 'VanalexCars API',
  description: 'Backend API - Payload CMS v3 Headless',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
