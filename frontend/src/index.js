import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './LandingPageV6Polish.css';
import './PlatformVisualAlignment.css';
import App from './App';
import LandingPageV6 from './LandingPageV6';
import Stage4Product from './Stage4Product';
import Stage5Prep from './Stage5Prep';
import Stage7Memory from './Stage7Memory';
import ProductWorkspace from './ProductWorkspace';
import MeetingRecordPage from './MeetingRecordPage';
import OAuthCallbackPage from './OAuthCallbackPage';
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
  if (pathname === '/dashboard') return <ProductWorkspace />;
  if (pathname.startsWith('/meeting/')) return <MeetingRecordPage />;
  if (pathname === '/prepare') return <Stage5Prep />;
  if (pathname === '/memory') return <Stage7Memory />;
  if (pathname.startsWith('/select-slot/')) return <Stage4Product />;
  if (pathname === '/auth/google') return <OAuthCallbackPage provider="google" />;
  if (pathname === '/auth/outlook') return <OAuthCallbackPage provider="outlook" />;
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);

reportWebVitals();
