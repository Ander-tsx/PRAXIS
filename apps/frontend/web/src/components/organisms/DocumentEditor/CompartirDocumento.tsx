'use client';

import { Button, Dialog } from '@praxis/commons';
import { Check, Copy, Globe, Lock, Share2, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { rutaDeDocumento } from './contexto';

type Acceso = 'NONE' | 'READ' | 'EDIT';
type Papel = 'READ' | 'EDIT';

interface Compartido {
  linkAccess: Acceso;
  link: string | null;
  invites: { id: string; email: string; role: Papel }[];
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(cuerpo?.error?.message ?? 'No se pudo guardar.');
  return cuerpo.data as T;
}

/**
 * Compartir un documento, como Google Docs (E8 de `docs/PLAN-DOCUMENTOS.md`):
 *
 * - **Personas**: invitar un correo como lector o editor. Le llega el enlace y
 *   entra con **ese** correo; no ocupa asiento ni ve nada más del proyecto.
 * - **Acceso general**: solo el equipo del proyecto (por defecto), o cualquiera
 *   con el enlace —leer sin cuenta, o editar entrando con una—.
 *
 * El equipo del proyecto siempre entra, con lo que le dé su papel.
 */
export function CompartirDocumento({ documentId }: { documentId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<Compartido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    pedir<Compartido>(rutaDeDocumento(documentId, '/share'))
      .then(setDatos)
      .catch((e: Error) => setError(e.message));
  }, [documentId]);

  useEffect(() => {
    if (abierto) cargar();
  }, [abierto, cargar]);

  async function cambiar(cuerpo: { linkAccess?: Acceso; regenerateLink?: boolean }) {
    setOcupado(true);
    setError(null);
    try {
      setDatos(
        await pedir<Compartido>(rutaDeDocumento(documentId, '/share'), {
          method: 'PATCH',
          body: JSON.stringify(cuerpo),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function invitar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const campos = new FormData(formulario);
    const email = String(campos.get('email') ?? '').trim();
    if (!email) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await pedir<Compartido & { enviado: boolean }>(
        rutaDeDocumento(documentId, '/invites'),
        { method: 'POST', body: JSON.stringify({ email, role: campos.get('role') }) },
      );
      setDatos(r);
      formulario.reset();
      setAviso(
        r.enviado
          ? `Invitación enviada a ${email}.`
          : `${email} ya tiene acceso; el correo no salió, pásale el enlace.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarPapel(email: string, role: Papel) {
    setDatos(
      await pedir<Compartido>(rutaDeDocumento(documentId, '/invites'), {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      }).catch(() => datos),
    );
  }

  async function quitar(inviteId: string) {
    setDatos(
      await pedir<Compartido>(rutaDeDocumento(documentId, `/invites/${inviteId}`), {
        method: 'DELETE',
      }).catch(() => datos),
    );
  }

  function copiar() {
    const enlace =
      datos?.linkAccess !== 'NONE' && datos?.link
        ? datos.link
        : `${window.location.origin}/d/${documentId}`;
    void navigator.clipboard.writeText(enlace).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    });
  }

  const publico = datos && datos.linkAccess !== 'NONE';

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>
        <Share2 className="mr-1.5 h-3.5 w-3.5" />
        Compartir
      </Button>
      <Dialog
        tone="dark"
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Compartir"
        size="md"
      >
        {!datos ? (
          <p className="font-sans text-sm text-text-secondary">{error ?? 'Cargando…'}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <form onSubmit={invitar} className="flex gap-2">
              <input
                name="email"
                type="email"
                required
                placeholder="Correo de la persona"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-primary"
              />
              <select
                name="role"
                defaultValue="READ"
                className="h-9 rounded-lg border border-border bg-background px-2 font-sans text-sm text-text-primary outline-none [color-scheme:dark]"
              >
                <option value="READ">Lector</option>
                <option value="EDIT">Editor</option>
              </select>
              <Button type="submit" size="sm" isLoading={ocupado}>
                Invitar
              </Button>
            </form>

            {datos.invites.length > 0 && (
              <section className="flex flex-col gap-1" aria-label="Personas invitadas">
                <h4 className="font-sans text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Invitadas
                </h4>
                <ul className="flex flex-col">
                  {datos.invites.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center gap-2 border-b border-border py-2 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-primary">
                        {i.email}
                      </span>
                      <select
                        value={i.role}
                        aria-label={`Papel de ${i.email}`}
                        onChange={(e) => void cambiarPapel(i.email, e.target.value as Papel)}
                        className="h-8 rounded-md border border-border bg-transparent px-1.5 font-sans text-xs text-text-secondary outline-none [color-scheme:dark]"
                      >
                        <option value="READ">Lector</option>
                        <option value="EDIT">Editor</option>
                      </select>
                      <button
                        type="button"
                        aria-label={`Quitar a ${i.email}`}
                        onClick={() => void quitar(i.id)}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-white/[0.07] hover:text-error"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="flex flex-col gap-2" aria-label="Acceso general">
              <h4 className="font-sans text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Acceso general
              </h4>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-text-secondary">
                  {publico ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <select
                    value={publico ? 'link' : 'equipo'}
                    disabled={ocupado}
                    onChange={(e) =>
                      void cambiar({ linkAccess: e.target.value === 'link' ? 'READ' : 'NONE' })
                    }
                    className="w-fit bg-transparent font-sans text-sm text-text-primary outline-none [color-scheme:dark]"
                  >
                    <option value="equipo">Solo el equipo del proyecto</option>
                    <option value="link">Cualquiera con el enlace</option>
                  </select>
                  <span className="font-sans text-xs text-text-secondary">
                    {publico
                      ? datos.linkAccess === 'EDIT'
                        ? 'Puede leerlo cualquiera; para editar hay que entrar con una cuenta.'
                        : 'Lo puede leer cualquiera que tenga el enlace, sin cuenta.'
                      : 'Solo el equipo y las personas invitadas.'}
                  </span>
                </div>
                {publico && (
                  <select
                    value={datos.linkAccess}
                    disabled={ocupado}
                    aria-label="Qué puede hacer quien tenga el enlace"
                    onChange={(e) => void cambiar({ linkAccess: e.target.value as Acceso })}
                    className="h-8 rounded-md border border-border bg-transparent px-1.5 font-sans text-xs text-text-secondary outline-none [color-scheme:dark]"
                  >
                    <option value="READ">Lector</option>
                    <option value="EDIT">Editor</option>
                  </select>
                )}
              </div>
            </section>

            {(error || aviso) && (
              <p
                role={error ? 'alert' : 'status'}
                className={`font-sans text-xs ${error ? 'text-error' : 'text-text-secondary'}`}
              >
                {error ?? aviso}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              {publico ? (
                <button
                  type="button"
                  onClick={() => void cambiar({ regenerateLink: true })}
                  className="cursor-pointer font-sans text-xs text-text-secondary hover:text-text-primary"
                  title="El enlace de ahora deja de abrir el documento"
                >
                  Cambiar el enlace
                </button>
              ) : (
                <span />
              )}
              <Button size="sm" variant="secondary" onClick={copiar}>
                {copiado ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copiado ? 'Copiado' : 'Copiar enlace'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
