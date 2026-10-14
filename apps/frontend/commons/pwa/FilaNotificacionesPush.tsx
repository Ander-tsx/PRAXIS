'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type EstadoPush, activarPush, desactivarPush, leerEstadoPush } from './push';

/**
 * La fila de «Notificaciones» de la pantalla Tú: un interruptor para este
 * dispositivo, con la razón a la vista cuando no se puede.
 */
export function FilaNotificacionesPush() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerEstadoPush()
      .then((e) => vivo && setEstado(e))
      .catch(() => vivo && setEstado({ tipo: 'no-disponible', instalar: false }));
    return () => {
      vivo = false;
    };
  }, []);

  /* Mientras no se sabe, nada: evita un parpadeo de «apagado» que luego cambia. */
  if (!estado) return null;
  /* Sin soporte y sin nada que hacer, la fila sobra. */
  if (estado.tipo === 'no-disponible' && !estado.instalar) return null;
  if (estado.tipo === 'apagado-por-servidor') return null;

  const activo = estado.tipo === 'activo';
  const bloqueado = estado.tipo === 'bloqueado' || estado.tipo === 'no-disponible';

  const detalle =
    estado.tipo === 'no-disponible'
      ? 'Instala Praxis en tu pantalla de inicio (Compartir → Añadir a pantalla de inicio) para activarlas.'
      : estado.tipo === 'bloqueado'
        ? 'Bloqueadas en los ajustes del dispositivo.'
        : 'Mensajes nuevos y tareas que vencen hoy o mañana.';

  async function alternar() {
    if (ocupado || bloqueado) return;
    setOcupado(true);
    try {
      if (activo) {
        await desactivarPush();
        setEstado({ tipo: 'apagado' });
      } else {
        setEstado(await activarPush());
      }
    } catch {
      setEstado(await leerEstadoPush().catch(() => ({ tipo: 'apagado' }) as EstadoPush));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-label="Notificaciones" className="flex flex-col gap-2">
      <h3 className="px-4 font-sans text-[13px] font-medium text-text-secondary">Notificaciones</h3>
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
        <Bell className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[15px] text-text-primary">En este dispositivo</p>
          <p className="font-sans text-[12px] text-text-secondary">{detalle}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          aria-label="Notificaciones en este dispositivo"
          disabled={ocupado || bloqueado}
          onClick={() => void alternar()}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            activo ? 'bg-primary' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              activo ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
