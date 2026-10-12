'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { createApiClient } from '../../api/client';
import type { ProjectPermission } from '../../api/domain';
import { ApiError } from '../../api/envelope';
import {
  CampoEnLinea,
  ConfirmarEnLinea,
  type ItemDeMenu,
  MenuFlotante,
  SIDEBAR_FILA,
  SIDEBAR_FILA_ACTIVA,
  SIDEBAR_FILA_REPOSO,
} from './SidebarPrimitives';

/** Qué se puede renombrar y borrar de una fila, y cómo se pide al servidor. */
export interface EdicionDeFila {
  tipo: 'proyecto' | 'espacio' | 'tablero' | 'documento';
  path: string;
  cuerpoDeNombre: (nombre: string) => Record<string, unknown>;
  permisoRenombrar: ProjectPermission;
  permisoEliminar: ProjectPermission;
  /** Hay que teclear el nombre para borrar: todo lo que se lleva por delante lo justifica. */
  confirmarEscribiendo: boolean;
  onCambiado: () => void;
  alEliminar: () => void;
  /** Tras renombrar. Un proyecto cambia de slug, y la URL abierta deja de resolver. */
  alRenombrar?: (guardado: { slug?: string }) => void;
}

const AVISO_DE_BORRADO: Record<EdicionDeFila['tipo'], string> = {
  proyecto:
    'No se puede deshacer, y se lleva por delante sus espacios, tableros, tareas y documentos.',
  espacio: 'No se puede deshacer, y se lleva por delante sus tableros, tareas y documentos.',
  tablero: 'No se puede deshacer, y se lleva por delante sus columnas y tareas.',
  documento: 'No se puede deshacer.',
};

function describir(causa: unknown, porDefecto: string): string {
  return causa instanceof ApiError && causa.message ? causa.message : porDefecto;
}

/**
 * Una fila del árbol —proyecto, espacio, tablero o documento— con su menú ⋯.
 *
 * Renombrar y eliminar **no abren ningún modal**: la fila se convierte en un
 * campo de texto, o la confirmación crece justo debajo. Se ve qué se toca sin
 * perder el sitio en la lista.
 *
 * `itemsExtra` son las acciones propias de cada nivel (agregar un espacio a un
 * proyecto, por ejemplo); van antes de las comunes y respetan `permiso`.
 */
export function FilaDeArbol({
  activo,
  href,
  nombre,
  inicio,
  edicion,
  projectId,
  gatewayPath,
  itemsExtra = [],
  compacta = false,
  textoDeNombre,
}: {
  activo: boolean;
  href: string;
  nombre: string;
  /** Lo de la izquierda: chevron, icono, monograma. */
  inicio: ReactNode;
  edicion: EdicionDeFila;
  projectId: string;
  gatewayPath: string;
  itemsExtra?: ItemDeMenu[];
  compacta?: boolean;
  /** Si el nombre que se enseña no es el que se edita (un documento sin título). */
  textoDeNombre?: string;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<'renombrar' | 'eliminar' | null>(null);
  const api = createApiClient({ gatewayPath });

  async function renombrar(limpio: string): Promise<string | null> {
    try {
      const guardado = await api.patch<{
        id?: string;
        name?: string;
        title?: string;
        slug?: string;
      }>(edicion.path, edicion.cuerpoDeNombre(limpio));
      /* Se confirma contra el `data`, no contra el status. */
      if (!guardado?.id || (guardado.name ?? guardado.title) !== limpio) {
        return 'El servidor no guardó el nombre nuevo.';
      }
      setModo(null);
      edicion.onCambiado();
      edicion.alRenombrar?.(guardado);
      router.refresh();
      return null;
    } catch (causa) {
      return describir(causa, 'No se pudo cambiar el nombre.');
    }
  }

  async function eliminar(): Promise<string | null> {
    try {
      await api.delete(edicion.path);
      setModo(null);
      edicion.onCambiado();
      if (activo) edicion.alEliminar();
      else router.refresh();
      return null;
    } catch (causa) {
      return describir(causa, `No se pudo eliminar el ${edicion.tipo}.`);
    }
  }

  const items: ItemDeMenu[] = [
    ...itemsExtra,
    {
      clave: 'renombrar',
      etiqueta: 'Editar nombre',
      icono: <Pencil />,
      permiso: edicion.permisoRenombrar,
      onElegir: () => setModo('renombrar'),
    },
    {
      clave: 'eliminar',
      etiqueta: 'Eliminar',
      icono: <Trash2 />,
      permiso: edicion.permisoEliminar,
      peligro: true,
      onElegir: () => setModo('eliminar'),
    },
  ];

  if (modo === 'renombrar') {
    return (
      <CampoEnLinea
        icono={<Pencil />}
        inicial={nombre}
        placeholder="Nombre"
        etiquetaAria={`Nuevo nombre de ${nombre}`}
        minimo={edicion.tipo === 'documento' ? 1 : 2}
        maxLength={edicion.tipo === 'documento' ? 200 : 100}
        onEnviar={renombrar}
        onCancelar={() => setModo(null)}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: el equivalente de teclado es el enlace de dentro, que ya es focalizable */}
      <div
        /* **Toda la caja es clic**, no solo el nombre: el icono y los márgenes de la fila no hacían
           nada y apuntar al monograma de un proyecto era fallar. Se salta lo que tiene gesto
           propio —el chevron de plegar, el menú de acciones, el enlace, un campo—. */
        onClick={(evento) => {
          const objetivo = evento.target as HTMLElement;
          if (objetivo.closest('a, button, input, textarea, [role="menu"], [role="menuitem"]')) {
            return;
          }
          router.push(href);
        }}
        className={`group ${SIDEBAR_FILA} cursor-pointer ${compacta ? 'min-h-8' : ''} gap-1.5 ${
          activo ? SIDEBAR_FILA_ACTIVA : SIDEBAR_FILA_REPOSO
        }`}
      >
        {inicio}
        <Link
          href={href}
          aria-current={activo ? 'page' : undefined}
          className="flex min-h-8 min-w-0 flex-1 items-center self-stretch"
        >
          <span className="truncate">{textoDeNombre ?? nombre}</span>
        </Link>
        <MenuFlotante
          etiquetaAria={`Más acciones de ${nombre}`}
          items={items}
          projectId={projectId}
          gatewayPath={gatewayPath}
          activa={activo}
        />
      </div>

      {modo === 'eliminar' && (
        <ConfirmarEnLinea
          nombre={nombre}
          aviso={AVISO_DE_BORRADO[edicion.tipo]}
          escribir={edicion.confirmarEscribiendo ? nombre : undefined}
          onConfirmar={eliminar}
          onCancelar={() => setModo(null)}
        />
      )}
    </div>
  );
}
