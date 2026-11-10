/**
 * main.tsx — decide where the data comes from, then render.
 *
 * The source has to be settled before the first render: live against the
 * Python service, or the recorded run bundled with a published build.
 * Everything downstream reads the same shapes either way.
 */
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initDataSource } from './api';
import { applyTheme, readStoredTheme } from './theme';
import './index.css';

applyTheme(readStoredTheme());

const root = createRoot(document.getElementById('root')!);

initDataSource()
  .catch(() => undefined)
  .then(() => root.render(<App />));
