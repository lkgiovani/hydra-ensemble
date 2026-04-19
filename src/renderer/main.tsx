import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import QuickTerminalApp from './QuickTerminalApp'
import './styles/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

const isQuickMode = new URLSearchParams(window.location.search).get('mode') === 'quick'

createRoot(root).render(
  <StrictMode>{isQuickMode ? <QuickTerminalApp /> : <App />}</StrictMode>
)
