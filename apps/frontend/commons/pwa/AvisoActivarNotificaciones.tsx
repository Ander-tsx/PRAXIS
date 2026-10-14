'use client';

import { Bell, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { activarPush, leerEstadoPush } from './push';

const CLAVE = 'praxis_aviso_push';
/** Tras un «Ahora no», cuánto se tarda en volver a preguntar. */
const ESPERA_MS = 7 * 24 * 60 * 60 * 1000;

function yaDescartado(): boolean {
  try {
    const hasta = Number(localStorage.getItem(CLAVE) ?? 0);
    return Date.now() < hasta;
  } catch {
    return false;
  }
}

/**
 * La invitación a activar las notificaciones, **solo en móvil**.
 *
 * Aparece una vez que se puede (navegador compatible, servidor con push, y el
 * permiso aún sin decidir) y no estorba: se cierra con «Ahora no» y no vuelve en
 * una semana. Quien ya dijo que no en los ajustes del dispositivo (`denied`) no
 * la ve: preguntar otra vez no serviría de nada.
 *
 * El permiso se pide **dentro del toque** del botón, que es lo que iOS exige.
 */
export function AvisoActivarNotificaciones() {
  const [visible, setVisible] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'default' || yaDescartado()) {
      return;
    }
    let vivo = true;
    /* Un respiro tras abrir: no tiene sentido pedir nada antes de que se vea la pantalla. */
    const espera = window.setTimeout(() => {
      leerEstadoPush()
        .then((e) => vivo && e.tipo === 'apagado' && setVisible(true))
        .catch(() => undefined);
    }, 3000);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, []);

  if (!visible) return null;

  function posponer() {
    try {
      localStorage.setItem(CLAVE, String(Date.now() + ESPERA_MS));
    } catch {
      /* Sin almacenamiento, volverá a salir en la próxima visita. */
    }
    setVisible(false);
  }

  async function activar() {
    setOcupado(true);
    try {
      await activarPush();
    } catch {
      /* Si falla, el interruptor de «Tú» sigue ahí. */
    }
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Activar notificaciones"
      className="fixed inset-x-3 bottom-[calc(var(--barra-inferior,0px)+var(--desfase-inferior,0px)+0.75rem)] z-20 flex items-center gap-3 rounded-2xl border border-white/10 bg-surface-3 p-3 shadow-lg md:hidden"
    >
      <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 font-sans text-[13px] leading-snug text-text-primary">
        Activa las notificaciones para enterarte de mensajes y tareas que vencen.
      </p>
      <button
        type="button"
        onClick={() => void activar()}
        disabled={ocupado}
        className="shrink-0 rounded-xl bg-primary px-3 py-2 font-sans text-[13px] font-medium text-on-color disabled:opacity-60"
      >
        Activar
      </button>
      <button
        type="button"
        onClick={posponer}
        aria-label="Ahora no"
        className="shrink-0 rounded-lg p-1 text-text-secondary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
