'use client';

import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { SlideOver } from '../../molecules';
import { AssistantChat } from '../AssistantChat/AssistantChat';
import { PraxContext, type PraxContextValue } from './PraxContext';

/**
 * PRAX, disponible **desde cualquier pantalla**.
 *
 * Sin foco de proyecto — es el modo `POST /me/assistant/chat` de
 * `AssistantChat`, tres herramientas. El PRAX enfocado del lienzo de Análisis
 * es otra cosa y sigue montándose aparte, en su página.
 *
 * ## Un solo panel, no tres modos
 *
 * ⚠️ **Ya no hay lanzador flotante ni ventana arrastrable.** Los dos modos que
 * había —acoplado a un `DockColumn` propio, o flotante y redimensionable con
 * posición en `localStorage`— se sustituyen por el mismo `SlideOver` que usan
 * el backlog, el sprint y el panel de tarea. Cada pantalla llama a PRAX con su
 * propio botón integrado (`PraxProjectButton` en el proyecto, por ejemplo) en
 * vez de un botón flotante global que tapaba el tablero.
 *
 * Esto además arregla que el minichat de PRAX se apilara mal con esos otros
 * paneles: al ser todos `SlideOver`, comparten la misma pila y la misma
 * anchura, así que se relevan entre sí igual que ellos (ver
 * `SlideOver.tsx`), en vez de flotar por su cuenta con su propio z-index.
 *
 * Pantalla completa **no** es un modo de este panel: `aPantallaCompleta`
 * cierra y navega a `/assistant`.
 */
export function PraxProvider({
  zonePath,
  organizacionActivaId,
  children,
}: {
  zonePath: string;
  organizacionActivaId: string | null;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  /** Texto que otro sitio deja puesto en el compositor. El `sello` re-dispara. */
  const [sugerencia, setSugerencia] = useState<{ texto: string; sello: number } | null>(null);

  const abrir = useCallback(() => {
    setMontado(true);
    setAbierto(true);
  }, []);
  const cerrar = useCallback(() => setAbierto(false), []);
  const alternar = useCallback(() => {
    setMontado(true);
    setAbierto((v) => !v);
  }, []);
  const aPantallaCompleta = useCallback(() => {
    setAbierto(false);
    window.location.assign('/assistant');
  }, []);
  const sugerir = useCallback((texto: string) => {
    setMontado(true);
    setAbierto(true);
    setSugerencia({ texto, sello: Date.now() });
  }, []);

  const valor = useMemo<PraxContextValue>(
    () => ({ zonePath, abierto, abrir, cerrar, alternar, aPantallaCompleta, sugerir }),
    [zonePath, abierto, abrir, cerrar, alternar, aPantallaCompleta, sugerir],
  );

  return (
    <PraxContext.Provider value={valor}>
      {children}
      {montado && (
        <SlideOver open={abierto} onClose={cerrar} size="lg" tone="dark" ariaLabel="PRAX">
          <AssistantChat
            projectId={null}
            gatewayPath={`${zonePath}/api/gateway`}
            cuotaInicial={null}
            nombres={{}}
            etiquetas={{}}
            variante="flotante"
            sugerenciaExterna={sugerencia}
            organizacionActivaId={organizacionActivaId}
          />
        </SlideOver>
      )}
    </PraxContext.Provider>
  );
}
