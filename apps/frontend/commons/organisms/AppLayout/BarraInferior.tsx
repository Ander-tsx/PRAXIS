'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { Avatar } from '../../atoms/Avatar';

export type PestanaInferior = 'inicio' | 'chat' | 'prax' | 'avisos' | 'tu';

/**
 * La barra de pestañas de abajo, **solo en móvil** (D7 de `docs/PLAN-MOVIL.md`):
 * Inicio · Chat · PRAX · Avisos · Tú.
 *
 * Sustituye a la hamburguesa flotante y su cajón. Tres son sitios (enlaces) y
 * dos son hojas (Avisos y Tú), que se abren encima de donde estés: lo mismo
 * que hacen las apps nativas con lo que no es una sección.
 *
 * ## Cuándo no está
 *
 * - **Mientras se escribe.** Con `interactive-widget=resizes-content`, al abrir
 *   el teclado la ventana se encoge y una barra fija subiría con él, tapando el
 *   compositor. Se esconde con el foco en un campo y vuelve al salir.
 * - **Dentro de una conversación** (`/chat/<algo>`): esa pantalla trae su
 *   propio «atrás» y su compositor abajo, como cualquier app de mensajes.
 *
 * Publica su alto en `--barra-inferior` (en `<html>`), que es lo que la columna
 * de contenido reserva abajo: cuando se esconde vale 0 y el contenido baja.
 *
 * ⚠️ `z-30`, **por debajo** de los paneles (`SlideOver` empieza en 39) y las
 * hojas: con el mismo nivel, la barra quedaba encima del panel de una tarea y le
 * tapaba el final.
 */
export function BarraInferior({
  activa,
  mensajesSinLeer,
  avisosSinLeer,
  usuario,
  oculta,
  onAvisos,
  onTu,
}: {
  activa: PestanaInferior | null;
  mensajesSinLeer: number;
  avisosSinLeer: number;
  usuario: { name: string; email: string; avatarSrc?: string | null };
  /** Oculta por la ruta (una conversación). */
  oculta: boolean;
  onAvisos: () => void;
  onTu: () => void;
}) {
  const escribiendo = useEscribiendo();
  const visible = !oculta && !escribiendo;

  useEffect(() => {
    const raiz = document.documentElement;
    /* Oculta por la ruta (una conversación), lo de abajo sigue siendo la barra
       de inicio del teléfono: se reserva su zona segura para que el compositor
       no quede debajo. Oculta porque se escribe, 0: ahí manda el teclado
       (`--teclado`, ver `GestosMoviles`). */
    raiz.style.setProperty(
      '--barra-inferior',
      visible
        ? 'calc(env(safe-area-inset-bottom, 0px) + 3.5rem)'
        : oculta
          ? 'env(safe-area-inset-bottom, 0px)'
          : '0px',
    );
    return () => {
      raiz.style.removeProperty('--barra-inferior');
    };
  }, [visible, oculta]);

  const nombre = usuario.name.trim() || usuario.email;

  return (
    <nav
      aria-label="Secciones"
      aria-hidden={!visible || undefined}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#191919]/95 pb-safe backdrop-blur-md transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <ul className="grid h-14 grid-cols-5">
        <Pestana etiqueta="Inicio" href="/projects" activa={activa === 'inicio'}>
          <IconoInicio />
        </Pestana>
        <Pestana etiqueta="Chat" href="/chat" activa={activa === 'chat'} insignia={mensajesSinLeer}>
          <IconoChat />
        </Pestana>
        <Pestana etiqueta="PRAX" href="/assistant" activa={activa === 'prax'}>
          <IconoPrax />
        </Pestana>
        <Pestana
          etiqueta="Avisos"
          onClick={onAvisos}
          activa={activa === 'avisos'}
          insignia={avisosSinLeer}
        >
          <IconoAvisos />
        </Pestana>
        <Pestana etiqueta="Tú" onClick={onTu} activa={activa === 'tu'}>
          <span
            className={`flex rounded-full ring-2 transition-colors ${
              activa === 'tu' ? 'ring-white' : 'ring-transparent'
            }`}
          >
            <Avatar label={nombre} mine size="sm" src={usuario.avatarSrc ?? null} />
          </span>
        </Pestana>
      </ul>
    </nav>
  );
}

function Pestana({
  etiqueta,
  href,
  onClick,
  activa,
  insignia = 0,
  children,
}: {
  etiqueta: string;
  href?: string;
  onClick?: () => void;
  activa: boolean;
  insignia?: number;
  children: ReactNode;
}) {
  const clase = `relative flex h-full w-full flex-col items-center justify-center gap-0.5 font-sans text-[10px] font-medium transition-colors active:opacity-70 ${
    activa ? 'text-white' : 'text-text-secondary'
  }`;
  const contenido = (
    <>
      <span className="relative flex h-6 w-6 items-center justify-center [&>svg]:h-[22px] [&>svg]:w-[22px]">
        {children}
        {insignia > 0 && (
          <span
            aria-label={`${insignia} sin leer`}
            className="absolute -right-2 -top-1 min-w-4 rounded-full bg-primary px-1 text-center font-sans text-[9px] font-semibold leading-4 text-primary-foreground ring-2 ring-[#191919]"
          >
            {insignia > 99 ? '99+' : insignia}
          </span>
        )}
      </span>
      {etiqueta}
    </>
  );
  return (
    <li className="h-full">
      {href ? (
        <Link href={href} aria-current={activa ? 'page' : undefined} className={clase}>
          {contenido}
        </Link>
      ) : (
        <button type="button" onClick={onClick} aria-expanded={activa} className={clase}>
          {contenido}
        </button>
      )}
    </li>
  );
}

/**
 * Si hay un campo de texto con el foco: la señal de que el teclado está
 * abierto. Se mira el foco y no el alto de la ventana porque, con
 * `resizes-content`, el alto cambia también al girar el teléfono o al mostrar
 * la barra del navegador.
 */
function useEscribiendo(): boolean {
  const [escribiendo, setEscribiendo] = useState(false);
  useEffect(() => {
    const esCampo = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      if (el instanceof HTMLTextAreaElement) return true;
      if (el instanceof HTMLInputElement) {
        return ![
          'button',
          'checkbox',
          'radio',
          'range',
          'submit',
          'reset',
          'file',
          'color',
        ].includes(el.type);
      }
      return false;
    };
    const entra = (e: FocusEvent) => {
      if (esCampo(e.target)) setEscribiendo(true);
    };
    /* `relatedTarget` es adónde va el foco: de un campo a otro no se enseña. */
    const sale = (e: FocusEvent) => {
      if (!esCampo(e.relatedTarget)) setEscribiendo(false);
    };
    document.addEventListener('focusin', entra);
    document.addEventListener('focusout', sale);
    return () => {
      document.removeEventListener('focusin', entra);
      document.removeEventListener('focusout', sale);
    };
  }, []);
  return escribiendo;
}

function IconoInicio() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z"
      />
    </svg>
  );
}

function IconoChat() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

/** El fantasma de PRAX, en trazo, a juego con los otros cuatro. */
function IconoPrax() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 11a7 7 0 0114 0v9l-2.333-1.5L14.333 20 12 18.5 9.667 20l-2.334-1.5L5 20v-9z"
      />
      <path strokeLinecap="round" d="M9.5 11v1M14.5 11v1" />
    </svg>
  );
}

function IconoAvisos() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
