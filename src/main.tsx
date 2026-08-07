import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted fonts (bundled) — no Google Fonts CDN, which is slow/blocked in
// Russia. Inter for body, Playfair Display (serif) for premium headings. Each
// weight file includes the Cyrillic subset.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/800.css'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
