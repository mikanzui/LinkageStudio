import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { watchVisualViewport } from './interaction/visual-viewport'

const stopViewport = watchVisualViewport()
if (import.meta.hot) import.meta.hot.dispose(stopViewport)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
