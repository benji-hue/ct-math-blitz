import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/onest'
import '@fontsource-variable/geologica'
import '@fontsource-variable/manrope'
import '@fontsource-variable/unbounded'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { initTelegram } from './lib/telegram.ts'
import { applyTheme } from './lib/theme.ts'
import { registerServiceWorker } from './lib/pwa.ts'
import { UpdateBanner } from './ui/UpdateBanner.tsx'
import { loadKatex } from './ui/Rich.tsx'

// Тема — до первого кадра: без белой вспышки в тёмном Telegram и наоборот.
applyTheme()
initTelegram()
registerServiceWorker()

// Формулы понадобятся почти сразу — догружаем KaTeX, когда браузер свободен.
const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
if (idle) idle(() => void loadKatex())
else window.setTimeout(() => void loadKatex(), 1500)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
)
