import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted fonts (bundled) — no Google Fonts CDN, which is slow/blocked in
// Russia. Onest across the whole UI; Semi Bold (600) is the heading weight.
// Each weight file includes the Cyrillic subset.
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/onest/700.css'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
