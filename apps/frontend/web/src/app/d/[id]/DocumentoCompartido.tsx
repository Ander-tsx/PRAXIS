'use client';

import {
  DocumentEditor,
  ExportarDocumento,
  HistorialDeVersiones,
} from '@/components/organisms/DocumentEditor';
import { projectHref } from '@praxis/commons';
import Link from 'next/link';
import { useCallback } from 'react';

type Estado = 'ok' | 'login' | 'sin-acceso' | 'no-existe' | 'error';

/**
 * La página de un documento compartido: una barra mínima y el editor, en la
 * paleta de la aplicación. Nada del proyecto: quien entra por aquí puede ser
 * un invitado que no ve nada más (decisión 4).
 */
export function DocumentoCompartido({
  id,
  k,
  estado,
  meta,
  conSesion,
  login,
}: {
  id: string;
  k: string | null;
  estado: Estado;
  meta: { title: string; projectId: string; workspaceId: string; isMember: boolean } | null;
  conSesion: boolean;
  login: string;
}) {
  const irAEntrar = useCallback(() => window.location.assign(login), [login]);

  return (
    <div data-tone="dark" className="min-h-screen bg-surface text-text-primary">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/95 px-5 py-3 backdrop-blur">
        <Link href="/" className="font-sans text-base font-bold tracking-tight text-primary">
          Praxis
        </Link>
        <span className="min-w-0 flex-1 truncate font-sans text-sm text-text-secondary">
          {meta?.title}
        </span>
        {meta?.isMember && (
          <Link
            /* El UUID vale igual que el slug en la URL de un proyecto (CLAUDE.md,
               trampa 10), y aquí no se tiene el slug. */
            href={`${projectHref({ slug: meta.projectId }, { tab: 'espacios', ws: meta.workspaceId })}&doc=${id}`}
            className="font-sans text-xs text-text-secondary hover:text-text-primary"
          >
            Abrir en el proyecto
          </Link>
        )}
        {!conSesion && (
          <a
            href={login}
            className="rounded-lg border border-border px-3 py-1.5 font-sans text-xs text-text-primary hover:border-border-strong"
          >
            Entrar
          </a>
        )}
      </header>

      <main className="px-5 pt-10">
        {estado === 'ok' && meta ? (
          <DocumentEditor
            documentId={id}
            k={k}
            conSesion={conSesion}
            titulo={meta.title}
            alPedirSesion={irAEntrar}
            acciones={(modo, editor) => (
              <>
                <ExportarDocumento editor={editor} titulo={meta.title} k={k} />
                {modo === 'edit' && <HistorialDeVersiones documentId={id} k={k} editor={editor} />}
              </>
            )}
          />
        ) : (
          <Mensaje estado={estado} login={login} />
        )}
      </main>
    </div>
  );
}

function Mensaje({ estado, login }: { estado: Estado; login: string }) {
  const textos: Record<Exclude<Estado, 'ok'>, [string, string]> = {
    login: [
      'Entra para abrir este documento',
      'Si te lo compartieron por correo, entra con esa dirección.',
    ],
    'sin-acceso': [
      'No tienes acceso',
      'Tu cuenta no está invitada a este documento. Si te lo mandaron a otro correo, entra con ese.',
    ],
    'no-existe': ['Este documento no existe', 'Puede que lo borraran o que el enlace ya no valga.'],
    error: ['No se pudo abrir', 'Vuelve a intentarlo en un momento.'],
  };
  const [titulo, texto] = textos[estado === 'ok' ? 'error' : estado];
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="font-sans text-2xl font-bold">{titulo}</h1>
      <p className="font-sans text-sm text-text-secondary">{texto}</p>
      {(estado === 'login' || estado === 'sin-acceso') && (
        <a
          href={login}
          className="mt-2 rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground"
        >
          {estado === 'login' ? 'Entrar' : 'Entrar con otra cuenta'}
        </a>
      )}
    </div>
  );
}
