'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { createApiClient } from '../../api/client';
import { ApiError } from '../../api/envelope';
import type { EffectivePermissions, ProjectPermission } from '../../api/domain';
import { Button } from '../../atoms/Button';
import { FloatingLabelInput } from '../../atoms/FloatingLabelInput';
import { Dialog } from '../../molecules/Dialog';

type Modo = 'renombrar' | 'eliminar' | null;

/**
 * Los tres puntos de una fila del contenido desplegado de un proyecto en la
 * barra lateral —un espacio o un documento—: renombrar y eliminar sin entrar.
 *
 * Vive en commons —la barra es de todas las pantallas— así que no puede usar las
 * acciones de servidor de `web`: llama al gateway con el cliente del navegador,
 * igual que `CrearEnProyecto`.
 *
 * ## Los permisos se piden al abrir el menú
 *
 * La lista de la barra no trae `permissions/me` del proyecto, y pedirlo por cada
 * fila para pintar un icono que casi nadie pulsa sería el N+1 que ya se quitó de
 * esta barra. Se pregunta al abrir, y solo se ofrece lo que se puede hacer. Los
 * permisos que hacen falta los da quien monta el menú: un espacio se renombra
 * con `canEditBoard` y se borra con `canDeleteBoard`; un documento, las dos cosas
 * con `canEditDocuments`. El servidor sigue siendo quien decide.
 *
 * ## Eliminar
 *
 * Un espacio arrastra sus tableros y sus tareas, así que pide **escribir el
 * nombre**, como el borrado de un proyecto. Un documento pide una confirmación
 * simple: no se deshace, pero no se lleva nada más por delante.
 */
