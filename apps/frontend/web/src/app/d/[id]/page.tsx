import { SESSION_COOKIE } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { DocumentoCompartido } from './DocumentoCompartido';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';

interface Meta {
  id: string;
  title: string;
  projectId: string;
  workspaceId: string;
  mode: 'edit' | 'read';
  isMember: boolean;
  canShare: boolean;
}

/**
 * Lo que devuelve el gateway para esta visita: el documento, o por qué no.
 * Se pide aquí, en el servidor, para poner el título en la pestaña y decidir
 * sin parpadeos si hace falta entrar.
 */
async function cargar(id: string, k: string | undefined) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const respuesta = await fetch(
    `${GATEWAY}/api/documents/${encodeURIComponent(id)}${k ? `?k=${encodeURIComponent(k)}` : ''}`,
    { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: 'no-store' },
  ).catch(() => null);
  if (!respuesta) return { estado: 'error' as const };
  if (respuesta.status === 401) return { estado: 'login' as const };
  if (respuesta.status === 403) return { estado: 'sin-acceso' as const };
  if (!respuesta.ok) return { estado: 'no-existe' as const };
  const cuerpo = await respuesta.json();
  return { estado: 'ok' as const, meta: cuerpo.data as Meta, conSesion: !!token };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, { k }] = await Promise.all([params, searchParams]);
  const r = await cargar(id, k);
  return {
    title: r.estado === 'ok' ? `${r.meta.title || 'Sin título'} · Praxis` : 'Documento · Praxis',
    robots: { index: false, follow: false },
  };
}

/**
 * Un documento abierto por su enlace (E8 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * Fuera de `PREFIJOS_PRIVADOS`: el guard no la intercepta —pasa, eso sí, por la
 * renovación de sesión— y es la página la que decide. Sin sesión y sin enlace
 * público, manda a entrar y vuelve aquí (`?next=`). Con sesión y sin acceso,
 * lo dice: puede que se entrara con otro correo que el invitado.
 */
export default async function DocumentoPorEnlace({ params, searchParams }: Props) {
  const [{ id }, { k }] = await Promise.all([params, searchParams]);
  const r = await cargar(id, k);
  const volver = `/d/${id}${k ? `?k=${encodeURIComponent(k)}` : ''}`;

  return (
    <DocumentoCompartido
      id={id}
      k={k ?? null}
      estado={r.estado}
      meta={r.estado === 'ok' ? r.meta : null}
      conSesion={r.estado === 'ok' ? r.conSesion : false}
      login={`/auth/login?next=${encodeURIComponent(volver)}`}
    />
  );
}
