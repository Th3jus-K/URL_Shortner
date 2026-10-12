import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  // No StrictMode: its dev-only double effect would fetch analytics twice on mount.
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
