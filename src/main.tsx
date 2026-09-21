import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { initTelegram } from './lib/telegram.ts'
import { registerServiceWorker } from './lib/pwa.ts'

initTelegram()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
