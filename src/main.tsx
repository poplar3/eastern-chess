import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadPrefs } from './settings'

// Тему ставим до первой отрисовки, чтобы ночью не мигал светлый экран.
applyTheme(loadPrefs().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