export function MenuDeContenido({
  objetivo,
  projectId,
  gatewayPath,
  activo,
  onCambiado,
  alEliminar,
}: {
  objetivo: {
    /** Qué es: sale en los textos. */
    tipo: 'espacio' | 'documento' | 'tablero';
    name: string;
    /** Ruta del gateway de ese recurso, sin la barra final. */
    path: string;
    /** Cuerpo del `PATCH` para poner el nombre nuevo. */
    cuerpoDeNombre: (nombre: string) => Record<string, unknown>;
    permisoRenombrar: ProjectPermission;
    permisoEliminar: ProjectPermission;
    /** Un espacio pide escribir su nombre para eliminarlo; un documento, no. */
    confirmarEscribiendo: boolean;
  };
  projectId: string;
  gatewayPath: string;
  /** Si es lo que está abierto, para salir de ahí al eliminarlo. */
  activo: boolean;
  onCambiado: () => void;
  /** Adónde ir tras eliminar lo que estaba abierto. */
  alEliminar: () => void;
}) {
  const proyecto = { id: projectId, name: objetivo.name };
  const router = useRouter();
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [permisos, setPermisos] = useState<EffectivePermissions | null | undefined>(undefined);
  const [modo, setModo] = useState<Modo>(null);

  const [nombre, setNombre] = useState(proyecto.name);
  const [confirmacion, setConfirmacion] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const api = createApiClient({ gatewayPath });

  /* Cierra con un clic fuera o con Escape. */
  useEffect(() => {
    if (!abierto) return;
    function fuera(evento: MouseEvent) {
      const destino = evento.target as Node;
      if (menuRef.current?.contains(destino) || botonRef.current?.contains(destino)) return;
      setAbierto(false);
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  function alternar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    const caja = botonRef.current?.getBoundingClientRect();
    /* `fixed` y no `absolute`: la barra lateral hace scroll y recortaría el menú. */
    if (caja) setPosicion({ top: caja.bottom + 4, left: Math.max(8, caja.right - 176) });
    setAbierto(true);
    setPermisos(undefined);
    api
      .get<EffectivePermissions>(`/projects/${proyecto.id}/permissions/me`)
      .then(setPermisos)
      .catch(() => setPermisos(null));
  }

  function abrirModo(siguiente: Modo) {
    setAbierto(false);
    setError(null);
    setNombre(proyecto.name);
    setConfirmacion('');
    setModo(siguiente);
  }

  function describir(causa: unknown, porDefecto: string): string {
    return causa instanceof ApiError && causa.message ? causa.message : porDefecto;
  }

  async function renombrar(evento: FormEvent) {
    evento.preventDefault();
    const limpio = nombre.trim();
    if (limpio.length < 2) {
      setError('El nombre necesita al menos 2 caracteres.');
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const guardado = await api.patch<{ id?: string; name?: string; title?: string }>(
        objetivo.path,
        objetivo.cuerpoDeNombre(limpio),
      );
      /* Se confirma contra el `data`, no contra el status. */
      if (!guardado?.id || (guardado.name ?? guardado.title) !== limpio) {
        setError('El servidor no guardó el nombre nuevo.');
        return;
      }
      setModo(null);
      onCambiado();
      router.refresh();
    } catch (causa) {
      setError(describir(causa, 'No se pudo cambiar el nombre.'));
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(evento: FormEvent) {
    evento.preventDefault();
    if (objetivo.confirmarEscribiendo && confirmacion.trim() !== proyecto.name) return;
    setOcupado(true);
    setError(null);
    try {
      await api.delete(objetivo.path);
      setModo(null);
      onCambiado();
      if (activo) alEliminar();
      else router.refresh();
    } catch (causa) {
      setError(describir(causa, `No se pudo eliminar el ${objetivo.tipo}.`));
    } finally {
      setOcupado(false);
    }
  }

  const puedeEditar = permisos?.permissions[objetivo.permisoRenombrar] === true;
  const puedeEliminar = permisos?.permissions[objetivo.permisoEliminar] === true;

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={alternar}
        aria-label={`Más acciones de ${proyecto.name}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 ${
          abierto ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {abierto && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: posicion.top, left: posicion.left }}
          className="fixed z-[120] w-44 rounded-lg border border-white/10 bg-[#191919] p-1 shadow-2xl"
        >
          {permisos === undefined ? (
            <p className="px-2 py-1.5 font-sans text-xs text-text-secondary">Comprobando…</p>
          ) : !puedeEditar && !puedeEliminar ? (
            <p className="px-2 py-1.5 font-sans text-xs text-text-secondary">
              No tienes permiso para cambiar este {objetivo.tipo}.
            </p>
          ) : (
            <>
              {puedeEditar && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => abrirModo('renombrar')}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-sans text-[13px] text-white transition-colors hover:bg-white/10"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Cambiar nombre
                </button>
              )}
              {puedeEliminar && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => abrirModo('eliminar')}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-sans text-[13px] text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Eliminar
                </button>
              )}
            </>
          )}
        </div>
      )}

      <Dialog
        open={modo === 'renombrar'}
        onClose={() => setModo(null)}
        title="Cambiar nombre"
        size="sm"
      >
        <form onSubmit={renombrar} className="flex flex-col gap-4">
          <FloatingLabelInput
            id={`renombrar-${objetivo.path}`}
            label="Nombre"
            value={nombre}
            onChange={(evento: { target: { value: string } }) => setNombre(evento.target.value)}
            maxLength={100}
            autoFocus
          />
          {error && (
            <p role="alert" className="font-sans text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModo(null)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={ocupado} disabled={nombre.trim().length < 2}>
              Guardar
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={modo === 'eliminar'}
        onClose={() => setModo(null)}
        title={`Eliminar «${proyecto.name}»`}
        description={
          objetivo.tipo === 'documento'
            ? 'Esto no se puede deshacer.'
            : objetivo.tipo === 'tablero'
              ? 'Esto no se puede deshacer, y se lleva por delante sus columnas y tareas.'
              : 'Esto no se puede deshacer, y se lleva por delante sus tableros y tareas.'
        }
        size="sm"
      >
        <form onSubmit={eliminar} className="flex flex-col gap-4">
          {objetivo.confirmarEscribiendo && (
            <FloatingLabelInput
              id={`eliminar-${objetivo.path}`}
              label={`Escribe «${proyecto.name}» para confirmar`}
              value={confirmacion}
              onChange={(evento: { target: { value: string } }) =>
                setConfirmacion(evento.target.value)
              }
              autoComplete="off"
            />
          )}
          {error && (
            <p role="alert" className="font-sans text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModo(null)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              isLoading={ocupado}
              disabled={objetivo.confirmarEscribiendo && confirmacion.trim() !== proyecto.name}
            >
              Eliminar {objetivo.tipo}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
