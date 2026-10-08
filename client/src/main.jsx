import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { UIProvider } from './context/UIContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { CompeteProvider } from './context/CompeteContext.jsx';
import { applyTheme } from './lib/themes.js';
import { local } from './lib/format.js';
import './styles.css';
import './compete.css';

// Paint the saved theme before React renders, so the page never flashes the wrong colors.
applyTheme(local.get('tf:settings', {}).theme || 'paper');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <UIProvider>
            <NotificationProvider>
              <CompeteProvider>
                <App />
              </CompeteProvider>
            </NotificationProvider>
          </UIProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
