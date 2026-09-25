'use client';

import { FileText, IterationCw, NotebookText, SquareKanban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { createApiClient } from '../../api/client';
import { ApiError } from '../../api/envelope';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../molecules/Dialog';

export type TipoDeEspacio = 'BOARDS' | 'DOCUMENTS';

export interface EspacioDelArbol {
  id: string;
  name: string;
  kind: TipoDeEspacio;
}

type QueCrear = 'documento' | 'tablero' | 'espacio';

/**
 * Crear desde la barra lateral: un documento, un tablero o un espacio, sin
 * entrar antes al proyecto (E10 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * Vive en commons —la barra lateral es de todas las pantallas— así que no
 * puede usar las acciones de servidor de `web`: llama al gateway con el
 * cliente del navegador, como ya hace la barra para leer. Los permisos los
 * aplica el servidor; un 403 se dice aquí mismo.
 *
 * Lo que un tablero o un documento necesita de antemano se resuelve en el
 * mismo formulario: si no hay espacio del tipo que toca, se crea con él.
 */
export function CrearEnProyecto({
  abierto,
  onCerrar,
  proyecto,
  espacios,
  gatewayPath,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  proyecto: { id: string; slug: string; name: string };
  espacios: EspacioDelArbol[];
  gatewayPath: string;
  onCreado: () => void;
}) {
  const router = useRouter();
  const [que, setQue] = useState<QueCrear>('documento');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const tipoDelEspacio: TipoDeEspacio = que === 'tablero' ? 'BOARDS' : 'DOCUMENTS';
  const candidatos = espacios.filter((e) => e.kind === tipoDelEspacio);
  const [espacioId, setEspacioId] = useState<string>('');
  const elegido = candidatos.find((e) => e.id === espacioId) ?? candidatos[0] ?? null;
  const [espacioNuevo, setEspacioNuevo] = useState(false);
  const creaEspacio = que !== 'espacio' && (espacioNuevo || !elegido);

  async function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const nombre = String(datos.get('nombre') ?? '').trim();
    const nombreEspacio = String(datos.get('nombreEspacio') ?? '').trim();
    if (nombre.length < (que === 'documento' ? 1 : 2)) {
      setError('Escribe un nombre.');
      return;
    }
    setError(null);
    setEnviando(true);
    const api = createApiClient({ gatewayPath });

    try {
      let espacio = que === 'espacio' ? null : elegido;
      if (que === 'espacio' || creaEspacio) {
        const kind = que === 'espacio' ? (datos.get('tipo') as TipoDeEspacio) : tipoDelEspacio;
        const name =
          que === 'espacio'
            ? nombre
            : nombreEspacio || (kind === 'DOCUMENTS' ? 'Documentación' : 'Tableros');
        const creado = await api.post<{ id: string; name: string }>(
          `/projects/${proyecto.id}/workspaces`,
          { name, kind },
        );
        espacio = { id: creado.id, name: creado.name, kind };
      }
      if (!espacio) throw new Error('Sin espacio');

      const base = `/projects/${proyecto.slug}?tab=espacios&ws=${espacio.id}`;
      let destino = base;

      if (que === 'tablero') {
        const tablero = await api.post<{ id: string }>(`/workspaces/${espacio.id}/boards`, {
          name: nombre,
        });
        /* Un tablero sin columnas no sirve para nada, y menos uno de sprints. */
        const columnas = [
          { name: 'Por hacer', color: 'primary' },
          { name: 'En curso', color: 'info' },
          { name: 'Hecho', color: 'success' },
        ];
        for (const [order, columna] of columnas.entries()) {
          await api.post(`/boards/${tablero.id}/columns`, { ...columna, order });
        }
        if (datos.get('metodologia') === 'scrum') {
          await api.patch(`/boards/${tablero.id}`, { scrumEnabled: true });
        }
        destino = `${base}&board=${tablero.id}`;
      } else if (que === 'documento') {
        const documento = await api.post<{ id: string }>(`/workspaces/${espacio.id}/documents`, {
          title: nombre,
        });
        destino = `${base}&doc=${documento.id}`;
      }

      onCreado();
      onCerrar();
      router.push(destino);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 403
            ? 'No tienes permiso para crear esto en este proyecto.'
            : e.message
          : 'No se pudo crear. Inténtalo otra vez.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog tone="dark" open={abierto} onClose={onCerrar} title={`Nuevo en ${proyecto.name}`}>
      <form onSubmit={alEnviar} className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Qué crear" className="grid grid-cols-3 gap-2">
          <Opcion
            activa={que === 'documento'}
            onClick={() => setQue('documento')}
            icono={<FileText />}
          >
            Documento
          </Opcion>
          <Opcion
            activa={que === 'tablero'}
            onClick={() => setQue('tablero')}
            icono={<SquareKanban />}
          >
            Tablero
          </Opcion>
          <Opcion
            activa={que === 'espacio'}
            onClick={() => setQue('espacio')}
            icono={<NotebookText />}
          >
            Espacio
          </Opcion>
        </div>

        <Campo etiqueta={que === 'documento' ? 'Título' : 'Nombre'}>
          <input
            key={que}
            name="nombre"
            maxLength={que === 'documento' ? 200 : 100}
            placeholder={
              que === 'documento' ? 'Sin título' : que === 'tablero' ? 'Producto' : 'Diseño'
            }
            className={CAMPO}
          />
        </Campo>

        {que === 'espacio' && (
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 font-sans text-xs text-text-secondary">Contiene</legend>
            <div className="grid grid-cols-2 gap-2">
              <Radio name="tipo" value="BOARDS" defaultChecked titulo="Tableros" />
              <Radio name="tipo" value="DOCUMENTS" titulo="Documentos" />
            </div>
          </fieldset>
        )}

        {que === 'tablero' && (
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 font-sans text-xs text-text-secondary">
              Cómo se trabaja
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <Radio
                name="metodologia"
                value="kanban"
                defaultChecked
                titulo="Kanban"
                detalle="Columnas, sin fechas"
                icono={<SquareKanban className="h-4 w-4" />}
              />
              <Radio
                name="metodologia"
                value="scrum"
                titulo="Scrum"
                detalle="Sprints con meta y fecha"
                icono={<IterationCw className="h-4 w-4" />}
              />
            </div>
          </fieldset>
        )}

        {que !== 'espacio' && (
          <Campo etiqueta="Espacio">
            {candidatos.length > 0 && (
              <select
                value={espacioNuevo ? '__nuevo__' : (elegido?.id ?? '')}
                onChange={(e) => {
                  setEspacioNuevo(e.target.value === '__nuevo__');
                  if (e.target.value !== '__nuevo__') setEspacioId(e.target.value);
                }}
                className={CAMPO}
              >
                {candidatos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
                <option value="__nuevo__">
                  Nuevo espacio de {que === 'documento' ? 'documentos' : 'tableros'}…
                </option>
              </select>
            )}
            {creaEspacio && (
              <input
                name="nombreEspacio"
                maxLength={100}
                placeholder={que === 'documento' ? 'Documentación' : 'Tableros'}
                className={`${CAMPO} ${candidatos.length > 0 ? 'mt-2' : ''}`}
              />
            )}
          </Campo>
        )}

        {error && (
          <p role="alert" className="font-sans text-xs text-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={enviando}>
            Crear
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const CAMPO =
  'w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-primary [color-scheme:dark]';

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: el control llega en `children`, dentro de la etiqueta
    <label className="flex flex-col gap-1.5 font-sans text-xs text-text-secondary">
      {etiqueta}
      {children}
    </label>
  );
}

function Opcion({
  activa,
  onClick,
  icono,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  icono: ReactNode;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: un radio nativo no se deja pintar como tarjeta con icono sin perder el foco visible
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onClick}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-3 py-3 font-sans text-xs transition-colors [&_svg]:h-5 [&_svg]:w-5 ${
        activa
          ? 'border-primary bg-primary/10 text-text-primary'
          : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
      }`}
    >
      {icono}
      {children}
    </button>
  );
}

function Radio({
  name,
  value,
  titulo,
  detalle,
  icono,
  defaultChecked,
}: {
  name: string;
  value: string;
  titulo: string;
  detalle?: string;
  icono?: ReactNode;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="sr-only"
      />
      {icono && <span className="mt-0.5 text-text-secondary">{icono}</span>}
      <span className="flex flex-col">
        <span className="font-sans text-sm text-text-primary">{titulo}</span>
        {detalle && <span className="font-sans text-[11px] text-text-secondary">{detalle}</span>}
      </span>
    </label>
  );
}
