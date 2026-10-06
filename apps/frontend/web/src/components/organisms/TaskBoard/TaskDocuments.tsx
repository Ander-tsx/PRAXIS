'use client';

import { ApiError, createApiClient, useRefrescoAgrupado } from '@praxis/commons';
import { FileText, Link2, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

interface DocumentoVinculado {
  id: string;
  title: string;
  workspaceId: string;
  updatedAt: string;
}

interface EspacioDeDocumentos {
  id: string;
  name: string;
  documents: { id: string; title: string }[];
}

const api = createApiClient({ gatewayPath: '/api/gateway' });

/**
 * Los documentos de una tarea (E9 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * Es lo que sustituye a adjuntar PDF como forma principal de dar contexto a una
 * tarea: un documento del proyecto se escribe y se lee dentro de Praxis, se
 * edita a la vez y se enlaza desde varias tareas. Desde aquí se **vincula** uno
 * existente o se **crea** uno nuevo —en un espacio de documentos, o en uno que
 * se crea con él— y se abre.
 */
export function TaskDocuments({
  projectId,
  taskId,
  canEdit,
}: {
  projectId: string;
  taskId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  /* La tarjeta del tablero enseña los documentos vinculados (`Task.documents`),
     y esto escribe por la API sin pasar por una Server Action que revalide:
     sin refrescar, la marca seguiría diciendo lo de antes. */
  const refrescar = useRefrescoAgrupado();
  const [vinculados, setVinculados] = useState<DocumentoVinculado[] | null>(null);
  const [espacios, setEspacios] = useState<EspacioDeDocumentos[] | null>(null);
  const [modo, setModo] = useState<'nada' | 'vincular' | 'crear'>('nada');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vigente = true;
    api
      .get<DocumentoVinculado[]>(`/tasks/${taskId}/documents`)
      .then((d) => vigente && setVinculados(d))
      .catch(() => vigente && setVinculados([]));
    return () => {
      vigente = false;
    };
  }, [taskId]);

  /* Los espacios de documentos del proyecto, solo cuando hacen falta. */
  const cargarEspacios = useCallback(() => {
    if (espacios) return;
    api
      .get<{ workspaces?: (EspacioDeDocumentos & { kind?: string })[] }>(`/projects/${projectId}`)
      .then((p) =>
        setEspacios(
          (p.workspaces ?? [])
            .filter((w) => w.kind === 'DOCUMENTS')
            .map((w) => ({ id: w.id, name: w.name, documents: w.documents ?? [] })),
        ),
      )
      .catch(() => setEspacios([]));
  }, [espacios, projectId]);

  const candidatos = useMemo(() => {
    const ya = new Set((vinculados ?? []).map((d) => d.id));
    const q = busqueda.trim().toLowerCase();
    return (espacios ?? []).flatMap((e) =>
      e.documents
        .filter((d) => !ya.has(d.id) && (!q || d.title.toLowerCase().includes(q)))
        .map((d) => ({ ...d, espacio: e.name })),
    );
  }, [espacios, vinculados, busqueda]);

  const hrefDe = (d: { id: string; workspaceId: string }) =>
    `/projects/${projectId}?tab=espacios&ws=${d.workspaceId}&doc=${d.id}`;

  async function vincular(documentId: string) {
    setOcupado(true);
    setError(null);
    try {
      setVinculados(
        await api.post<DocumentoVinculado[]>(`/tasks/${taskId}/documents`, { documentId }),
      );
      setModo('nada');
      setBusqueda('');
      refrescar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo vincular.');
    } finally {
      setOcupado(false);
    }
  }

  async function desvincular(documentId: string) {
    setVinculados(
      await api
        .delete<DocumentoVinculado[]>(`/tasks/${taskId}/documents/${documentId}`)
        .catch(() => vinculados),
    );
    refrescar();
  }

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const titulo = String(datos.get('titulo') ?? '').trim() || 'Sin título';
    const espacioId = String(datos.get('espacio') ?? '');
    setOcupado(true);
    setError(null);
    try {
      let ws = espacioId;
      if (!ws || ws === '__nuevo__') {
        const nombre = String(datos.get('nombreEspacio') ?? '').trim() || 'Documentación';
        ws = (
          await api.post<{ id: string }>(`/projects/${projectId}/workspaces`, {
            name: nombre,
            kind: 'DOCUMENTS',
          })
        ).id;
      }
      const doc = await api.post<{ id: string }>(`/workspaces/${ws}/documents`, { title: titulo });
      await api.post(`/tasks/${taskId}/documents`, { documentId: doc.id });
      router.push(hrefDe({ id: doc.id, workspaceId: ws }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el documento.');
      setOcupado(false);
    }
  }

  return (
    <section className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5">
      <header className="flex items-center justify-between gap-3">
        <h4 className="font-sans text-sm font-medium text-text-primary">
          Documentos{' '}
          {!!vinculados?.length && (
            <span className="font-normal tabular-nums text-text-secondary">
              {vinculados.length}
            </span>
          )}
        </h4>
        {canEdit && modo === 'nada' && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                cargarEspacios();
                setModo('vincular');
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-white/[0.07] hover:text-text-primary"
            >
              <Link2 className="h-3.5 w-3.5" />
              Vincular
            </button>
            <button
              type="button"
              onClick={() => {
                cargarEspacios();
                setModo('crear');
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-white/[0.07] hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo
            </button>
          </span>
        )}
      </header>

      {vinculados && vinculados.length > 0 && (
        <ul className="flex flex-col">
          {vinculados.map((d) => (
            <li
              key={d.id}
              className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-white/[0.04]"
            >
              <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
              <a
                href={hrefDe(d)}
                className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary hover:underline"
              >
                {d.title || 'Sin título'}
              </a>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Quitar «${d.title}» de la tarea`}
                  title="Quitar de la tarea (el documento no se borra)"
                  onClick={() => void desvincular(d.id)}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-secondary opacity-0 transition-opacity hover:text-error group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {vinculados?.length === 0 && modo === 'nada' && (
        <p className="font-sans text-xs text-text-secondary">
          {canEdit
            ? 'Especificaciones, actas, notas: escríbelas como documento y vincúlalas aquí.'
            : 'Sin documentos.'}
        </p>
      )}

      {modo === 'vincular' && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un documento del proyecto"
            aria-label="Buscar un documento del proyecto"
            className="h-8 rounded-lg bg-background px-2.5 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary"
          />
          <ul className="flex max-h-48 flex-col overflow-y-auto">
            {espacios === null && (
              <li className="px-2 py-1.5 font-sans text-xs text-text-secondary">Cargando…</li>
            )}
            {espacios !== null && candidatos.length === 0 && (
              <li className="px-2 py-1.5 font-sans text-xs text-text-secondary">
                No hay documentos que vincular.
              </li>
            )}
            {candidatos.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void vincular(d.id)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06]"
                >
                  <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
                    {d.title || 'Sin título'}
                  </span>
                  <span className="shrink-0 font-sans text-[11px] text-text-secondary">
                    {d.espacio}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setModo('nada')}
            className="self-end cursor-pointer px-2 font-sans text-xs text-text-secondary hover:text-text-primary"
          >
            Cancelar
          </button>
        </div>
      )}

      {modo === 'crear' && (
        <form onSubmit={crear} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <input
            name="titulo"
            placeholder="Título del documento"
            aria-label="Título del documento"
            maxLength={200}
            className="h-9 rounded-lg bg-background px-2.5 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary"
          />
          <EspacioParaCrear espacios={espacios} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModo('nada')}
              className="cursor-pointer px-2 font-sans text-xs text-text-secondary hover:text-text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={ocupado}
              className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 font-sans text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {ocupado ? 'Creando…' : 'Crear y abrir'}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="font-sans text-xs text-error">
          {error}
        </p>
      )}
    </section>
  );
}

/** Dónde crearlo: un espacio de documentos, o uno nuevo si no hay o se prefiere. */
function EspacioParaCrear({ espacios }: { espacios: EspacioDeDocumentos[] | null }) {
  const [elegido, setElegido] = useState('');
  useEffect(() => {
    if (espacios?.length && !elegido) setElegido(espacios[0].id);
  }, [espacios, elegido]);
  const nuevo = !espacios?.length || elegido === '__nuevo__';

  return (
    <>
      {!!espacios?.length && (
        <select
          name="espacio"
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          aria-label="Espacio"
          className="h-9 rounded-lg bg-background px-2 font-sans text-sm text-text-primary outline-none [color-scheme:dark]"
        >
          {espacios.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
          <option value="__nuevo__">Nuevo espacio de documentos…</option>
        </select>
      )}
      {nuevo && (
        <input
          name="nombreEspacio"
          placeholder="Documentación"
          aria-label="Nombre del espacio nuevo"
          maxLength={100}
          className="h-9 rounded-lg bg-background px-2.5 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary"
        />
      )}
    </>
  );
}
