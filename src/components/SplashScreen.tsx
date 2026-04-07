import { useEffect, useState } from 'react';
import './SplashScreen.css';

declare const __APP_VERSION__: string;

/** Bar fill + hold, then fade out (matches CSS transition duration). */
const SPLASH_MS = 1000;
const FADE_MS = 320;

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const startExit = window.setTimeout(() => setExiting(true), SPLASH_MS);
    const unmount = window.setTimeout(() => setVisible(false), SPLASH_MS + FADE_MS);
    return () => {
      window.clearTimeout(startExit);
      window.clearTimeout(unmount);
    };
  }, []);

  if (!visible) return null;

  const logoSrc = `${import.meta.env.BASE_URL}icon-192.svg`;

  return (
    <div
      className={`splash-screen ${exiting ? 'splash-screen--exit' : ''}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="splash-screen__panel">
        <img className="splash-screen__logo" src={logoSrc} alt="" width={72} height={72} />
        <div className="splash-screen__meta">
          <h1 className="splash-screen__title">Slinker</h1>
          <span className="splash-screen__version">v{__APP_VERSION__}</span>
          <span className="splash-screen__tagline">2D linkage design &amp; simulation</span>
        </div>
        <div className="splash-screen__bar-wrap">
          <div className="splash-screen__bar-track" aria-hidden>
            <div className="splash-screen__bar-fill" />
          </div>
        </div>
      </div>
    </div>
  );
}
