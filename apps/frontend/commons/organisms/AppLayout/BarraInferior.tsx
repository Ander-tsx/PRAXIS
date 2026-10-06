'use client';

import Link from 'next/link';
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Avatar } from '../../atoms/Avatar';

export type PestanaInferior = 'inicio' | 'chat' | 'prax' | 'avisos' | 'tu';

const ORDEN: PestanaInferior[] = ['inicio', 'chat', 'prax', 'avisos', 'tu'];

/**
 * La barra de pestañas de abajo, **solo en móvil** (D7 de `docs/PLAN-MOVIL.md`):
 * Inicio · Chat · PRAX · Avisos · Tú.
 *
 * Sustituye a la hamburguesa flotante y su cajón. Desde M8 **las cinco son
 * pantallas**: Avisos y Tú fueron hojas que se abrían encima, y el dueño las
 * quiere como las otras tres —una pestaña es un sitio, no un desplegable—.
 *
 * ## Lo que la hace sentirse viva (M8)
 *
 * - Una **píldora** detrás del icono activo que se desliza de una pestaña a la
 *   otra en vez de saltar.
 * - El icono activo **se rellena** y da un pequeño salto al activarse.
 * - Las insignias entran con un rebote cuando cambia su número.
 * - Pulsar la pestaña en la que ya estás **sube al principio** de la pantalla,
 *   como en cualquier app nativa.
 * - En Android, un toque háptico corto al cambiar de pestaña.
 *
 * Todo respeta `prefers-reduced-motion` (las clases están en `theme.css`).
 *
 * ## Cuándo no está
 *
 * **Solo mientras se escribe.** Con `interactive-widget=resizes-content`, al
 * abrir el teclado la ventana se encoge y una barra fija subiría con él,
 * tapando el compositor. Se esconde con el foco en un campo y vuelve al salir.
 * Dentro de una conversación ya **sí** está (M8): antes la conversación tapaba
 * la pantalla entera y no había forma de cambiar de pestaña desde ella.
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
}: {
  activa: PestanaInferior | null;
  mensajesSinLeer: number;
  avisosSinLeer: number;
  usuario: { name: string; email: string; avatarSrc?: string | null };
}) {
  const escribiendo = useEscribiendo();
  const visible = !escribiendo;

  useEffect(() => {
    const raiz = document.documentElement;
    /* Oculta porque se escribe, 0: ahí manda el teclado (`--teclado`, ver
       `GestosMoviles`). */
    raiz.style.setProperty(
      '--barra-inferior',
      visible ? 'calc(env(safe-area-inset-bottom, 0px) + 3.5rem)' : '0px',
    );
    return () => {
      raiz.style.removeProperty('--barra-inferior');
    };
  }, [visible]);

  const nombre = usuario.name.trim() || usuario.email;
  const indice = activa ? ORDEN.indexOf(activa) : -1;

  return (
    <nav
      aria-label="Secciones"
      aria-hidden={!visible || undefined}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#191919]/95 pb-safe backdrop-blur-md transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <ul className="relative grid h-14 grid-cols-5">
        {/* La píldora del activo: una sola, que se desliza. Mide un quinto del
            ancho y se mueve en quintos; fuera de las cinco secciones se va. */}
        <li
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex w-1/5 justify-center pt-1.5 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none"
          style={{
            transform: `translateX(${Math.max(indice, 0) * 100}%)`,
            opacity: indice < 0 ? 0 : 1,
          }}
        >
          <span className="h-8 w-14 rounded-full bg-white/[0.09]" />
        </li>
        <Pestana etiqueta="Inicio" href="/projects" activa={activa === 'inicio'}>
          <IconoInicio relleno={activa === 'inicio'} />
        </Pestana>
        {/* `?lista=1`: la pestaña abre la lista de chats, no la última
            conversación (ver `chat/(conversaciones)/page.tsx`). */}
        <Pestana
          etiqueta="Chat"
          href="/chat?lista=1"
          activa={activa === 'chat'}
          insignia={mensajesSinLeer}
        >
          <IconoChat relleno={activa === 'chat'} />
        </Pestana>
        <Pestana etiqueta="PRAX" href="/assistant" activa={activa === 'prax'}>
          <IconoPrax relleno={activa === 'prax'} />
        </Pestana>
        <Pestana
          etiqueta="Avisos"
          href="/main/notifications"
          activa={activa === 'avisos'}
          insignia={avisosSinLeer}
        >
          <IconoAvisos relleno={activa === 'avisos'} />
        </Pestana>
        <Pestana etiqueta="Tú" href="/main/me" activa={activa === 'tu'}>
          <span
            className={`flex rounded-full ring-2 transition-[box-shadow,transform] duration-200 ${
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
  activa,
  insignia = 0,
  children,
}: {
  etiqueta: string;
  href: string;
  activa: boolean;
  insignia?: number;
  children: ReactNode;
}) {
  /* El salto se pone al pasar a activa, no al montar ya activa: si no, cada
     carga de página haría saltar el icono de la pestaña en la que se está. */
  const [salta, setSalta] = useState(false);
  const antes = useRef(activa);
  useEffect(() => {
    if (activa && !antes.current) setSalta(true);
    antes.current = activa;
  }, [activa]);

  function alPulsar(e: MouseEvent<HTMLAnchorElement>) {
    if (activa) {
      /* Ya estás aquí: arriba del todo, como en una app nativa. Si la pantalla
         es una conversación o una sección dentro de la pestaña, sí navega a su
         raíz (el enlace sigue su curso). */
      const raiz = href.split('?')[0];
      if (window.location.pathname === raiz) {
        e.preventDefault();
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
        for (const capa of document.querySelectorAll<HTMLElement>('main .overflow-y-auto')) {
          capa.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      return;
    }
    /* Un toque corto donde haya motor de vibración (Android). iOS no lo expone
       a la web y la llamada no existe: no pasa nada. */
    navigator.vibrate?.(8);
  }

  const clase = `group relative z-10 flex h-full w-full flex-col items-center justify-center gap-1 font-sans text-[10px] transition-colors active:opacity-70 [-webkit-tap-highlight-color:transparent] ${
    activa ? 'font-semibold text-white' : 'font-medium text-text-secondary'
  }`;
  return (
    <li className="h-full">
      {/**
       * `prefetch` completo: cambiar de pestaña tiene que ser instantáneo.
       *
       * ⚠️ El service worker **no** sirve aquí: con red va red-primero (D4) y
       * una navegación del App Router es una petición RSC que no guarda. Lo
       * que evita el esqueleto es la caché de cliente de Next, y para una
       * página dinámica solo guarda algo si el prefetch fue completo (dura
       * `staleTimes.static`, 5 min; un `revalidatePath` o un refresco la
       * invalidan). Por defecto se precargaba solo hasta el `loading.tsx`, que
       * es justo el esqueleto que se veía.
       *
       * Solo en móvil sin pedirlo: Next precarga al entrar el enlace en la
       * vista, y en escritorio esta barra es `display:none` y nunca entra.
       */}
      <Link
        href={href}
        prefetch
        onClick={alPulsar}
        aria-current={activa ? 'page' : undefined}
        className={clase}
      >
        <span
          onAnimationEnd={() => setSalta(false)}
          className={`relative flex h-6 w-6 items-center justify-center transition-transform duration-150 [&>svg]:h-[22px] [&>svg]:w-[22px] group-active:scale-90 ${
            salta ? 'pestana-salta' : ''
          }`}
        >
          {children}
          {insignia > 0 && (
            <span
              key={insignia}
              aria-label={`${insignia} sin leer`}
              className="insignia-entra absolute -right-2 -top-1 min-w-4 rounded-full bg-primary px-1 text-center font-sans text-[9px] font-semibold leading-4 text-primary-foreground ring-2 ring-[#191919]"
            >
              {insignia > 99 ? '99+' : insignia}
            </span>
          )}
        </span>
        {etiqueta}
      </Link>
    </li>
  );
}

/** Si el elemento es un campo donde se escribe: lo que abre el teclado. */
function esCampo(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(
      el.type,
    );
  }
  return false;
}

/**
 * Si hay un campo de texto con el foco: la señal de que el teclado está
 * abierto. Se mira el foco y no el alto de la ventana porque, con
 * `resizes-content`, el alto cambia también al girar el teléfono o al mostrar
 * la barra del navegador.
 */
function useEscribiendo(): boolean {
  /* Al montarse mira quién tiene ya el foco, por si se monta con un campo
     enfocado: arrancar en «no escribe» la dejaría encima del teclado hasta el
     siguiente cambio de foco. */
  const [escribiendo, setEscribiendo] = useState(
    () => typeof document !== 'undefined' && esCampo(document.activeElement),
  );
  useEffect(() => {
    setEscribiendo(esCampo(document.activeElement));
    const entra = (e: FocusEvent) => {
      if (esCampo(e.target)) setEscribiendo(true);
    };
    /* Al salir se mira quién tiene el foco un tick después, y no
       `relatedTarget`: es la respuesta directa a «¿sigue alguien escribiendo?»
       y no depende de que el navegador rellene el destino del foco. */
    let pendiente = 0;
    const sale = () => {
      window.clearTimeout(pendiente);
      pendiente = window.setTimeout(() => setEscribiendo(esCampo(document.activeElement)), 0);
    };
    /* En captura, para enterarse aunque algún componente detenga la
       propagación del evento. */
    document.addEventListener('focusin', entra, true);
    document.addEventListener('focusout', sale, true);
    return () => {
      document.removeEventListener('focusin', entra, true);
      document.removeEventListener('focusout', sale, true);
      window.clearTimeout(pendiente);
    };
  }, []);
  return escribiendo;
}

function IconoInicio({ relleno = false }: { relleno?: boolean }) {
  return (
    <svg
      fill={relleno ? 'currentColor' : 'none'}
      fillOpacity={relleno ? 0.18 : undefined}
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

function IconoChat({ relleno = false }: { relleno?: boolean }) {
  return (
    <svg
      fill={relleno ? 'currentColor' : 'none'}
      fillOpacity={relleno ? 0.18 : undefined}
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
function IconoPrax({ relleno = false }: { relleno?: boolean }) {
  return (
    <svg
      fill={relleno ? 'currentColor' : 'none'}
      fillOpacity={relleno ? 0.18 : undefined}
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

function IconoAvisos({ relleno = false }: { relleno?: boolean }) {
  return (
    <svg
      fill={relleno ? 'currentColor' : 'none'}
      fillOpacity={relleno ? 0.18 : undefined}
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
