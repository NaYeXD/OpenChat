import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';
import './styles/voice.css';
import './styles/security.css';
import './styles/admin.css'; // Phase 4: accounts, admin panel

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);