import './globals.css'
import MainLayout from './components/layout/MainLayout.jsx'
import { AuthProvider } from './components/auth/AuthProvider.jsx'

export const metadata = {
  title: 'AlgoAura - WhatsApp CRM Dashboard',
  description: 'Manage your WhatsApp conversations, leads, and broadcasts',
  icons: {
    icon: '/algoaura_logo.png',
    shortcut: '/algoaura_logo.png',
    apple: '/algoaura_logo.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          <MainLayout>
            {children}
          </MainLayout>
        </AuthProvider>
      </body>
    </html>
  )
}
