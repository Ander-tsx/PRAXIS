'use client';

import { useEffect, useState } from 'react';

/**
 * Página de diagnóstico de la PWA de iPhone. Pública y sin enlaces: se abre a
 * mano (`/pwa-debug`) desde la app instalada y se manda una captura. Mide lo que
 * el WebView dice de sí mismo, porque el simulador de iOS no instala web apps.
 * Se puede borrar cuando se cierre el fallo de la franja inferior.
 */
export default function PwaDebug() {
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [viewport, setViewport] = useState('(original)');

  useEffect(() => {
    const medir = () => {
      const sonda = document.createElement('div');
      sonda.style.cssText =
        'position:fixed;left:0;top:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);visibility:hidden';
      document.body.appendChild(sonda);
      const cs = getComputedStyle(sonda);
      const inset = `top ${cs.paddingTop} · bottom ${cs.paddingBottom}`;
      sonda.remove();
      const vv = window.visualViewport;
      setDatos({
        'navigator.standalone': String((navigator as Navigator & { standalone?: boolean }).standalone),
        'display-mode standalone': String(matchMedia('(display-mode: standalone)').matches),
        innerHeight: String(window.innerHeight),
        'screen.height': String(window.screen.height),
        'outerHeight': String(window.outerHeight),
        'visualViewport.height': String(vv?.height),
        'documentElement.clientHeight': String(document.documentElement.clientHeight),
        'safe-area inset': inset,
        'viewport meta': document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? '—',
      });
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const cambiarViewport = (contenido: string) => {
    document.querySelector('meta[name=viewport]')?.setAttribute('content', contenido);
    setViewport(contenido);
  };

  return (
    <main style={{ padding: '4rem 1rem 7rem', fontFamily: 'monospace', fontSize: 13, color: '#fff' }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>Diagnóstico PWA</h1>
      {Object.entries(datos).map(([k, v]) => (
        <p key={k} style={{ margin: '4px 0', wordBreak: 'break-all' }}>
          <b>{k}:</b> {v}
        </p>
      ))}
      <p style={{ marginTop: 16 }}>viewport actual: {viewport}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={() => cambiarViewport('width=device-width, initial-scale=1, viewport-fit=cover')}>
          Viewport sin interactive-widget
        </button>
        <button type="button" onClick={() => cambiarViewport('width=device-width, initial-scale=1')}>
          Viewport sin viewport-fit
        </button>
        <button type="button" onClick={() => window.scrollTo(0, 1)}>
          scrollTo(0,1)
        </button>
      </div>
      <p style={{ marginTop: 16 }}>
        La franja roja de abajo es <code>position:fixed; bottom:0</code>. Si queda un hueco negro
        bajo ella, el borde del WebView está por encima de la pantalla.
      </p>
      <div
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 24, background: 'red' }}
      />
    </main>
  );
}
