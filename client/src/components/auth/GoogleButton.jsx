import { useEffect, useRef, useState } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector('script[data-google-gsi]');
    const script = existing || document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Could not load Google sign-in')));
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.googleGsi = '1';
      document.head.appendChild(script);
    }
    return undefined;
  });
}

/** Google's own "Sign in with Google" button. Renders nothing until VITE_GOOGLE_CLIENT_ID is set. */
export default function GoogleButton({ onCredential, onError }) {
  const box = useRef(null);
  const [failed, setFailed] = useState(false);
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !box.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (res) => handlers.current.onCredential(res.credential),
        });
        window.google.accounts.id.renderButton(box.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: Math.min(320, box.current.offsetWidth || 320),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          handlers.current.onError?.('Could not load Google sign-in. Check your connection or use email instead.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!CLIENT_ID || failed) return null;
  return <div ref={box} className="flex min-h-[44px] w-full justify-center" />;
}

export const googleSignInEnabled = Boolean(CLIENT_ID);
