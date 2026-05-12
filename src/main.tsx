import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import { msalConfig } from './auth/msal-config'
import './index.css'
import App from './App.tsx'
import { APP_VERSION } from './app-version'

document.title = `Slinker V${APP_VERSION}`

const msalInstance = new PublicClientApplication(msalConfig)

msalInstance.initialize().then(async () => {
  try {
    await msalInstance.handleRedirectPromise()
  } catch (err) {
    console.error('[MSAL-DEBUG] handleRedirectPromise error:', err)
  }

  console.log('[MSAL-DEBUG] Rendering app, accounts:', msalInstance.getAllAccounts().length)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  )
})
