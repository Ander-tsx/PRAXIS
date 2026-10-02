'use client';

import {
  FileText,
  FolderBookmark,
  FolderKanban,
  IterationCw,
  Plus,
  SquareKanban,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createApiClient } from '../../api/client';
import { ApiError } from '../../api/envelope';
import {
  CampoEnLinea,
  SIDEBAR_FILA,
  SIDEBAR_FILA_REPOSO,
  SIDEBAR_ICONO,
} from './SidebarPrimitives';

export type TipoDeEspacio = 'BOARDS' | 'DOCUMENTS';

function mensajeDe(causa: unknown, porDefecto: string): string {
  if (!(causa instanceof ApiError)) return porDefecto;
  if (causa.status === 403) return 'No tienes permiso para crear esto aquí.';
  return causa.message || porDefecto;
}

/**
 * Una fila de invitación (`+ Crear primer proyecto`). Solo se pinta cuando la
 * lista está vacía: con contenido, crear va por el menú ⋯ de cada nivel.
 */
export function FilaDeAccion({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${SIDEBAR_FILA} ${SIDEBAR_FILA_REPOSO} w-full text-left text-text-secondary`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
        <Plus className={SIDEBAR_ICONO} aria-hidden="true" />
      </span>
      <span className="truncate">{etiqueta}</span>
    </button>
  );
}

/**
 * El campo de «Nuevo proyecto», que sale del menú ⋯ de la cabecera «Proyectos»
 * (o de la fila de invitación cuando no hay ninguno). Crece al principio de la
 * lista y se cierra al terminar o cancelar.
 *
 * Solo pide el nombre. El icono, el color, la imagen y las plantillas se ponen
 * después en la configuración del proyecto, o desde «Proyectos».
 */
export function NuevoProyectoEnLinea({
  gatewayPath,
  organizacionId,
  onCreado,
  onCerrar,
}: {
  gatewayPath: string;
  organizacionId: string | null;
  onCreado: () => void;
  onCerrar: () => void;
}) {
  const router = useRouter();

  async function crear(nombre: string): Promise<string | null> {
    try {
      const creado = await createApiClient({ gatewayPath }).post<{
        id?: string;
        name?: string;
        slug?: string;
      }>('/projects', {
        name: nombre,
        ...(organizacionId ? { organizationId: organizacionId } : {}),
      });
      if (!creado?.id || creado.name !== nombre) {
        return 'El servidor respondió, pero no guardó el proyecto.';
      }
      onCerrar();
      onCreado();
      router.push(`/projects/${creado.slug ?? creado.id}`);
      router.refresh();
      return null;
    } catch (causa) {
      if (causa instanceof ApiError && causa.code === 'CONFLICT') {
        return `${causa.message} Prueba con un nombre más específico.`;
      }
      return mensajeDe(causa, 'No se pudo crear el proyecto. Inténtalo otra vez.');
    }
  }

  return (
    <CampoEnLinea
      icono={<Plus />}
      placeholder="Nombre del proyecto"
      etiquetaAria="Nombre del proyecto nuevo"
      onEnviar={crear}
      onCancelar={onCerrar}
    />
  );
}

/**
 * El campo de «Agregar espacio» de un proyecto: ya sabe de qué tipo es, porque
 * se eligió en el menú ⋯. Se pinta él solo (sin fila previa) y se cierra al
 * terminar o cancelar.
 */
export function NuevoEspacioEnLinea({
  proyecto,
  tipo,
  gatewayPath,
  onCreado,
  onCerrar,
}: {
  proyecto: { id: string; slug: string };
  tipo: TipoDeEspacio;
  gatewayPath: string;
  onCreado: () => void;
  onCerrar: () => void;
}) {
  const router = useRouter();

  async function crear(nombre: string): Promise<string | null> {
    try {
      const creado = await createApiClient({ gatewayPath }).post<{ id: string; name: string }>(
        `/projects/${proyecto.id}/workspaces`,
        { name: nombre, kind: tipo },
      );
      onCreado();
      onCerrar();
      router.push(`/projects/${proyecto.slug}?tab=espacios&ws=${creado.id}`);
      return null;
    } catch (causa) {
      return mensajeDe(causa, 'No se pudo crear el espacio. Inténtalo otra vez.');
    }
  }

  return (
    <CampoEnLinea
      icono={tipo === 'DOCUMENTS' ? <FolderBookmark /> : <FolderKanban />}
      placeholder={tipo === 'DOCUMENTS' ? 'Espacio de documentos' : 'Espacio de tableros'}
      etiquetaAria="Nombre del espacio nuevo"
      onEnviar={crear}
      onCancelar={onCerrar}
    />
  );
}

/**
 * El campo de «Nuevo documento» / «Nuevo tablero», que sale del menú ⋯ del espacio.
 *
 * Un tablero nace con sus tres columnas de siempre (un tablero sin columnas no
 * sirve para nada, y menos uno de sprints) y se elige aquí mismo si es Kanban o
 * Scrum.
 */
export function NuevoContenidoEnLinea({
  espacio,
  proyecto,
  gatewayPath,
  onCreado,
  onCerrar,
}: {
  espacio: { id: string; kind: TipoDeEspacio };
  proyecto: { id: string; slug: string };
  gatewayPath: string;
  onCreado: () => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [scrum, setScrum] = useState(false);
  const esDocumento = espacio.kind === 'DOCUMENTS';

  async function crear(nombre: string): Promise<string | null> {
    const api = createApiClient({ gatewayPath });
    const base = `/projects/${proyecto.slug}?tab=espacios&ws=${espacio.id}`;
    try {
      let destino = base;
      if (esDocumento) {
        const documento = await api.post<{ id: string }>(`/workspaces/${espacio.id}/documents`, {
          title: nombre,
        });
        destino = `${base}&doc=${documento.id}`;
      } else {
        const tablero = await api.post<{ id: string }>(`/workspaces/${espacio.id}/boards`, {
          name: nombre,
        });
        const columnas = [
          { name: 'Por hacer', color: 'primary' },
          { name: 'En curso', color: 'info' },
          { name: 'Hecho', color: 'success' },
        ];
        for (const [order, columna] of columnas.entries()) {
          await api.post(`/boards/${tablero.id}/columns`, { ...columna, order });
        }
        if (scrum) await api.patch(`/boards/${tablero.id}`, { scrumEnabled: true });
        destino = `${base}&board=${tablero.id}`;
      }
      onCerrar();
      onCreado();
      router.push(destino);
      return null;
    } catch (causa) {
      return mensajeDe(causa, 'No se pudo crear. Inténtalo otra vez.');
    }
  }

  return (
    <CampoEnLinea
      icono={esDocumento ? <FileText /> : <SquareKanban />}
      placeholder={esDocumento ? 'Título del documento' : 'Nombre del tablero'}
      etiquetaAria={esDocumento ? 'Título del documento nuevo' : 'Nombre del tablero nuevo'}
      minimo={esDocumento ? 1 : 2}
      maxLength={esDocumento ? 200 : 100}
      onEnviar={crear}
      onCancelar={onCerrar}
      extra={
        esDocumento ? undefined : (
          <fieldset className="m-0 flex gap-1 border-0 px-1">
            <legend className="sr-only">Cómo se trabaja</legend>
            <ChipDeMetodo activo={!scrum} onClick={() => setScrum(false)} icono={<SquareKanban />}>
              Kanban
            </ChipDeMetodo>
            <ChipDeMetodo activo={scrum} onClick={() => setScrum(true)} icono={<IterationCw />}>
              Scrum
            </ChipDeMetodo>
          </fieldset>
        )
      }
    />
  );
}

function ChipDeMetodo({
  activo,
  onClick,
  icono,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[11px] font-medium transition-colors [&>svg]:h-3 [&>svg]:w-3 ${
        activo ? 'bg-white/15 text-white' : 'text-text-secondary hover:bg-white/5 hover:text-white'
      }`}
    >
      {icono}
      {children}
    </button>
  );
}
