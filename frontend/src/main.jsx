import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ensenas.css'
import './camara.css'
import App from './App.jsx'
import AuthProvider from './context/AuthProvider.jsx'
import SettingsProvider from './context/SettingsProvider.jsx'
import ShowProvider from './context/ShowProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SettingsProvider>
      <AuthProvider>
        <ShowProvider>
          <App />
        </ShowProvider>
      </AuthProvider>
    </SettingsProvider>
  </StrictMode>,
)
