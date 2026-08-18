import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './LandingPageV6Polish.css';
import './PlatformVisualAlignment.css';
import App from './App';
import LandingPageV6 from './LandingPageV6';
import Stage4Product from './Stage4Product';
import Stage5Prep, { Stage5Launcher } from './Stage5Prep';
import reportWebVitals from './reportWebVitals';

const NAVIGATION_EVENT = 'callsync:navigation';

if (!window.__callsyncHistoryPatched) {
  ['pushState', 'replaceState'].forEach((method) => {
    const original = window.history[method];
    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(NAVIGATION_EVENT));
      return result;
    };
  });
  window.__callsyncHistoryPatched = true;
}

function RootApp() {
  const [pathname, setPathname] = React.useState(window.location.pathname);

  React.useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    window.addEventListener(NAVIGATION_EVENT, syncPath);
    return () => {
      window.removeEventListener('popstate', syncPath);
      window.removeEventListener(NAVIGATION_EVENT, syncPath);
    };
  }, []);

  if (pathname === '/') return <LandingPageV6 />;
  if (pathname === '/prepare') return <Stage5Prep />;
  if (pathname === '/dashboard') return <><Stage4Product /><Stage5Launcher /></>;
  if (pathname.startsWith('/select-slot/')) return <Stage4Product />;
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);

reportWebVitals();
