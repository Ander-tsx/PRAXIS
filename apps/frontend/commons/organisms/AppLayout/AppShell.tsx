'use client';

import { Columns3, File, FolderBookmark, FolderKanban, FolderPlus, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createApiClient } from '../../api/client';
import type {
  AppNotification,
  DirectConversation,
  NotificationPage,
  ProjectChatSummary,
  UserProfile,
} from '../../api/domain';
import { personLabel } from '../../api/domain';
import type { Paginated } from '../../api/envelope';
import { avatarHref } from '../../api/presence';
import { Avatar } from '../../atoms/Avatar';
import { ProjectMonogram } from '../../atoms/ProjectMonogram';
import { EsMovilProvider } from '../../hooks/useEsMovil';
import {
  ABRIR_BANDEJA_EVENT,
  type AvisoLegible,
  describirAviso,
  destinoDeAviso,
} from '../../notifications/avisos';
import { presentarPersona } from '../../pwa/sinConexion';
import { LivePresences, LiveSource, useLiveEvent, useReconnection } from '../../realtime';
import { usePresence } from '../../realtime/presence';
import { useMessageCount } from '../../realtime/useMessageCount';
import { avisarDeAvisosLeidos, useNoticeCount } from '../../realtime/useNoticeCount';
import { alpha, colors } from '../../tokens';
import { BarraInferior, type PestanaInferior } from './BarraInferior';
import { BarraSuperior, TituloMovilProvider } from './BarraSuperior';
import {
  FilaDeAccion,
  NuevoContenidoEnLinea,
  NuevoEspacioEnLinea,
  NuevoProyectoEnLinea,
  type TipoDeEspacio,
} from './CrearEnLinea';
import { DirectorioDeChatsProvider, useDirectorioDeChats } from './DirectorioDeChats';
import { DockColumn, DockProvider } from './DockPanel';
import { FilaDeArbol } from './FilaDeArbol';
import { FranjaSinConexion } from './FranjaSinConexion';
import { AvisoActivarNotificaciones } from '../../pwa/AvisoActivarNotificaciones';
import { HapticoGlobal } from '../../pwa/HapticoGlobal';
import { PresenciaDePush } from '../../pwa/PresenciaDePush';
import { GestosMoviles } from './GestosMoviles';
import { NavList } from './NavList';
import { OrgSwitcher } from './OrgSwitcher';
import { PraxProvider } from './PraxWindow';
import {
  BuscadorDeBarra,
  Desplegable,
  MenuFlotante,
  RAIL_ACTIVA,
  RAIL_CELDA,
  RAIL_DIVISORIA,
  RAIL_ICONO,
  RAIL_REPOSO,
  RailTooltip,
  SIDEBAR_FILA,
  SIDEBAR_ICONO,
  SIDEBAR_INICIO,
  SidebarSection,
  claseDePopover,
  normalizarBusqueda,
  usePopover,
} from './SidebarPrimitives';
import type { AppNavItem } from './navigation';
import { instalarDetectorDeNavegacion } from './transicionDePantalla';

/**
 * Las tarjetas emergentes, **fuera de la carga inicial** (E6.5).
 *
 * ## Qué pesa y por qué
 *
 * `LiveNotices` usa `sileo` para las tarjetas, y `sileo` arrastra `motion`.
 * Medido sobre la compilación de producción de dashboard-front: el trozo que
 * lleva `motion` son **82 KB comprimidos de los 358 KB** de JavaScript de
 * cliente — un **23%**. Y entraba en las **seis** zonas privadas, porque este
 * armazón lo monta en todas.
 *
 * Eso es un cuarto del bundle de cada pantalla privada dedicado a animar unas
 * tarjetas que **solo aparecen cuando llega un evento**, y que nunca están en
 * pantalla al cargar.
 *
 * ## Lo que se pierde, dicho claro
 *
 * Diferirlo abre una ventana corta —desde que hidrata hasta que llega el
 * trozo— en la que un evento **no sacaría tarjeta**. Es asumible por una razón
 * concreta: la tarjeta no es el dato. El contador de la barra lateral, la lista
 * de conversaciones y el propio panel del chat escuchan el flujo **por su
 * cuenta**, así que un aviso en esa ventana se sigue viendo en todos los sitios
 * donde importa; lo único que no aparece es el emergente.
 *
 * `ssr: false` porque no hay nada que renderizar en el servidor: sin eventos, no
 * hay tarjetas.
 */
const LiveNotices = dynamic(() => import('../LiveNotices').then((modulo) => modulo.LiveNotices), {
  ssr: false,
});

export interface AppShellUser {
  /** Nombre para mostrar. Puede venir vacío: el registro no pide nombre. */
  name: string;
  email: string;
  /** Foto, ya con el proxy de la zona delante (`avatarHref`). */
  avatarSrc?: string | null;
  /** Presencia elegida. Pinta el punto de color sobre el avatar. */
  presence?: string | null;
}

export interface AppShellProps {
  navItems: AppNavItem[];
  /**
   * Ruta pública de la zona (`/dashboard`, `/projects`).
   *
   * ⚠️ Hace falta porque `usePathname()` devuelve la ruta **sin el basePath**:
   * dentro de dashboard-front, `/dashboard/notifications` llega como
   * `/notifications`, y los enlaces de la barra lateral son rutas del shell.
   * La zona sabe cuál es su prefijo; este componente no.
   */
  zonePath: string;
  user: AppShellUser;
  /**
   * El selector de estado, **dibujado sobre la esquina del avatar**.
   *
   * ⚠️ Este hueco fue antes el pie de la barra: primero con «Cerrar sesión»
   * —que se movió a la pantalla de cuenta— y luego con una fila que repetía el
   * estado con su etiqueta. La fila sobraba, porque el punto del avatar ya lo
   * decía; ahora ese punto **es** el botón, y esto es lo que se pinta encima.
   *
   * Lo pone la zona porque la escritura va por su propio proxy: ver
   * `PresenceFooter`.
   */
  estadoSlot?: ReactNode;
  /**
   * Si la barra sale plegada, **resuelto en el servidor**.
   *
   * Lo lee el `layout.tsx` de la zona con `getSidebarPlegada()`. Va por props y
   * no se lee aquí porque este componente es de cliente y la cookie hay que
   * conocerla **antes** de pintar: si se leyera al hidratar, la barra saldría
   * desplegada y se plegaría a la vista en cada navegación.
   */
  plegadaInicial?: boolean;
  /**
   * El ancho de la barra desplegada, en píxeles, **resuelto en el servidor**
   * con `getSidebarAncho()` por lo mismo que `plegadaInicial`. Lo cambia la
   * persona arrastrando el borde derecho.
   */
  anchoInicial?: number;
  /**
   * Si la primera pintura va para un móvil, **adivinado en el servidor** con
   * `getEsMovilInicial()`. Lo leen los componentes con `useEsMovil()`, que lo
   * corrigen con el ancho real. Ver `docs/PLAN-MOVIL.md`, D2.
   */
  movilInicial?: boolean;
  /**
   * Con qué pestaña sale la barra —Inicio, Chat o Bandeja—, **resuelto en el
   * servidor**, exactamente por lo mismo que `plegadaInicial`.
   *
   * Lo lee el `layout.tsx` con `getSidebarTab()`. 🔴 Antes salía de
   * `localStorage` **dentro del inicializador de `useState`**, y eso rompía la
   * hidratación en cada carga: el servidor no tiene `window`, así que pintaba
   * «Inicio», y el cliente leía la preferencia y pintaba otra. React lo avisaba
   * por consola y no lo parcheaba — los `aria-selected` se quedaban con los del
   * servidor, anunciando una pestaña distinta de la que se veía. El porqué
   * entero, en `commons/theme/sidebar.ts`.
   */
  pestanaInicial?: SidebarTab;
  /**
   * Las organizaciones a las que perteneces, y cuál estás mirando.
   *
   * ⚠️ **Lo resuelve el `layout.tsx` de la zona**, igual que `plegadaInicial`:
   * la organización activa vive en una cookie y hay que conocerla **antes** de
   * pintar, o la lista de proyectos sale entera y se recorta tras hidratar.
   *
   * Ausente, el selector se comporta como antes: enseña el espacio de quien
   * mira y no ofrece cambiar. Es lo que pasa en las zonas que todavía no lo
   * pasan, y no rompe nada.
   */
  organizaciones?: OrgDelSelector[];
  organizacionActivaId?: string | null;
  /**
   * Las dos insignias de las pestañas, **sembradas por el servidor**.
   *
   * ⚠️ Estaban dentro de `navItems`, emparejadas por `href` contra dos entradas
   * de menú (`/chat` y la bandeja) que `ac4caf1` borró al mudarlas a pestañas.
   * El emparejamiento dejó de casar, y como es una comparación de cadenas no dio
   * ningún error: los números se seguían calculando en el servidor y no los
   * pintaba nadie. Ahora llegan como lo que son —dos contadores del armazón— y
   * `useMessageCount` / `useNoticeCount` los mantienen vivos desde aquí.
   *
   * Ausentes, valen cero: una zona que todavía no los pase enseña las pestañas
   * sin insignia, que es una degradación y no un fallo.
   */
  mensajesSinLeer?: number;
  avisosSinLeer?: number;
  /** El panel de perfil de la barra. Lo compone el `layout.tsx` (vive en `web`). */
  perfilSlot?: ReactNode;
  children: ReactNode;
}

/** Lo poco que el selector necesita saber de una organización. */
export interface OrgDelSelector {
  id: string;
  name: string | null;
  /** `PERSONAL` se dibuja distinto: es tu espacio, no un equipo. */
  kind: 'PERSONAL' | 'ENTERPRISE';
  tier: string;
  soyDueno: boolean;
  /**
   * Identidad visual, del modal de configuración. `null` = monograma de letras.
   * `iconKey` es un icono de `lucide-react` de la lista curada; `color`, un
   * `#rrggbb`.
   */
  iconKey?: string | null;
  color?: string | null;
  /** Imagen subida (ruta relativa al gateway). Gana al icono. */
  imageUrl?: string | null;
}

/**
 * Armazón del área privada: barra lateral, cajón móvil y columna de contenido.
 *
 * **Va en el `layout.tsx` de la zona, no en cada page**, y ese es todo el
 * motivo por el que existe separado de la cabecera. Cuando el armazón vivía
 * dentro de cada página, navegar entre pantallas de la misma zona lo desmontaba
 * y el `loading.tsx` pintaba una barra lateral de esqueletos: parpadeaban los
 * enlaces, el nombre y el correo de quien ya estaba identificado y hasta el
 * botón de cerrar sesión. Nada de eso cambia entre pantallas.
 *
 * En el layout, Next lo conserva entre navegaciones del mismo segmento: la barra
 * lateral no se vuelve a renderizar ni se vuelve a pedir su contador, y el
 * `loading.tsx` solo cubre lo que de verdad está cargando.
 *
 * El botón del menú móvil vive en la cabecera, que es otro componente y otra
 * parte del árbol, así que la apertura del cajón viaja por contexto. Es la única
 * pieza de estado que cruza esa frontera.
 */
const AppShellContext = createContext<{
  plegada: boolean;
  /** La organización activa ya resuelta, para lo que el armazón presta fuera. */
  organizacionActivaId: string | null;
  /**
   * Lo que pinta la pantalla «Tú» en móvil (`/main/me`): el perfil, las
   * organizaciones y los ajustes. Ya lo tiene el armazón —lo usa la barra
   * lateral de escritorio— y así esa pantalla no vuelve a pedirlo.
   */
  datosDeTu: {
    user: AppShellUser;
    perfilSlot: ReactNode;
    organizaciones: OrgDelSelector[];
    navItems: AppNavItem[];
  };
} | null>(null);

/** Lo que pinta la pantalla «Tú» de móvil. Ver `datosDeTu` en el contexto. */
export function useDatosDeTu() {
  const contexto = useContext(AppShellContext);
  return contexto
    ? { ...contexto.datosDeTu, organizacionActivaId: contexto.organizacionActivaId }
    : null;
}

/** El estado del armazón para lo que se pinta dentro (hoy, si la barra está plegada). */
export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell solo funciona dentro de <AppShell>');
  }
  return context;
}

/**
 * Si la barra está plegada, para lo que se pinta **dentro** de ella.
 *
 * Existe para el pie —hoy «Cerrar sesión»—, que llega como slot desde el
 * `layout.tsx` de cada zona: el armazón no puede recortarle el texto sin saber
 * qué hay dentro, y pasarle una prop obligaría a que las cuatro zonas se
 * enteraran de un detalle que no es suyo. Por contexto se entera solo quien lo
 * necesita.
 *
 * Devuelve `false` fuera del armazón en vez de reventar: un botón usado suelto
 * en otra pantalla se pinta entero, que es lo correcto ahí.
 */
export function useSidebarPlegada(): boolean {
  return useContext(AppShellContext)?.plegada ?? false;
}

/**
 * La cookie que recuerda el pliegue. Espejo de `commons/theme/sidebar.ts`.
 *
 * ⚠️ Se repite el nombre aquí en vez de importarlo porque aquel es un **módulo
 * de servidor** —usa `next/headers`— y este componente es de cliente. Importarlo
 * arrastraría `next/headers` al navegador, que es el error que documenta el
 * índice de `theme/`. Si cambia allí, cambia aquí.
 */
const SIDEBAR_COOKIE = 'praxis_sidebar';

/**
 * El ancho de la barra, y sus límites. Espejo de `commons/theme/sidebar.ts`,
 * repetido por el mismo motivo que la cookie de arriba.
 *
 * Por debajo de `SIDEBAR_PLIEGUE_UMBRAL` al arrastrar, la barra **se pliega**
 * en vez de seguir estrechándose: una barra de 150 px no cabe ni el nombre de
 * un proyecto, y la plegada ya existe para eso.
 */
const SIDEBAR_WIDTH_COOKIE = 'praxis_sidebar_width';
const SIDEBAR_ANCHO_POR_DEFECTO = 320;
const SIDEBAR_ANCHO_MIN = 220;
const SIDEBAR_ANCHO_MAX = 520;
const SIDEBAR_PLIEGUE_UMBRAL = 160;
/* La de la pestaña, espejo de `SIDEBAR_TAB_COOKIE` en `commons/theme/sidebar.ts`
   y repetida aquí por lo mismo que la de arriba: aquel es módulo de servidor. */
const SIDEBAR_TAB_COOKIE = 'praxis_sidebar_tab';
const UN_ANO = 60 * 60 * 24 * 365;

/**
 * Dónde vive la pantalla de la cuenta.
 *
 * Ruta absoluta, que desde F8 es lo normal: hay una sola aplicación y todas las
 * secciones cuelgan de la raíz. Antes era absoluta **por obligación** —la
 * pantalla la servía `dashboard-front` y esta barra la pintaban las seis zonas,
 * así que había que salir de la zona con un `<a>` duro— y eso es exactamente la
 * recarga completa que la fusión viene a quitar.
 */
/* 🚫 `/main/profile` ya no existe: el perfil es un panel de esta barra (`perfilSlot`). */

/*
 * 🕳️ Aquí estaba `HREF_DE_MENSAJES = '/chat'`, espejo del `CHAT_HREF` de
 * `commons/auth/nav.ts`.
 *
 * Los dos servían para emparejar una insignia con una entrada de menú **que ya
 * no existe**: el directorio de chats es una pestaña de esta misma barra desde
 * `ac4caf1`. Las insignias llegan ahora como props (`mensajesSinLeer`,
 * `avisosSinLeer`) y se pintan sobre su pestaña.
 */

/**
 * El armazón, con las dos fuentes de tiempo real montadas por encima.
 *
 * ⚠️ **La separación en dos componentes no es estética: sin ella, los hooks del
 * propio armazón no ven el contexto.**
 *
 * `LiveSource` y `LivePresences` son proveedores, y un componente que
 * *renderiza* un proveedor está **por encima** de él en el árbol: su
 * `useContext` devuelve el valor por defecto, no el del proveedor. Con todo
 * junto en una sola función, `useMessageCount` —que vive aquí, para la
 * insignia de la barra lateral— se suscribía a una fuente que desde su punto de
 * vista **no existía**.
 *
 * Y no daba ningún error, porque `useLiveEvent` está escrito para no lanzar
 * cuando no encuentra la fuente: quedarse sin tiempo real es una degradación
 * aceptable en una pantalla suelta. Esa tolerancia, pensada para otro caso,
 * convirtió esto en un fallo mudo — la insignia sencillamente no se movía.
 *
 * Partiéndolo, todo lo que necesite escuchar el flujo vive en `ArmazonInterno`,
 * que sí es descendiente.
 */
export function AppShell(props: AppShellProps) {
  return (
    <EsMovilProvider inicial={props.movilInicial ?? false}>
      <LiveSource gatewayPath={`${props.zonePath}/api/gateway`}>
        {/* Por encima de todo lo que pinte un avatar: el punto de estado de
          cualquier persona se corrige solo desde aquí. */}
        <LivePresences>
          {/* El directorio de conversaciones, **una sola vez para las dos barras**.
            Dentro de `LiveSource` porque se suscribe al flujo; por encima del
            armazón porque lo leen el `<aside>` de escritorio y el cajón móvil, y
            en un teléfono los dos están montados a la vez. Ver
            `DirectorioDeChatsProvider`. */}
          <DirectorioDeChatsProvider gatewayPath={`${props.zonePath}/api/gateway`}>
            {/* El cajón lateral, por encima del armazón: la columna la pinta él y
              el contenido lo proyecta la página, así que el proveedor tiene que
              envolver a los dos. Ver `DockPanel`. */}
            <DockProvider>
              {/* PRAX global: el lanzador de la cabecera y el minichat (flotante o
              acoplado). Dentro de `DockProvider` porque el modo acoplado usa su
              columna. Ver `PraxWindow`. */}
              <PraxProvider
                zonePath={props.zonePath}
                organizacionActivaId={props.organizacionActivaId ?? null}
              >
                <TituloMovilProvider>
                  <ArmazonInterno {...props} />
                </TituloMovilProvider>
              </PraxProvider>
            </DockProvider>
          </DirectorioDeChatsProvider>
        </LivePresences>
      </LiveSource>
    </EsMovilProvider>
  );
}

function ArmazonInterno({
  navItems,
  zonePath,
  user,
  estadoSlot,
  plegadaInicial = false,
  anchoInicial = SIDEBAR_ANCHO_POR_DEFECTO,
  pestanaInicial = 'home',
  organizaciones,
  organizacionActivaId,
  mensajesSinLeer: mensajesIniciales = 0,
  avisosSinLeer: avisosIniciales = 0,
  perfilSlot,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const browserPath = zonePath + (pathname === '/' ? '' : pathname);

  /* Móvil: hacia dónde va cada navegación, para la entrada de la pantalla. */
  useEffect(() => {
    instalarDetectorDeNavegacion();
  }, []);
  /* iOS, PWA instalada: el WebView arranca con la ventana **más corta que la
     pantalla** —medido en un iPhone: `innerHeight` 793 frente a `screen.height`
     852, justo la zona segura de arriba— y deja una franja negra abajo con la
     barra inferior «elevada». Un scroll lo corrige, pero aquí no hay documento
     que desplazar. Se mide la diferencia y se publica en `--desfase-inferior`
     (negativa: empuja hacia abajo lo que va pegado al borde). Si el WebView se
     corrige solo, `resize` la devuelve a 0. Con un campo enfocado no se mide: el
     teclado también encoge la ventana y no es este fallo. */
  useEffect(() => {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    const raiz = document.documentElement;
    const medir = () => {
      const activo = document.activeElement;
      const escribiendo =
        activo instanceof HTMLElement &&
        (activo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName));
      if (escribiendo) return;
      const vertical = window.matchMedia('(orientation: portrait)').matches;
      const falta = window.screen.height - window.innerHeight;
      raiz.style.setProperty(
        '--desfase-inferior',
        vertical && falta > 8 && falta <= 80 ? `${-falta}px` : '0px',
      );
    };
    medir();
    const id = window.setTimeout(medir, 400);
    window.addEventListener('resize', medir);
    window.addEventListener('orientationchange', medir);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', medir);
      window.removeEventListener('orientationchange', medir);
      raiz.style.removeProperty('--desfase-inferior');
    };
  }, []);
  /* Sin conexión: el SW guarda las pantallas por persona y no sabe quién es
     (la cookie es httpOnly); se lo dice esto. Ver `commons/pwa`. */
  useEffect(() => {
    presentarPersona(user.email).catch(() => undefined);
  }, [user.email]);
  const router = useRouter();
  /**
   * 🔴 **Determinista: la ruta y una prop, nada del navegador.**
   *
   * Aquí había un `typeof window !== 'undefined'` leyendo `localStorage`, que es
   * el primer punto de la lista que imprime React cuando el árbol no cuadra al
   * hidratar. El servidor devolvía siempre `'home'` y el cliente la preferencia
   * guardada, así que el primer render ya discrepaba. React **no lo parchea**:
   * el `aria-selected` de los `<button role="tab">` se quedaba con el del
   * servidor, o sea que un lector de pantalla anunciaba seleccionada una
   * pestaña distinta de la que estaba a la vista.
   *
   * La preferencia llega ahora en `pestanaInicial`, que el `layout.tsx` saca de
   * una cookie **antes** de pintar — el mismo camino que `plegadaInicial` y por
   * el mismo motivo. Ver `commons/theme/sidebar.ts`.
   *
   * ⚠️ **La ruta manda sobre la preferencia**, y por eso va primero: estando en
   * `/chat` la barra tiene que enseñar Chat aunque la cookie diga Bandeja.
   */
  const [activeTab, setActiveTab] = useState<SidebarTab>(() => {
    if (zonePath === '/chat' || browserPath.startsWith('/chat')) return 'chat';
    /* Lo mismo para Configuraciones: estando en Equipo o en Administración la
       barra enseña dónde estás. Se compara contra la lista canónica, no contra
       rutas escritas a mano. */
    const enConfiguracion = navItems.some(
      (i) =>
        esDeConfiguracion(i.href) &&
        !i.disabled &&
        (browserPath === i.href || browserPath.startsWith(`${i.href}/`)),
    );
    return enConfiguracion ? 'settings' : pestanaInicial;
  });
  /** La bandeja: un popover junto al avatar, ya no una pestaña. */
  const [bandejaAbierta, setBandejaAbierta] = useState(false);
  /** El perfil, dentro de la barra: ocupa el hueco bajo las pestañas. */
  const [perfilAbierto, setPerfilAbierto] = useState(false);

  /* Se escribe desde el cliente, igual que la del pliegue: es una preferencia,
     no una credencial, y así el cambio vale ya para la siguiente navegación. */
  useEffect(() => {
    document.cookie = `${SIDEBAR_TAB_COOKIE}=${activeTab}; path=/; max-age=${UN_ANO}; samesite=lax`;
  }, [activeTab]);

  /**
   * Abrir la bandeja desde fuera del armazón.
   *
   * ⚠️ **La bandeja ya no tiene URL.** Cuando era una pantalla, la tarjeta de un
   * aviso de automatización navegaba a `/main#avisos`; al pasar a pestaña, ese
   * destino se quedó apuntando a una ruta que hoy redirige a la lista de
   * proyectos. Ver `destinoDeAviso`.
   *
   * En móvil la bandeja es la pantalla «Avisos» (`/main/notifications`) de la
   * barra inferior.
   */
  useEffect(() => {
    function abrir() {
      if (window.matchMedia('(max-width: 767px)').matches) router.push('/main/notifications');
      else setBandejaAbierta(true);
    }
    window.addEventListener(ABRIR_BANDEJA_EVENT, abrir);
    return () => window.removeEventListener(ABRIR_BANDEJA_EVENT, abrir);
  }, [router]);
  /**
   * ⚠️ **El estado nace de la cookie que ya leyó el servidor**, no de un efecto.
   *
   * Estaba en `localStorage` y se leía tras hidratar, así que el servidor
   * siempre servía la barra desplegada y el cliente la plegaba un instante
   * después. En Multi-Zones **cada cambio de zona es una carga completa**, así
   * que ese parpadeo salía en cada navegación. Con la cookie, el HTML ya viene
   * con el ancho correcto y no hay nada que corregir.
   */
  const [plegada, setPlegada] = useState(plegadaInicial);
  /* Para el tooltip del rail: escucha en la barra entera. Ver `RailTooltip`. */
  const barraRef = useRef<HTMLElement>(null);

  function fijarPliegue(siguiente: boolean) {
    setPlegada(siguiente);
    /* Se escribe desde el cliente: no hace falta una Server Action para una
       preferencia de tamaño, y así el cambio es inmediato. `path=/` para que
       las cinco zonas la vean — sin eso, plegarla aquí no la pliega allí. */
    document.cookie = `${SIDEBAR_COOKIE}=${siguiente ? '1' : '0'}; path=/; max-age=${UN_ANO}; samesite=lax`;
  }

  function alternarPliegue() {
    fijarPliegue(!plegada);
  }

  const [ancho, setAncho] = useState(anchoInicial);
  /* Mientras se arrastra, sin la transición de `width`: con ella, la barra va
     200 ms por detrás del puntero y el gesto se siente de goma. */
  const [redimensionando, setRedimensionando] = useState(false);

  function guardarAncho(valor: number) {
    document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${valor}; path=/; max-age=${UN_ANO}; samesite=lax`;
  }

  /**
   * Arrastrar el borde derecho de la barra.
   *
   * El ancho se calcula contra el borde izquierdo de la propia barra, no con
   * deltas acumulados: así no deriva si un `pointermove` se pierde. Plegada,
   * arrastrar hacia fuera la despliega — es el mismo gesto al revés.
   */
  function empezarRedimension(evento: ReactPointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return;
    evento.preventDefault();
    const asa = evento.currentTarget;
    const origen = asa.parentElement?.getBoundingClientRect().left ?? 0;
    asa.setPointerCapture(evento.pointerId);
    setRedimensionando(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let plegadaAhora = plegada;
    let ultimo = ancho;

    const mover = (e: PointerEvent) => {
      const deseado = e.clientX - origen;
      if (deseado < SIDEBAR_PLIEGUE_UMBRAL) {
        if (!plegadaAhora) {
          plegadaAhora = true;
          fijarPliegue(true);
        }
        return;
      }
      if (plegadaAhora) {
        plegadaAhora = false;
        fijarPliegue(false);
      }
      ultimo = Math.min(SIDEBAR_ANCHO_MAX, Math.max(SIDEBAR_ANCHO_MIN, Math.round(deseado)));
      setAncho(ultimo);
    };
    const soltar = () => {
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', soltar);
      asa.removeEventListener('pointercancel', soltar);
      setRedimensionando(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      guardarAncho(ultimo);
    };
    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
  }

  /* Teclado: el asa es un separador enfocable y las flechas la mueven. */
  function redimensionarConTeclado(evento: ReactKeyboardEvent<HTMLDivElement>) {
    const paso = evento.shiftKey ? 48 : 16;
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
    evento.preventDefault();
    if (plegada) {
      if (evento.key === 'ArrowRight') fijarPliegue(false);
      return;
    }
    const deseado = ancho + (evento.key === 'ArrowRight' ? paso : -paso);
    if (deseado < SIDEBAR_ANCHO_MIN) {
      fijarPliegue(true);
      return;
    }
    const siguiente = Math.min(SIDEBAR_ANCHO_MAX, deseado);
    setAncho(siguiente);
    guardarAncho(siguiente);
  }

  function restaurarAncho() {
    setAncho(SIDEBAR_ANCHO_POR_DEFECTO);
    guardarAncho(SIDEBAR_ANCHO_POR_DEFECTO);
    if (plegada) fijarPliegue(false);
  }

  /* `/` es la raíz de la zona: su ruta pública es el prefijo a secas. */
  const activePath = pathname === '/' ? zonePath : `${zonePath}${pathname}`;

  /**
   * ¿Estás en tu cuenta?
   *
   * ⚠️ **Sin esto, la barra marcaba «Panel».** `activeHrefOf` resuelve por
   * prefijo, y `/dashboard/profile` empieza por `/dashboard`, que es el href de
   * Panel: la sección más específica gana, pero la cuenta **no es una sección**
   * y no tiene entrada propia con la que competir. Se resuelve dejando la lista
   * sin nada activo y marcando la ficha de usuario, que es de donde se viene.
   */
  const enCuenta = perfilAbierto;

  /* Móvil: qué pestaña de abajo se marca. Lo que cuelga de «Tú» (equipo,
     facturación…) la deja marcada: es de donde se viene. */
  const pestanaInferior: PestanaInferior | null = browserPath.startsWith('/chat')
    ? 'chat'
    : browserPath.startsWith('/assistant')
      ? 'prax'
      : browserPath.startsWith('/projects')
        ? 'inicio'
        : browserPath.startsWith('/main/notifications')
          ? 'avisos'
          : browserPath.startsWith('/main') ||
              browserPath.startsWith('/admin') ||
              browserPath.startsWith('/ayuda')
            ? 'tu'
            : null;
  const activePathDeSecciones = activePath;
  /**
   * 🔴 **Con la consulta, para el árbol de proyectos.** `usePathname()` no la
   * trae, y el árbol marca espacio, tablero y documento activos mirando
   * `ws=`, `board=` y `doc=` — así que nada se marcaba nunca. Solo el árbol la
   * recibe: `NavList` compara rutas exactas y con `?…` pegado dejaría de casar.
   */
  const consulta = searchParams.toString();
  const activePathConConsulta = activePathDeSecciones
    ? activePathDeSecciones + (consulta ? `?${consulta}` : '')
    : '';

  /**
   * Las dos insignias de las pestañas, **vivas**.
   *
   * ⚠️ El número que sirve el servidor solo cambiaba al recargar: lo que lo
   * actualizaba era el `router.refresh()` por evento, que se quitó al desatascar
   * la cola del App Router. Se quedó sin fuente — sonaba el aviso y el número no
   * se movía. Ahora las dos escuchan el flujo; ver `useMessageCount` y
   * `useNoticeCount`.
   *
   * Y ahora se **pintan**, que es la otra mitad: se emparejaban por `href`
   * contra entradas de menú que ya no existen. Ver la prop.
   */
  const mensajesSinLeer = useMessageCount(mensajesIniciales, `${zonePath}/api/gateway`);
  const avisosSinLeer = useNoticeCount(avisosIniciales, `${zonePath}/api/gateway`);

  return (
    <AppShellContext.Provider
      value={{
        plegada,
        organizacionActivaId: organizacionActivaId ?? null,
        datosDeTu: {
          user,
          perfilSlot,
          organizaciones: organizaciones ?? [],
          navItems: navItems.filter((i) => esDeConfiguracion(i.href)),
        },
      }}
    >
      {/**
       * ⚠️ **`h-dvh` y no `h-screen`.**
       *
       * `h-screen` es `100vh`, que en un móvil mide la ventana **con la barra de
       * direcciones retraída** — o sea más alto de lo que se ve. Con
       * `overflow-hidden` aquí, lo que sobresale por abajo no se puede
       * desplazar: en el chat, el compositor se quedaba debajo del borde de la
       * pantalla y no había forma de llegar a él.
       *
       * `dvh` es la unidad dinámica: mide lo que se ve ahora, y se recalcula
       * cuando la barra del navegador aparece o desaparece.
       */}
      <div className="flex h-dvh overflow-hidden max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:bottom-[var(--desfase-inferior,0px)] max-md:h-auto bg-surface font-sans text-text-primary">
        {/* ── Barra lateral (escritorio) ───────────────────────── */}
        <aside
          ref={barraRef}
          className={`relative hidden shrink-0 flex-col border-r border-border bg-surface-2 md:flex ${
            redimensionando ? '' : 'transition-[width] duration-200 motion-reduce:transition-none'
          } ${plegada ? 'w-[4.5rem]' : ''}`}
          style={plegada ? undefined : { width: ancho }}
        >
          <RailTooltip contenedor={barraRef} activo={plegada} />
          {/* ⚠️ Selector y pestañas **fuera** del scroll: solo se desplaza el contenido de la pestaña. */}
          <div className={`flex min-h-0 flex-1 flex-col pt-2 ${plegada ? 'px-2' : 'px-4'}`}>
            <div
              className={
                plegada
                  ? 'flex shrink-0 flex-col items-center gap-1'
                  : 'relative mb-4 min-h-[52px] shrink-0'
              }
            >
              <div className={plegada ? undefined : 'min-w-0'}>
                <OrgSwitcher
                  name={user.name}
                  plegada={plegada}
                  organizaciones={organizaciones}
                  activaId={organizacionActivaId ?? null}
                  zonePath={zonePath}
                  controlLateral={<span aria-hidden="true" className="w-7 shrink-0" />}
                />
              </div>
              <div className={plegada ? undefined : 'absolute right-0 top-3'}>
                <BotonDePliegue plegada={plegada} onClick={alternarPliegue} />
              </div>
            </div>
            {plegada && <div className={RAIL_DIVISORIA} />}

            {/**
             * ⚠️ **Plegada también hay pestañas, solo que en columna.**
             *
             * Estaban tras un `{!plegada && …}` mientras que el **contenido** de
             * la pestaña activa se seguía pintando. O sea: si la dejabas en
             * «Chat» y plegabas la barra, veías una columna de avatares sin
             * ninguna forma de volver a «Inicio». Un control que desaparece
             * dejando puesto lo que controlaba.
             */}
            <SidebarTabs
              activa={activeTab}
              onCambiar={(t) => {
                setActiveTab(t);
                setPerfilAbierto(false);
              }}
              mensajesSinLeer={mensajesSinLeer}
              plegada={plegada}
              /* Solo en el ancho mínimo, justo antes de plegarse. Entre el
                 mínimo y el ancho en que caben las tres, las que no están
                 puestas se encogen con «…» en vez de saltar a icono. */
              compacta={ancho <= SIDEBAR_ANCHO_MIN}
            />
            {plegada && <div className={RAIL_DIVISORIA} />}
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto pb-6">
              {/**
               * 🔴 **Las tres pestañas se montan siempre; se esconden con CSS.**
               *
               * Estaban tras `{activeTab === '…' && …}`, así que la que no se
               * mira **no existe en el árbol**. Y estas listas no son pantallas:
               * son suscripciones. Desmontadas,
               *
               * - `SidebarChatList` pierde sus `useLiveEvent('chat.mensaje')` y
               *   `('chat.leido')`, así que las burbujas por conversación no se
               *   acumulan mientras no la mires: al volver se pide todo de cero y
               *   se ve un esqueleto;
               * - se pierde también el buscador escrito y la posición del
               *   desplazamiento, en cada ida y vuelta.
               *
               * `hidden` de Tailwind es `display:none`, que saca el panel del
               * flujo y del foco por teclado sin desmontar nada. Es la diferencia
               * entre esconder una lista y tirarla.
               *
               * ⚠️ **Sí paga el coste de mantenerlas vivas**, que es justo lo que
               * se quiere: son tres suscripciones al mismo `EventSource` que ya
               * está abierto, no tres conexiones.
               */}
              <div className={activeTab === 'home' ? 'flex flex-col gap-3' : 'hidden'}>
                <SidebarProjectsTree
                  zonePath={zonePath}
                  plegada={plegada}
                  activePath={activePathConConsulta}
                  organizacionActivaId={organizacionActivaId ?? null}
                  onDesplegar={() => fijarPliegue(false)}
                />
                <div
                  className={plegada ? 'flex flex-col items-center' : 'border-t border-border pt-3'}
                >
                  {plegada && <div className={`${RAIL_DIVISORIA} mt-0`} />}
                  <NavList
                    navItems={navItems.filter((i) => i.href === '/assistant')}
                    sinEtiquetas
                    activePath={activePathDeSecciones}
                    plegada={plegada}
                  />
                </div>
              </div>
              <div className={activeTab === 'chat' ? undefined : 'hidden'}>
                <SidebarChatList zonePath={zonePath} plegada={plegada} />
              </div>
              <div className={activeTab === 'settings' ? undefined : 'hidden'}>
                <SidebarSettingsList
                  navItems={navItems.filter((i) => esDeConfiguracion(i.href))}
                  activePath={activePathDeSecciones}
                  plegada={plegada}
                />
              </div>
            </div>
          </div>

          <div className={`relative border-t border-border ${plegada ? 'px-2 py-2' : 'p-4'}`}>
            {/* Plegada, la tarjeta de usuario se queda en el avatar: el nombre y
                el correo no caben, y el avatar ya identifica de quién es la
                sesión, que es lo que esa tarjeta viene a decir. */}
            {plegada ? (
              /* Plegada, el enlace y el selector siguen siendo hermanos por lo
                 mismo que desplegada: un botón dentro de un enlace no vale.
                 Campana arriba y tú abajo del todo, las dos en celda de rail:
                 eras lo más grande de la columna (40 px) sin ser lo más
                 importante. */
              <div className="flex flex-col items-center gap-1">
                <BandejaBoton
                  abierta={bandejaAbierta}
                  onCambiar={setBandejaAbierta}
                  sinLeer={avisosSinLeer}
                  zonePath={zonePath}
                  plegada
                />
                <PerfilFlotante
                  plegada
                  abierto={perfilAbierto}
                  onCambiar={setPerfilAbierto}
                  contenido={perfilSlot}
                  className={`${RAIL_CELDA} ${enCuenta ? RAIL_ACTIVA : RAIL_REPOSO}`}
                >
                  <button
                    type="button"
                    onClick={() => setPerfilAbierto((v) => !v)}
                    aria-pressed={enCuenta}
                    aria-label={`${user.name.trim() || user.email} — tu perfil`}
                    data-rail-tip={user.name.trim() || user.email}
                    className="block rounded-full"
                  >
                    {/* Sin `presence`: el punto lo pinta `estadoSlot`, que
                        además se puede presionar. Ver el aviso de esa prop. */}
                    <Avatar
                      label={user.name.trim() || user.email}
                      mine
                      size="base"
                      src={user.avatarSrc ?? null}
                    />
                  </button>
                  {estadoSlot && (
                    <span className="absolute bottom-0.5 right-0.5">{estadoSlot}</span>
                  )}
                </PerfilFlotante>
              </div>
            ) : (
              <div className="flex items-stretch gap-1">
                <PerfilFlotante
                  abierto={perfilAbierto}
                  onCambiar={setPerfilAbierto}
                  contenido={perfilSlot}
                  className="min-w-0 flex-1"
                >
                  <UserCard
                    user={user}
                    activa={enCuenta}
                    estadoSlot={estadoSlot}
                    onAbrir={() => setPerfilAbierto((v) => !v)}
                  />
                </PerfilFlotante>
                {/* Solo el icono, a un lado del avatar: es la sección de avisos. */}
                <BandejaBoton
                  abierta={bandejaAbierta}
                  onCambiar={setBandejaAbierta}
                  sinLeer={avisosSinLeer}
                  zonePath={zonePath}
                />
              </div>
            )}
          </div>

          {/* El asa de redimensionar: una franja de 6 px sobre el borde derecho,
              invisible hasta pasar por encima. Doble clic vuelve al ancho de
              siempre. Solo existe en escritorio, porque la barra también. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar la barra lateral"
            aria-valuemin={SIDEBAR_ANCHO_MIN}
            aria-valuemax={SIDEBAR_ANCHO_MAX}
            aria-valuenow={plegada ? SIDEBAR_ANCHO_MIN : ancho}
            tabIndex={0}
            title="Arrastra para cambiar el ancho · doble clic para restaurarlo"
            onPointerDown={empezarRedimension}
            onKeyDown={redimensionarConTeclado}
            onDoubleClick={restaurarAncho}
            className={`absolute inset-y-0 -right-[3px] z-20 w-1.5 cursor-col-resize transition-colors hover:bg-primary/50 focus-visible:bg-primary/60 focus-visible:outline-none ${
              redimensionando ? 'bg-primary/60' : ''
            }`}
          />
        </aside>

        {/* ── Contenido ────────────────────────────────────────── */}
        {/* En móvil reserva abajo lo que tape: la barra inferior (que publica su
            alto en `--barra-inferior`) o el teclado de iOS (`--teclado`, ver
            `GestosMoviles`), el mayor de los dos. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden max-md:pb-[max(var(--barra-inferior,0px),var(--teclado,0px))]">
          {/* Móvil: el título de la pantalla, en todas (M8 de docs/PLAN-MOVIL.md). */}
          <BarraSuperior />
          {children}
        </div>

        {/**
         * El cajón lateral, **hermano del contenido y no encima de él**.
         *
         * Al ser una columna más de esta misma fila flex, abrirlo recoloca lo de
         * al lado porque es lo que hace un `flex` — no porque nadie le haya
         * sumado un margen al `body`. Cerrado mide cero y **conserva dentro lo
         * que hubiera montado**, que es lo que permite cerrar el panel de PRAX,
         * mirar un gráfico y volver sin perder la conversación.
         *
         * Va después del contenido en el DOM y no antes: el orden de lectura de
         * un lector de pantalla es el del documento, y un panel accesorio se lee
         * después de aquello a lo que acompaña.
         */}
        <DockColumn />

        {/**
         * Los avisos en vivo se enganchan aquí, en el armazón, y no en cada
         * zona: el armazón vive en el `layout.tsx`, así que la conexión se abre
         * una vez y **sobrevive a navegar** entre pantallas de la zona. Puesto
         * en una page, cada navegación la cerraría y volvería a abrir.
         *
         * La ruta del proxy sale de `zonePath`, que la zona ya nos da: en
         * projects-front es `/projects/api/gateway`, y ahí es donde esa zona
         * monta su `createGatewayProxy()`.
         */}
        <LiveNotices />

        {/**
         * ── Móvil: barra inferior y gestos ──────────────────────────
         *
         * Sustituyen a la hamburguesa flotante y al cajón a pantalla completa
         * que había aquí (D7 de `docs/PLAN-MOVIL.md`). Avisos y Tú fueron hojas
         * hasta M8; ahora son pantallas, como las otras tres pestañas.
         *
         * Todo es `md:hidden`: en escritorio no se pinta nada de esto (I1).
         */}
        <GestosMoviles />
        <HapticoGlobal />
        <PresenciaDePush />
        <AvisoActivarNotificaciones />
        <FranjaSinConexion />
        <BarraInferior
          activa={pestanaInferior}
          mensajesSinLeer={mensajesSinLeer}
          avisosSinLeer={avisosSinLeer}
          usuario={user}
        />
      </div>
    </AppShellContext.Provider>
  );
}

/**
 * El perfil como **flotante sobre la tarjeta de usuario**, igual que los avisos:
 * se abre hacia arriba con una animación y se cierra con un clic fuera, con
 * Escape o al abrir otra cosa. Antes sustituía el contenido de la barra, y para
 * volver había que pulsar una pestaña.
 *
 * `className` es del contenedor que envuelve la tarjeta y el flotante (el clic en
 * la tarjeta no cuenta como «fuera»). El flotante se ancla al contenedor
 * `relative` de la zona de usuario, no a este.
 */
function PerfilFlotante({
  abierto,
  onCambiar,
  plegada = false,
  contenido,
  className,
  children,
}: {
  abierto: boolean;
  onCambiar: (abierto: boolean) => void;
  plegada?: boolean;
  contenido: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { ref, visible, entrada } = usePopover(abierto, () => onCambiar(false));
  return (
    <div ref={ref} className={className}>
      {children}
      {visible && (
        <div role="dialog" aria-label="Tu perfil" className={claseDePopover(entrada, plegada)}>
          {contenido}
        </div>
      )}
    </div>
  );
}

/**
 * La ficha de usuario del pie: ahora es **la puerta a tu cuenta**.
 *
 * Antes era un rótulo y debajo iba «Cerrar sesión». Pulsar tu propia cara es
 * el gesto que ya se intenta en cualquier otra herramienta, así que ahí es
 * donde se ha puesto lo tuyo: nombre, foto, presencia, cerrar sesión y borrar
 * la cuenta.
 */
function UserCard({
  user,
  activa = false,
  estadoSlot,
  onAbrir,
}: { user: AppShellUser; activa?: boolean; estadoSlot?: ReactNode; onAbrir: () => void }) {
  return (
    <div
      title="Tu perfil"
      /* Resaltada cuando estás dentro: es la única «entrada» de la barra que no
         vive en la lista de secciones, así que si no se marcara aquí, estando
         en tu cuenta no habría nada marcado en ninguna parte. */
      className={`flex h-full items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-white/5 ${
        activa ? 'bg-white/5' : ''
      }`}
    >
      {/* El mismo círculo que las tarjetas del tablero, y con `mine` puesto: en
          la barra lateral la persona siempre eres tú, así que sale en rojo. Que
          coincida importa — es lo que enseña que el rojo significa «tuyo». */}
      {/**
       * El avatar y su punto **no van dentro del enlace**: el punto es un botón
       * y un botón dentro de un enlace es HTML inválido —y en la práctica, un
       * clic que navega en vez de abrir el menú—. Por eso la ficha es una fila
       * con dos cosas: un enlace que ocupa el texto y el avatar, y el selector
       * de estado encima, fuera de él.
       */}
      <span className="relative shrink-0">
        <button type="button" onClick={onAbrir} className="block" title="Tu perfil">
          <Avatar
            label={user.name.trim() || user.email}
            mine
            size="md"
            src={user.avatarSrc ?? null}
          />
        </button>
        {estadoSlot && <span className="absolute bottom-0 right-0">{estadoSlot}</span>}
      </span>
      {/* El texto sí es el enlace a tu cuenta. */}
      <button
        type="button"
        onClick={onAbrir}
        aria-pressed={activa}
        className="min-w-0 flex-1 text-left"
      >
        {user.name.trim() && (
          <p className="truncate font-sans text-sm font-semibold text-white">{user.name}</p>
        )}
        <p className="truncate font-sans text-xs text-white">{user.email}</p>
      </button>
    </div>
  );
}

/**
 * El selector de organización.
 *
 * ## Dejó de ser un dibujo
 *
 * Nació **solo visual** —icono, «Plan gratuito», un nombre inventado y un
 * chevron sin `onClick`— porque las organizaciones no existían en el backend, y
 * un desplegable que se abre y no lleva a ninguna parte era peor que no
 * tenerlo. Desde 2026-08-26 existen, todo el mundo tiene al menos la suya, y
 * **es donde viven los proyectos**: ahora abre.
 *
 * ## Qué hace al elegir una
 *
 * Escribe la cookie `praxis_org` y recarga. No es una llave: el servidor la usa
 * como **filtro sobre lo que ya puedes ver**, nunca como permiso. Poner ahí la
 * organización de otro devuelve cero proyectos, no los suyos. Ver
 * `commons/theme/organizacion.ts`.
 *
 * ## 🔴 Y ya no hay forma de no elegir ninguna
 *
 * Hasta 2026-08-28 la primera fila del desplegable era «Todas tus
 * organizaciones» y era el estado por defecto. Se retiró: mientras existía,
 * Suscripción y Roles y permisos tenían que volver a preguntar en cuál
 * trabajar, y elegirla dos veces para la misma sesión era el roce que esta
 * etapa vino a quitar. Ahora siempre hay una activa, resuelta en el servidor
 * antes de pintar.
 *
 * ⚠️ **Recarga dura y no `router.refresh()`.** La cookie la leen los siete
 * `layout.tsx` en el servidor, y un refresco del App Router no vuelve a
 * ejecutar el layout de una zona que ya está montada: el sidebar se quedaría
 * marcando la organización vieja mientras la lista de abajo enseña la nueva.
 */

/**
 * El botón de plegar: **un icono, sin texto**.
 *
 * Vive dentro de la cabecera, junto al selector de organización. Al plegar,
 * queda centrado en la barra y sigue disponible para abrirla.
 *
 * El `aria-label` sí es texto completo y cambia con el estado: lo que se pierde
 * al quitar la palabra es para el ratón, no para quien navega con lector.
 */
function BotonDePliegue({ plegada, onClick }: { plegada: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={!plegada}
      aria-label={plegada ? 'Desplegar la barra lateral' : 'Plegar la barra lateral'}
      title={plegada ? undefined : 'Plegar la barra lateral'}
      data-rail-tip={plegada ? 'Desplegar' : undefined}
      className={
        plegada
          ? `${RAIL_CELDA} ${RAIL_REPOSO} cursor-pointer`
          : 'flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface-2 text-text-secondary shadow-sm transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2'
      }
    >
      <svg
        className={plegada ? RAIL_ICONO : 'h-3.5 w-3.5'}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        {/* La divisoria se mueve de lado según el estado: plegada queda a la
            izquierda —el panel estrecho— y desplegada a la derecha. Es la misma
            forma diciendo dos cosas, en vez de dos iconos distintos. */}
        <path strokeLinecap="round" d={plegada ? 'M9 4v16' : 'M15 4v16'} />
      </svg>
    </button>
  );
}

// ─── Árbol jerárquico de proyectos ──────────────────────────────────────────

function ChevronIcon({ open, className = 'h-3 w-3' }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`${className} shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}

interface SidebarProject {
  id: string;
  name: string;
  slug: string;
  iconKey: string | null;
  imageUrl: string | null;
  color: string | null;
  workspaces: EspacioDeLaBarra[];
}

/**
 * Un espacio en la barra: su tipo decide el icono, y los de documentos
 * enseñan sus documentos debajo (E10 de `docs/PLAN-DOCUMENTOS.md`).
 */
interface EspacioDeLaBarra {
  id: string;
  name: string;
  kind: TipoDeEspacio;
  documents: Array<{ id: string; title: string }>;
  boards: Array<{ id: string; name: string }>;
}

/**
 * Los proyectos de la organización activa, **en una sola petición**.
 *
 * ## 🔴 Eran hasta 51, en serie, cada 30 segundos
 *
 * Esto pedía la lista (`limit: 50`) y después **un `GET /projects/:id` por
 * proyecto, con `await` dentro de un `for`**: encadenadas, no en paralelo. Y se
 * repetía al montar —que en Multi-Zones es cada cambio de zona—, cada 30 s por
 * un `setInterval` y otra vez en cada `focus` de la ventana. En las siete zonas.
 *
 * Todo eso era para leer los **espacios** de cada proyecto, que es lo que cuelga
 * de la fila cuando la despliegas. O sea: se pagaban cincuenta peticiones para
 * pintar unos hijos que casi nunca están a la vista.
 *
 * Ahora la lista es lo único que se pide siempre, y los espacios se piden
 * **solo de lo que está desplegado**, en paralelo. Ver `fetchWorkspaces`.
 *
 * ⚠️ No se ha tocado el backend. `GET /projects` podría devolver los espacios y
 * ahorrarse hasta eso, pero es otro equipo y esto ya deja de ser un problema.
 */
/**
 * `null` es «no se pudo preguntar» —el `GET` falló—, y es distinto de `[]`,
 * que es «se preguntó y de verdad no hay ninguno». Quien llama tiene que
 * distinguirlos: confundirlos fue el motivo de que la barra se quedara
 * enseñando «Crea tu primer proyecto» con proyectos de verdad detrás. Ver
 * `cargar`, más abajo.
 */
async function fetchProjectsTree(
  zonePath: string,
  organizacionActivaId: string | null,
): Promise<SidebarProject[] | null> {
  const params = new URLSearchParams({ limit: '50' });
  if (organizacionActivaId) params.set('organizationId', organizacionActivaId);

  const api = createApiClient({ gatewayPath: `${zonePath}/api/gateway` });
  const page = await api
    .get<Paginated<SidebarProjectResumen>>(`/projects?${params}`)
    .catch(() => null);

  if (!page) return null;

  return page.items.map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    iconKey: project.iconKey ?? null,
    imageUrl: project.imageUrl ?? null,
    color: project.color ?? null,
    /* Vacío hasta que alguien despliegue la fila. */
    workspaces: [],
  }));
}

/** Lo que `GET /projects` trae de cada uno y aquí se usa. */
interface SidebarProjectResumen {
  id: string;
  name: string;
  slug: string;
  iconKey?: string | null;
  imageUrl?: string | null;
  color?: string | null;
}

/**
 * Los espacios de unos cuantos proyectos, **en paralelo**.
 *
 * Se pide el detalle solo de lo desplegado: un `GET /projects/:id` por fila
 * abierta, todas a la vez, y una sola vez —lo ya resuelto no se vuelve a pedir—.
 * Con la barra recién abierta y todo desplegado son las mismas peticiones que
 * antes; con la barra como la deja la gente, son dos o tres.
 *
 * Los fallos se tragan por proyecto: uno que no responda deja su fila sin
 * espacios, no la barra lateral sin proyectos.
 */
async function fetchWorkspaces(
  zonePath: string,
  ids: string[],
): Promise<Map<string, EspacioDeLaBarra[]>> {
  const api = createApiClient({ gatewayPath: `${zonePath}/api/gateway` });

  const resueltos = await Promise.all(
    ids.map(async (id) => {
      const detalle = await api
        .get<{
          workspaces?: Array<{
            id: string;
            name: string;
            kind?: TipoDeEspacio;
            documents?: Array<{ id: string; title: string }>;
            boards?: Array<{ id: string; name: string }>;
          }>;
        }>(`/projects/${id}`)
        .catch(() => null);
      return [
        id,
        (detalle?.workspaces ?? []).map((w) => ({
          id: w.id,
          name: w.name,
          kind: w.kind ?? 'BOARDS',
          documents: (w.documents ?? []).map((d) => ({ id: d.id, title: d.title })),
          boards: (w.boards ?? []).map((b) => ({ id: b.id, name: b.name })),
        })),
      ] as const;
    }),
  );

  return new Map(resueltos);
}

/** Cuál de las tres secciones de la barra lateral se está mirando. */
type SidebarTab = 'home' | 'chat' | 'settings';

/** Lo que enseña «Inicio»: el árbol de proyectos y el asistente, nada más. */
const HREFS_DE_INICIO = ['/assistant', '/projects'];

/** Todo lo demás de la lista canónica vive en «Configuraciones». */
const esDeConfiguracion = (href: string) => !HREFS_DE_INICIO.includes(href);

/**
 * La campana de avisos, **solo el icono**, junto al avatar. Sustituye a la
 * pestaña «Bandeja»: pulsarla abre un popover con `SidebarInboxList`.
 *
 * ⚠️ Hay dos instancias (barra de escritorio y cajón móvil) que comparten el
 * estado `abierta`. La que está oculta por CSS ni pinta la lista ni reacciona al
 * clic fuera: sin ese filtro, pulsar dentro del popover visible cerraría el
 * estado compartido desde la instancia invisible, y la lista pediría datos dos
 * veces.
 */
function BandejaBoton({
  abierta,
  onCambiar,
  sinLeer,
  zonePath,
  plegada = false,
}: {
  abierta: boolean;
  onCambiar: (abierta: boolean) => void;
  sinLeer: number;
  zonePath: string;
  plegada?: boolean;
}) {
  const { ref, visible, entrada } = usePopover(abierta, () => onCambiar(false));

  /* `mt-1`: la tarjeta de usuario mide 48 px y la campana 40; empezar arriba la
     dejaba por encima del nombre y del avatar. */
  return (
    <div ref={ref} className={plegada ? 'shrink-0' : 'flex shrink-0 self-stretch'}>
      <button
        type="button"
        onClick={() => onCambiar(!abierta)}
        aria-expanded={abierta}
        aria-haspopup="dialog"
        aria-label={sinLeer > 0 ? `Avisos, ${sinLeer} sin leer` : 'Avisos'}
        title={plegada ? undefined : 'Avisos'}
        data-rail-tip={plegada ? 'Avisos' : undefined}
        className={
          plegada
            ? `${RAIL_CELDA} ${abierta ? RAIL_ACTIVA : RAIL_REPOSO}`
            : `relative flex h-full w-12 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5 ${
                abierta ? 'bg-white/10' : ''
              }`
        }
      >
        <svg
          className="h-[18px] w-[18px]"
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
        {sinLeer > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-surface-2" />
        )}
      </button>

      {visible && (
        <div
          role="dialog"
          aria-label="Avisos"
          className={`${claseDePopover(entrada, plegada)} py-3`}
        >
          <SidebarInboxList
            zonePath={zonePath}
            plegada={false}
            className="max-h-[min(28rem,60dvh)]"
          />
        </div>
      )}
    </div>
  );
}

/**
 * La insignia de una pestaña.
 *
 * Sin nada pendiente **no se pinta**, y no es un detalle: una insignia que
 * enseña un cero es una insignia que enseña nada, y encima desplaza la etiqueta
 * de sitio cada vez que el número aparece y desaparece.
 *
 * `99+` porque a partir de ahí el número deja de informar y solo estorba al
 * ancho de la pestaña, que es el mismo criterio que usan las filas del
 * directorio.
 */
function InsigniaDePestana({ cuantos }: { cuantos: number }) {
  if (cuantos <= 0) return null;
  return (
    <span
      className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-primary px-1 py-px text-center font-sans text-[9px] font-semibold leading-tight text-primary-foreground ring-2 ring-surface-2"
      aria-label={`${cuantos} sin leer`}
    >
      {cuantos > 99 ? '99+' : cuantos}
    </span>
  );
}

/**
 * Las tres secciones de la barra lateral: Inicio, Chat y Configuraciones. La
 * bandeja ya no es pestaña: es el icono de campana junto a tu avatar.
 *
 * ## Por qué está extraído y no en línea
 *
 * Porque se pinta **dos veces**: en la barra de escritorio y en el cajón móvil.
 * En línea eran ciento veinte líneas de JSX repetidas, y esa duplicación es
 * exactamente el motivo de que el cajón móvil se quedara sin pestañas cuando se
 * añadieron —ver `AppShell`—: nadie copia ciento veinte líneas por gusto.
 *
 * ## Las insignias van aquí y no en `NavList`
 *
 * `NavList` pinta entradas de menú, y estas dos ya no son entradas de menú:
 * `ac4caf1` las convirtió en pestañas. Emparejarlas por `href` con la lista
 * canónica es lo que dejó los dos contadores calculándose sin que nadie los
 * pintara. Ver el aviso de `AppShellProps.mensajesSinLeer`.
 */
function SidebarTabs({
  activa,
  onCambiar,
  mensajesSinLeer,
  plegada = false,
  compacta = false,
}: {
  activa: SidebarTab;
  onCambiar: (tab: SidebarTab) => void;
  mensajesSinLeer: number;
  /** Plegada: solo los iconos, en columna, y la insignia se reduce a un punto. */
  plegada?: boolean;
  /**
   * Barra estrecha pero no plegada: la pestaña puesta lleva icono y texto, las
   * demás solo icono. Así la fila no se sale por el borde y sigue diciendo
   * dónde estás.
   */
  compacta?: boolean;
}) {
  const pestanas: Array<{
    id: SidebarTab;
    etiqueta: string;
    insignia: number;
    icono: ReactNode;
  }> = [
    {
      id: 'home',
      etiqueta: 'Inicio',
      insignia: 0,
      icono: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      ),
    },
    {
      id: 'chat',
      etiqueta: 'Chat',
      insignia: mensajesSinLeer,
      icono: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      ),
    },
    {
      id: 'settings',
      etiqueta: 'Configuraciones',
      insignia: 0,
      icono: (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </>
      ),
    },
  ];

  /**
   * La única pestaña que cede espacio si la fila no cabe.
   *
   * - Compacta, la puesta: las otras ya son solo icono y no pueden encoger más
   *   sin aplastarlo, así que se recorta su texto («Configurac…»).
   * - Si no, la más larga de las que no están puestas: con el mismo peso para
   *   todas, «Inicio» perdía cuatro píxeles y ya salía «Ini…».
   */
  const cede = compacta
    ? activa
    : pestanas
        .filter((p) => p.id !== activa)
        .reduce((larga, p) => (p.etiqueta.length > larga.etiqueta.length ? p : larga)).id;

  return (
    /* `role="tablist"` y no una lista de botones sueltos: son tres controles que
       se excluyen entre sí sobre paneles hermanos, que es literalmente lo que
       describe el patrón. Sin esto, un lector de pantalla lee «botón Chat» sin
       decir que hay tres ni cuál está puesta. */
    <div
      role="tablist"
      aria-label="Secciones de la barra lateral"
      /**
       * 🔴 **`shrink-0`, y no es cosmético.**
       *
       * Esta fila vive dentro de un `flex flex-col` con `overflow-y-auto`, y por
       * defecto un hijo de flex tiene `flex-shrink: 1`. Cuando el contenido de
       * la pestaña activa es alto, el navegador **comprime a sus hermanos** — y
       * a esta fila, que además lleva `overflow-x-auto`, la aplasta hasta
       * dejarla invisible.
       *
       * Se veía solo en «Inicio» y solo en móvil, que es lo que lo hacía
       * desconcertante: «Chat» y «Bandeja» llevan su propio
       * `max-h-[calc(100dvh-13rem)]` con scroll interno, así que nunca empujan;
       * `NavList` no tiene tope y crece cuanto haga falta. El resultado era
       * quedarse en Inicio **sin ninguna forma de volver a las otras dos**,
       * exactamente el fallo que el `plegada` de aquí abajo venía a evitar en
       * escritorio.
       */
      className={
        plegada
          ? 'relative flex shrink-0 flex-col items-center gap-0.5 self-center rounded-xl border border-white/10 bg-surface p-0.5'
          : '-mt-2 mb-4 flex shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap pt-2 scrollbar-none'
      }
    >
      {/**
       * Plegada, las tres pestañas son un **interruptor vertical**: la misma
       * caja hundida que el selector Kanban · Calendario · Tabla, de pie.
       *
       * Llevaban la barrita morada del activo, igual que el proyecto abierto
       * justo debajo, y con dos barritas a la vez no se sabía cuál mandaba. Las
       * pestañas no son un sitio al que se va: son un modo de la barra. Por eso
       * el activo aquí es un fondo que **se desliza** de una a otra, y la
       * barrita queda solo para dónde estás.
       *
       * El indicador es un único elemento movido con `translateY` (celda de
       * 36 px + 2 de separación), no un fondo por botón: así viaja en vez de
       * apagarse en uno y encenderse en otro.
       */}
      {plegada && (
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-0.5 h-9 w-9 rounded-lg bg-white/10 shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{
            transform: `translateY(${
              Math.max(
                0,
                pestanas.findIndex((p) => p.id === activa),
              ) * 38
            }px)`,
          }}
        />
      )}
      {pestanas.map((pestana) => {
        const puesta = activa === pestana.id;
        const soloIcono = compacta && !puesta;
        return (
          <button
            key={pestana.id}
            type="button"
            role="tab"
            aria-selected={puesta}
            onClick={() => onCambiar(pestana.id)}
            /* Plegada, la etiqueta se va y hace falta un `title`: un icono solo
               no dice qué es, y aquí no hay texto al lado que lo explique. */
            title={soloIcono ? pestana.etiqueta : undefined}
            data-rail-tip={plegada ? pestana.etiqueta : undefined}
            /* Solo una pestaña encoge: ver `cede`. */
            style={{ flexShrink: !plegada && pestana.id === cede ? 1 : 0 }}
            aria-label={plegada || soloIcono ? pestana.etiqueta : undefined}
            className={`flex items-center font-sans text-[12px] font-semibold transition-[background-color,color,padding] duration-200 ease-out motion-reduce:transition-none ${
              plegada
                ? `relative z-10 h-9 w-9 justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    puesta ? 'text-white' : 'text-text-secondary hover:text-white'
                  }`
                : `min-w-0 rounded-full py-1.5 ${soloIcono ? 'px-1.5' : 'px-2.5'} ${
                    puesta
                      ? 'bg-white/10 text-white'
                      : 'text-text-secondary hover:bg-white/5 hover:text-white'
                  }`
            }`}
          >
            {/* ⚠️ La fila lleva `pt-2` (y `-mt-2` para no moverla): `overflow-x-auto` recorta
                también en vertical y cortaba por arriba la burbuja del contador. */}
            {/* La insignia va **sobre el icono**, no al lado: inline ensanchaba la pestaña
                y «Configuraciones» se salía por el borde de la barra. */}
            <span className="relative inline-flex shrink-0">
              <svg
                className={plegada ? RAIL_ICONO : 'h-4 w-4'}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                {pestana.icono}
              </svg>
              {!plegada && <InsigniaDePestana cuantos={pestana.insignia} />}
            </span>
            {plegada ? (
              /* El número no cabe en 36 px: se reduce a un punto, que es lo que
                 hace falta saber —hay algo— con el `title` para el resto. */
              pestana.insignia > 0 && (
                <span
                  className="absolute h-2 w-2 rounded-full bg-primary ring-2 right-1 top-1 ring-surface"
                  aria-label={`${pestana.insignia} sin leer`}
                />
              )
            ) : (
              /**
               * La etiqueta entra y sale **animada**, con `max-width` y
               * opacidad. Se probó con una rejilla de `0fr` a `1fr` —que anima
               * hasta el ancho exacto del texto— y Chrome no la colapsaba
               * cuando la pestaña no podía encoger: medía la columna `0fr` al
               * ancho del texto. `max-width` no tiene esa ambigüedad. `min-w-0`
               * deja que la que cede se recorte con «…» (ver `cede`).
               */
              <span
                aria-hidden={soloIcono || undefined}
                className={`min-w-0 overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out motion-reduce:transition-none ${
                  soloIcono ? 'ml-0 max-w-0 opacity-0' : 'ml-1 max-w-[10rem] opacity-100'
                }`}
              >
                <span className="block truncate">{pestana.etiqueta}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Dónde se recuerda qué filas del árbol están abiertas. */
const DESPLEGADOS_KEY = 'praxis_sidebar_projects_expanded';

/**
 * Qué proyectos estaban desplegados.
 *
 * ⚠️ En un `useState` perezoso y no en un `useEffect`: leerlo después de montar
 * pintaba el árbol replegado y lo abría un instante más tarde, y en Multi-Zones
 * cada cambio de zona es una carga completa, así que ese salto salía en cada
 * navegación. Es el mismo motivo por el que el pliegue de la barra vive en una
 * cookie.
 *
 * `try` porque `localStorage` lanza —no devuelve `null`— en un contexto sin
 * acceso a almacenamiento.
 */
function desplegadosGuardados(): Set<string> {
  try {
    const guardado = localStorage.getItem(DESPLEGADOS_KEY);
    return guardado ? new Set<string>(JSON.parse(guardado)) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function guardarDesplegados(desplegados: Set<string>): void {
  try {
    localStorage.setItem(DESPLEGADOS_KEY, JSON.stringify([...desplegados]));
  } catch {
    /* Sin almacenamiento, el árbol se abre de cero en cada carga. Se vive. */
  }
}

/**
 * El árbol de proyectos fuera de la barra: la pantalla **Inicio en móvil**
 * (M3 de `docs/PLAN-MOVIL.md`). Es el mismo de la barra lateral —con su
 * buscador, sus menús ⋯ (que en móvil son hojas) y su «Nuevo proyecto»—,
 * porque en un teléfono no hay barra lateral que lo enseñe.
 *
 * Con dos diferencias desde M8, las dos pedidas por el dueño: **sin la
 * cabecera «Proyectos»** —en una pantalla donde no hay otra cosa no separa
 * nada— y **con los proyectos siempre abiertos**, sin flecha para plegarlos.
 * Los espacios sí se siguen plegando.
 */
export function ArbolDeProyectos() {
  const contexto = useContext(AppShellContext);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consulta = searchParams.toString();
  return (
    <SidebarProjectsTree
      zonePath=""
      plegada={false}
      activePath={pathname + (consulta ? `?${consulta}` : '')}
      organizacionActivaId={contexto?.organizacionActivaId ?? null}
      movil
    />
  );
}
function SidebarProjectsTree({
  zonePath,
  plegada,
  activePath,
  organizacionActivaId,
  onDesplegar,
  movil = false,
}: {
  zonePath: string;
  plegada: boolean;
  activePath: string;
  organizacionActivaId: string | null;
  /** Plegada: el «+» despliega la barra para escribir el nombre del proyecto. */
  onDesplegar?: () => void;
  /** La pantalla Inicio de móvil: ver `ArbolDeProyectos`. */
  movil?: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => desplegadosGuardados());
  /** «Nuevo proyecto» del menú ⋯ de la cabecera: el campo está abierto. */
  const [creandoProyecto, setCreandoProyecto] = useState(false);
  /** «Nuevo documento / tablero» del menú ⋯ de un espacio: en cuál. */
  const [creandoEn, setCreandoEn] = useState<string | null>(null);
  /** Si se eligió «Agregar espacio» en el menú ⋯ de un proyecto: cuál y de qué tipo. */
  const [agregandoEspacio, setAgregandoEspacio] = useState<{
    id: string;
    tipo: TipoDeEspacio;
  } | null>(null);
  /**
   * Los espacios abiertos o cerrados **por decisión de quien usa la barra**.
   * Sin decisión, un espacio está cerrado salvo que tenga dentro lo que se está
   * mirando: así el árbol ocupa poco y aun así enseña dónde estás.
   */
  const [espaciosAbiertos, setEspaciosAbiertos] = useState<Map<string, boolean>>(new Map());
  /**
   * El buscador de Inicio. Busca en proyectos, espacios, tableros y documentos.
   *
   * ⚠️ Los espacios de un proyecto se piden **al desplegarlo** (ver el efecto de
   * abajo), así que un tablero de un proyecto cerrado no estaría para
   * encontrarlo. Mientras se busca, el efecto pide los que falten —una vez cada
   * uno, por el mismo registro— y las ramas con coincidencias se abren solas.
   */
  const [busqueda, setBusqueda] = useState('');
  const termino = normalizarBusqueda(busqueda);
  const buscando = termino !== '';

  /**
   * Los proyectos cuyo detalle ya se pidió, para no volver a pedirlo.
   *
   * Ver el efecto de más abajo: sin este registro, un proyecto **sin espacios**
   * se pedía en bucle infinito y agotaba el limitador del gateway.
   *
   * Un `ref` y no estado: cambiarlo no tiene que repintar nada, y como estado
   * sería una dependencia del propio efecto que lo escribe.
   */
  const espaciosPedidos = useRef<Set<string>>(new Set());

  const cargar = useCallback(() => {
    fetchProjectsTree(zonePath, organizacionActivaId)
      .then((lista) => {
        /* ⚠️ `null` no se pinta: es un `GET` que falló —el `focus` de la
           ventana lo dispara con el token de acceso ya caducado (dura 15
           minutos), justo lo que pasa al volver de otra pestaña— y no «cero
           proyectos». Antes se aplanaba a `[]` dentro de `fetchProjectsTree`
           y aquí se asignaba igual que una lista de verdad: la barra tenía
           proyectos, la recarga fallaba en silencio, y «Crea tu primer
           proyecto» sustituía una lista que seguía existiendo en el
           servidor. Se deja como estaba y se reintentará solo (el próximo
           `focus`, o el usuario recargando la pantalla). */
        if (lista === null) return;
        setProjects((previos) => {
          /* Se conservan los espacios ya resueltos: la lista no los trae, y
             perderlos en cada recarga replegaría el árbol a la vista. */
          const espaciosPrevios = new Map(previos.map((p) => [p.id, p.workspaces]));
          const siguiente = lista.map((p) => ({
            ...p,
            workspaces: espaciosPrevios.get(p.id) ?? [],
          }));
          /* Comparar antes de asignar: sin esto, cada recarga devuelve objetos
             nuevos y repinta el árbol entero aunque nada haya cambiado. */
          return JSON.stringify(previos) === JSON.stringify(siguiente) ? previos : siguiente;
        });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [zonePath, organizacionActivaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * ⚠️ **Ya no hay `setInterval` de 30 segundos.**
   *
   * Con el N+1 de antes, ese temporizador disparaba hasta 51 peticiones en serie
   * cada medio minuto, en cada zona abierta, para enterarse de si alguien había
   * creado un proyecto. Un proyecto nuevo se crea unas cuantas veces por semana.
   *
   * Lo que queda es el `focus` de la ventana —volver a la pestaña **es** el
   * momento en que puede haber cambiado algo— y, sobre todo, `revalidatePath`,
   * que ya refresca la zona al crear uno desde ella.
   *
   * ⚠️ Y `organizacionActivaId` está en las dependencias, que antes no lo estaba:
   * el intervalo capturaba la organización del primer render y seguía pidiendo
   * la de antes. No se notaba porque cambiar de organización recarga la página
   * entera, pero era una bomba de relojería para el día que dejara de hacerlo.
   */
  useEffect(() => {
    function alVolver() {
      /* ⚠️ Se olvida lo ya pedido, y solo aquí. Sin esto, un espacio creado en
         otra pestaña no aparecería nunca: el registro de `espaciosPedidos` está
         para cortar el bucle, no para cachear para siempre. Volver a la ventana
         es exactamente el momento en que puede haber cambiado algo. */
      espaciosPedidos.current.clear();
      cargar();
    }
    window.addEventListener('focus', alVolver);
    return () => window.removeEventListener('focus', alVolver);
  }, [cargar]);

  /**
   * Los espacios, **solo de lo desplegado y solo una vez**.
   *
   * Es lo que convierte las 51 peticiones en dos o tres: el detalle de un
   * proyecto se pide cuando su fila se abre, no al pintar la barra.
   *
   * ## 🔴 Y «una vez» hay que llevarlo escrito, no deducirlo del resultado
   *
   * La primera versión decidía qué pedir con `p.workspaces.length === 0`, y eso
   * es un bucle infinito en cuanto **un proyecto no tiene espacios**, que es un
   * estado perfectamente normal:
   *
   * 1. Se pide el detalle de ese proyecto y vuelve con cero espacios.
   * 2. `setProjects(previos => previos.map(…))` devuelve **un array nuevo**
   *    aunque no haya cambiado ni un elemento.
   * 3. La identidad nueva vuelve a disparar este efecto.
   * 4. El proyecto sigue con `workspaces.length === 0`, así que sigue pendiente.
   *    Vuelta al paso 1.
   *
   * El resultado era una ráfaga continua de `GET /projects/:id` que agotaba el
   * limitador del gateway —300 por minuto y por cuenta— en segundos. A partir de
   * ahí **todo** respondía 429: los espacios volvían vacíos («ningún proyecto
   * tiene workspaces») y la propia página del proyecto, renderizada en el
   * servidor con la misma sesión, caía a `notFound()`. De ahí el «a veces carga
   * y a veces da 404», que parecía intermitente y era exactamente esto.
   *
   * Se arregla con un registro de lo ya pedido. Un `ref` y no estado: cambiarlo
   * no tiene que repintar nada, y si fuera estado volvería a ser una dependencia
   * de este mismo efecto.
   */
  useEffect(() => {
    const pendientes = projects
      .filter(
        (p) => (movil || expanded.has(p.id) || buscando) && !espaciosPedidos.current.has(p.id),
      )
      .map((p) => p.id);
    if (pendientes.length === 0) return;

    /* Se marcan **antes** de pedir, no al volver: entre la petición y su
       respuesta puede haber varios renders, y marcar después dejaría la misma
       ventana por la que se colaba el bucle. */
    for (const id of pendientes) espaciosPedidos.current.add(id);

    let vigente = true;
    fetchWorkspaces(zonePath, pendientes).then((porProyecto) => {
      if (!vigente) return;
      setProjects((previos) => {
        let cambio = false;
        const siguiente = previos.map((p) => {
          const espacios = porProyecto.get(p.id);
          if (!espacios?.length) return p;
          cambio = true;
          return { ...p, workspaces: espacios };
        });
        /* Se devuelve el mismo array si no cambió nada. Es la segunda mitad del
           arreglo: sin esto, cada respuesta repinta el árbol entero aunque no
           traiga ninguna novedad. */
        return cambio ? siguiente : previos;
      });
    });
    return () => {
      vigente = false;
    };
  }, [projects, expanded, zonePath, buscando, movil]);

  /** Tras crear algo desde la barra: vuelve a pedir los espacios de ese proyecto. */
  const refrescarProyecto = useCallback(
    (id: string) => {
      fetchWorkspaces(zonePath, [id]).then((porProyecto) => {
        const espacios = porProyecto.get(id);
        if (!espacios) return;
        setProjects((previos) =>
          previos.map((p) => (p.id === id ? { ...p, workspaces: espacios } : p)),
        );
      });
      setExpanded((previos) => {
        if (previos.has(id)) return previos;
        const siguiente = new Set(previos).add(id);
        guardarDesplegados(siguiente);
        return siguiente;
      });
    },
    [zonePath],
  );

  function toggleProject(id: string) {
    setExpanded((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      guardarDesplegados(siguiente);
      return siguiente;
    });
  }

  const gatewayPath = `${zonePath}/api/gateway`;

  /* Lo que casa con la búsqueda: un proyecto que casa entero se enseña entero;
     si no, solo las ramas que llevan dentro algo que casa. */
  const casa = (texto: string) => normalizarBusqueda(texto).includes(termino);
  const proyectosVisibles = !buscando
    ? projects
    : projects.flatMap((p) => {
        if (casa(p.name)) return [p];
        const espacios = p.workspaces.flatMap((w) => {
          if (casa(w.name)) return [w];
          const boards = w.boards.filter((b) => casa(b.name));
          const documents = w.documents.filter((d) => casa(d.title || 'Sin título'));
          return boards.length > 0 || documents.length > 0 ? [{ ...w, boards, documents }] : [];
        });
        return espacios.length > 0 ? [{ ...p, workspaces: espacios }] : [];
      });

  if (loading) {
    return (
      <SidebarSection
        etiqueta="Proyectos"
        plegada={plegada}
        sinCabecera={movil}
        sinDivisoria={movil}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`animate-presione rounded-lg bg-white/5 ${plegada ? 'h-10 w-10' : 'h-9'}`}
          />
        ))}
      </SidebarSection>
    );
  }

  /** «Agregar espacio» del menú ⋯: abre el proyecto y el campo donde se escribe el nombre. */
  function abrirEspacioNuevo(id: string, tipo: TipoDeEspacio) {
    refrescarProyecto(id);
    setAgregandoEspacio({ id, tipo });
  }

  if (plegada) {
    return (
      <SidebarSection etiqueta="Proyectos" plegada>
        {/* `self-stretch`: centrado por su padre, el `<nav>` mediría 40 px y el
            `overflow-hidden` del desplegable cortaría la barrita del activo. */}
        <nav aria-label="Proyectos" className="flex flex-col items-center gap-1 self-stretch">
          {projects.map((project) => {
            const projectHref = `/projects/${project.slug}`;
            const activo =
              activePath === projectHref ||
              activePath.startsWith(`${projectHref}?`) ||
              activePath.startsWith(`${projectHref}/`);
            return (
              <Link
                key={project.id}
                href={projectHref}
                aria-label={project.name}
                data-rail-tip={project.name}
                aria-current={activo ? 'page' : undefined}
                className={`${RAIL_CELDA} ${activo ? RAIL_ACTIVA : RAIL_REPOSO}`}
              >
                <ProjectMonogram
                  id={project.id}
                  name={project.name}
                  iconKey={project.iconKey}
                  imageUrl={project.imageUrl}
                  color={project.color}
                />
              </Link>
            );
          })}
          {onDesplegar && (
            <button
              type="button"
              onClick={() => {
                onDesplegar();
                setCreandoProyecto(true);
              }}
              aria-label="Nuevo proyecto"
              data-rail-tip="Nuevo proyecto"
              className={`${RAIL_CELDA} ${RAIL_REPOSO}`}
            >
              <Plus className={RAIL_ICONO} aria-hidden="true" />
            </button>
          )}
        </nav>
      </SidebarSection>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BuscadorDeBarra
        valor={busqueda}
        onCambiar={setBusqueda}
        placeholder="Buscar"
        etiqueta="Buscar proyectos, espacios, tableros y documentos"
        movil={movil}
      />
      <SidebarSection
        etiqueta="Proyectos"
        sinCabecera={movil}
        sinDivisoria={movil}
        accion={
          <MenuFlotante
            etiquetaAria="Acciones de proyectos"
            gatewayPath={gatewayPath}
            activa
            items={[
              {
                clave: 'nuevo-proyecto',
                etiqueta: 'Nuevo proyecto',
                icono: <FolderPlus />,
                onElegir: () => setCreandoProyecto(true),
              },
            ]}
          />
        }
      >
        {creandoProyecto && (
          <NuevoProyectoEnLinea
            gatewayPath={gatewayPath}
            organizacionId={organizacionActivaId}
            onCreado={cargar}
            onCerrar={() => setCreandoProyecto(false)}
          />
        )}
        <nav aria-label="Proyectos" className="flex flex-col gap-0.5">
          {proyectosVisibles.map((project) => {
            const isOpen = movil || buscando || expanded.has(project.id);
            // Las URLs de proyecto usan el SLUG, no el id
            const projectHref = `/projects/${project.slug}`;
            const isActiveProject =
              activePath === projectHref ||
              activePath.startsWith(`${projectHref}?`) ||
              activePath.startsWith(`${projectHref}/`);
            const agregando = agregandoEspacio?.id === project.id ? agregandoEspacio : null;

            return (
              <div key={project.id} className="flex flex-col">
                <FilaDeArbol
                  activo={isActiveProject}
                  href={projectHref}
                  nombre={project.name}
                  projectId={project.id}
                  gatewayPath={gatewayPath}
                  inicio={
                    <>
                      {!movil && (
                        <button
                          type="button"
                          onClick={() => toggleProject(project.id)}
                          aria-expanded={isOpen}
                          aria-label={
                            isOpen ? `Colapsar ${project.name}` : `Expandir ${project.name}`
                          }
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:text-white"
                        >
                          <ChevronIcon open={isOpen} />
                        </button>
                      )}
                      <span
                        className={`${SIDEBAR_INICIO} [&>*]:shrink-0 [&>*]:scale-[0.82]`}
                        aria-hidden="true"
                      >
                        <ProjectMonogram
                          id={project.id}
                          name={project.name}
                          iconKey={project.iconKey}
                          imageUrl={project.imageUrl}
                          color={project.color}
                        />
                      </span>
                    </>
                  }
                  itemsExtra={[
                    {
                      clave: 'espacio-tableros',
                      grupo: 'Agregar espacio',
                      etiqueta: 'De tableros',
                      icono: <FolderKanban />,
                      permiso: 'canEditBoard',
                      onElegir: () => abrirEspacioNuevo(project.id, 'BOARDS'),
                    },
                    {
                      clave: 'espacio-documentos',
                      grupo: 'Agregar espacio',
                      etiqueta: 'De documentos',
                      icono: <FolderBookmark />,
                      permiso: 'canEditBoard',
                      onElegir: () => abrirEspacioNuevo(project.id, 'DOCUMENTS'),
                    },
                  ]}
                  edicion={{
                    tipo: 'proyecto',
                    path: `/projects/${project.id}`,
                    cuerpoDeNombre: (name) => ({ name }),
                    permisoRenombrar: 'canEditProject',
                    permisoEliminar: 'canDeleteProject',
                    confirmarEscribiendo: true,
                    onCambiado: cargar,
                    alEliminar: () => router.push('/projects'),
                    /* El slug se regenera al renombrar: la URL abierta dejaría de resolver. */
                    alRenombrar: (guardado) => {
                      if (isActiveProject && guardado.slug && guardado.slug !== project.slug) {
                        router.replace(`/projects/${guardado.slug}`);
                      }
                    },
                  }}
                />

                <Desplegable abierto={isOpen}>
                  <div className="flex flex-col gap-0.5 pb-1 pl-6 pt-0.5">
                    {agregando && (
                      <NuevoEspacioEnLinea
                        proyecto={project}
                        tipo={agregando.tipo}
                        gatewayPath={gatewayPath}
                        onCreado={() => refrescarProyecto(project.id)}
                        onCerrar={() => setAgregandoEspacio(null)}
                      />
                    )}
                    {project.workspaces.length === 0 && !agregando ? (
                      <span className="select-none px-2.5 py-1 font-sans text-[12px] italic text-text-secondary">
                        Sin espacios
                      </span>
                    ) : (
                      project.workspaces.map((ws) => {
                        // URL correcta: /projects/{slug}?tab=espacios&ws={wsId}
                        const wsHref = `/projects/${project.slug}?tab=espacios&ws=${ws.id}`;
                        const isActiveWs = activePath.includes(`ws=${ws.id}`);
                        const wsAbierto = buscando || (espaciosAbiertos.get(ws.id) ?? isActiveWs);
                        /* El icono dice qué guarda el espacio: tableros o documentos. */
                        const Icono = ws.kind === 'DOCUMENTS' ? FolderBookmark : FolderKanban;
                        const refrescar = () => refrescarProyecto(project.id);
                        return (
                          <div key={ws.id} className="flex flex-col gap-0.5">
                            <FilaDeArbol
                              compacta
                              activo={isActiveWs}
                              href={wsHref}
                              nombre={ws.name}
                              projectId={project.id}
                              gatewayPath={gatewayPath}
                              itemsExtra={[
                                {
                                  clave: 'nuevo-contenido',
                                  etiqueta:
                                    ws.kind === 'DOCUMENTS' ? 'Nuevo documento' : 'Nuevo tablero',
                                  icono: <Plus />,
                                  permiso:
                                    ws.kind === 'DOCUMENTS' ? 'canEditDocuments' : 'canCreateBoard',
                                  onElegir: () => {
                                    setEspaciosAbiertos((previos) =>
                                      new Map(previos).set(ws.id, true),
                                    );
                                    setCreandoEn(ws.id);
                                  },
                                },
                              ]}
                              inicio={
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEspaciosAbiertos((previos) =>
                                        new Map(previos).set(ws.id, !wsAbierto),
                                      )
                                    }
                                    aria-expanded={wsAbierto}
                                    aria-label={
                                      wsAbierto ? `Colapsar ${ws.name}` : `Expandir ${ws.name}`
                                    }
                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:text-white"
                                  >
                                    <ChevronIcon open={wsAbierto} />
                                  </button>
                                  <Icono className={SIDEBAR_ICONO} aria-hidden="true" />
                                </>
                              }
                              edicion={{
                                tipo: 'espacio',
                                path: `/workspaces/${ws.id}`,
                                cuerpoDeNombre: (name) => ({ name }),
                                permisoRenombrar: 'canEditBoard',
                                permisoEliminar: 'canDeleteBoard',
                                confirmarEscribiendo: true,
                                onCambiado: refrescar,
                                alEliminar: () => router.push(projectHref),
                              }}
                            />
                            <Desplegable abierto={wsAbierto}>
                              <div className="flex flex-col gap-0.5 pl-6">
                                {ws.boards.map((tablero) => {
                                  const tableroActivo = activePath.includes(`board=${tablero.id}`);
                                  return (
                                    <FilaDeArbol
                                      key={tablero.id}
                                      compacta
                                      activo={tableroActivo}
                                      href={`${wsHref}&board=${tablero.id}`}
                                      nombre={tablero.name}
                                      projectId={project.id}
                                      gatewayPath={gatewayPath}
                                      inicio={
                                        <Columns3 className={SIDEBAR_ICONO} aria-hidden="true" />
                                      }
                                      edicion={{
                                        tipo: 'tablero',
                                        path: `/boards/${tablero.id}`,
                                        cuerpoDeNombre: (name) => ({ name }),
                                        permisoRenombrar: 'canEditBoard',
                                        permisoEliminar: 'canDeleteBoard',
                                        confirmarEscribiendo: true,
                                        onCambiado: refrescar,
                                        alEliminar: () => router.push(wsHref),
                                      }}
                                    />
                                  );
                                })}
                                {ws.documents.map((doc) => {
                                  const docActivo = activePath.includes(`doc=${doc.id}`);
                                  return (
                                    <FilaDeArbol
                                      key={doc.id}
                                      compacta
                                      activo={docActivo}
                                      href={`${wsHref}&doc=${doc.id}`}
                                      nombre={doc.title || 'Sin título'}
                                      projectId={project.id}
                                      gatewayPath={gatewayPath}
                                      inicio={<File className={SIDEBAR_ICONO} aria-hidden="true" />}
                                      edicion={{
                                        tipo: 'documento',
                                        path: `/workspaces/${ws.id}/documents/${doc.id}`,
                                        cuerpoDeNombre: (title) => ({ title }),
                                        permisoRenombrar: 'canEditDocuments',
                                        permisoEliminar: 'canEditDocuments',
                                        confirmarEscribiendo: false,
                                        onCambiado: refrescar,
                                        alEliminar: () => router.push(wsHref),
                                      }}
                                    />
                                  );
                                })}
                                {creandoEn === ws.id && (
                                  <NuevoContenidoEnLinea
                                    espacio={ws}
                                    proyecto={project}
                                    gatewayPath={gatewayPath}
                                    onCreado={refrescar}
                                    onCerrar={() => setCreandoEn(null)}
                                  />
                                )}
                              </div>
                            </Desplegable>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Desplegable>
              </div>
            );
          })}
        </nav>
        {projects.length === 0 && !creandoProyecto && (
          <FilaDeAccion etiqueta="Crear primer proyecto" onClick={() => setCreandoProyecto(true)} />
        )}
        {/* Móvil: sin cabecera no hay ⋯ con «Nuevo proyecto»; va al final de la lista. */}
        {movil && projects.length > 0 && !creandoProyecto && !buscando && (
          <FilaDeAccion etiqueta="Nuevo proyecto" onClick={() => setCreandoProyecto(true)} />
        )}
        {buscando && projects.length > 0 && proyectosVisibles.length === 0 && (
          <p className="px-3 py-6 text-center font-sans text-[13px] text-text-secondary">
            Nada coincide con «{busqueda.trim()}».
          </p>
        )}
      </SidebarSection>
    </div>
  );
}

/** Una fila de conversación privada. Fuera del componente: ver `SidebarChatList`. */
function FilaDePersona({
  conversacion,
  peer,
  activo,
  plegada,
  gatewayPath,
}: {
  conversacion: DirectConversation;
  peer?: UserProfile;
  activo: boolean;
  plegada: boolean;
  gatewayPath: string;
}) {
  const nombre = peer ? personLabel(peer) : 'Alguien';
  const presencia = usePresence(conversacion.peerId, peer?.presence);

  return (
    <Link
      href={`/chat/${conversacion.peerId}`}
      aria-current={activo ? 'page' : undefined}
      aria-label={plegada ? nombre : undefined}
      data-rail-tip={plegada ? nombre : undefined}
      className={
        plegada
          ? `${RAIL_CELDA} ${activo ? RAIL_ACTIVA : RAIL_REPOSO}`
          : `group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors ${
              activo ? 'bg-white/10' : 'hover:bg-white/5'
            }`
      }
    >
      <span
        className={
          plegada
            ? 'flex shrink-0 items-center justify-center'
            : 'flex h-7 w-7 shrink-0 items-center justify-center [&>*]:shrink-0 [&>*]:scale-[1.1]'
        }
      >
        <Avatar
          label={nombre}
          size={plegada ? 'base' : 'sm'}
          src={avatarHref(peer?.avatarUrl, gatewayPath)}
          presence={presencia}
        />
      </span>
      {plegada && conversacion.unread > 0 && (
        <span
          aria-label={`${conversacion.unread} sin leer`}
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-surface-2"
        />
      )}
      {!plegada && (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            {/* Activo en blanco, el resto en secundario. Los dos decían
                `text-white`: el ternario existía y devolvía lo mismo en las dos
                ramas desde el rediseño monocromo, así que la fila abierta no se
                distinguía de las demás. */}
            <span
              className={`truncate font-sans text-[13px] font-medium ${
                activo ? 'text-white' : 'text-text-primary'
              }`}
            >
              {nombre}
            </span>
            {conversacion.ultimo && (
              <span className="ml-auto shrink-0 font-sans text-[10px] text-text-secondary">
                {cuandoCorto(conversacion.ultimo.createdAt)}
              </span>
            )}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-sans text-[11px] text-text-secondary">
              {conversacion.ultimo ? resumenDe(conversacion.ultimo) : 'Iniciar conversación'}
            </span>
            <InsigniaDeFila cuantos={conversacion.unread} />
          </span>
        </span>
      )}
    </Link>
  );
}

/** Una fila de chat de equipo. */
function FilaDeProyecto({
  chat,
  autor,
  activo,
  plegada,
}: {
  chat: ProjectChatSummary;
  autor?: UserProfile;
  activo: boolean;
  plegada: boolean;
}) {
  return (
    <Link
      href={`/chat/proyecto/${chat.project.id}`}
      aria-current={activo ? 'page' : undefined}
      aria-label={plegada ? chat.project.name : undefined}
      data-rail-tip={plegada ? chat.project.name : undefined}
      className={
        plegada
          ? `${RAIL_CELDA} ${activo ? RAIL_ACTIVA : RAIL_REPOSO}`
          : `group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors ${
              activo ? 'bg-white/10' : 'hover:bg-white/5'
            }`
      }
    >
      <span
        className={
          plegada
            ? 'flex shrink-0 items-center justify-center'
            : 'flex h-7 w-7 shrink-0 items-center justify-center [&>*]:shrink-0 [&>*]:scale-[0.82]'
        }
      >
        <ProjectMonogram
          id={chat.project.id}
          name={chat.project.name}
          iconKey={chat.project.iconKey}
          imageUrl={chat.project.imageUrl}
          color={chat.project.color}
        />
      </span>
      {plegada && chat.unread > 0 && (
        <span
          aria-label={`${chat.unread} sin leer`}
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-surface-2"
        />
      )}
      {!plegada && (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <span
              className={`truncate font-sans text-[13px] font-medium ${
                activo ? 'text-white' : 'text-text-primary'
              }`}
            >
              {chat.project.name}
            </span>
            {chat.ultimo && (
              <span className="ml-auto shrink-0 font-sans text-[10px] text-text-secondary">
                {cuandoCorto(chat.ultimo.createdAt)}
              </span>
            )}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-sans text-[11px] text-text-secondary">
              {chat.ultimo
                ? `${autor ? personLabel(autor) : 'Alguien'}: ${resumenDe(chat.ultimo)}`
                : 'Sin mensajes'}
            </span>
            <InsigniaDeFila cuantos={chat.unread} />
          </span>
        </span>
      )}
    </Link>
  );
}

/** Sin nada pendiente no se pinta: una insignia con un cero no informa de nada. */
function InsigniaDeFila({ cuantos }: { cuantos: number }) {
  if (cuantos <= 0) return null;
  return (
    <span
      className="min-w-[18px] shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-center font-sans text-[9px] font-semibold text-primary-foreground"
      aria-label={`${cuantos} sin leer`}
    >
      {cuantos > 99 ? '99+' : cuantos}
    </span>
  );
}

/**
 * El resumen de una fila.
 *
 * ⚠️ `deletedAt` antes que `body`: al borrar, el servidor vacía el cuerpo, así
 * que sin esta rama la fila se queda en blanco y se lee como si la conversación
 * estuviera vacía.
 */
export function resumenDe(mensaje: { body: string; deletedAt?: string | null }): string {
  if (mensaje.deletedAt) return 'Mensaje eliminado';
  const plano = mensaje.body.replace(/<[^>]*>?/g, '').trim();
  return plano.length > 50 ? `${plano.slice(0, 50)}…` : plano;
}

/** Hoy la hora; antes, el día. En una columna de 320 px no cabe más. */
export function cuandoCorto(iso: string): string {
  const fecha = new Date(iso);
  const ahora = new Date();
  const mismoDia =
    fecha.getDate() === ahora.getDate() &&
    fecha.getMonth() === ahora.getMonth() &&
    fecha.getFullYear() === ahora.getFullYear();

  return mismoDia
    ? fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : fecha.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

/**
 * La pestaña Configuraciones: las entradas de ajustes, con su buscador.
 *
 * El buscador está por simetría con las otras dos pestañas —las tres empiezan
 * igual, y cambiar de una a otra no desplaza la lista— y porque las entradas
 * de ajustes son justo lo que se busca por nombre («facturación», «equipo»).
 */
function SidebarSettingsList({
  navItems,
  activePath,
  plegada,
  onNavigate,
}: {
  navItems: AppNavItem[];
  activePath: string;
  plegada: boolean;
  onNavigate?: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const termino = normalizarBusqueda(busqueda);
  const visibles = termino
    ? navItems.filter((i) => normalizarBusqueda(i.label).includes(termino))
    : navItems;
  return (
    <div className="flex flex-col gap-3">
      {!plegada && (
        <BuscadorDeBarra
          valor={busqueda}
          onCambiar={setBusqueda}
          placeholder="Buscar"
          etiqueta="Buscar en configuraciones"
        />
      )}
      <NavList
        navItems={visibles}
        activePath={activePath}
        plegada={plegada}
        onNavigate={onNavigate}
      />
      {!plegada && termino && visibles.length === 0 && (
        <p className="px-3 py-6 text-center font-sans text-[13px] text-text-secondary">
          Ningún ajuste coincide con «{busqueda.trim()}».
        </p>
      )}
    </div>
  );
}

/**
 * El directorio de conversaciones, en su pestaña de la barra lateral.
 *
 * ## ⚠️ Se monta **siempre**, aunque su pestaña no esté a la vista
 *
 * No es una pantalla: es una suscripción. Desmontada, sus `useLiveEvent` no
 * existen y las burbujas por conversación dejan de acumularse mientras miras
 * otra pestaña. Quien lo esconde es un `hidden` de CSS, no un `&&`. Ver
 * `ArmazonInterno`.
 *
 * ## Las filas viven fuera del componente, y no es estilo
 *
 * `FilaDePersona` y `FilaDeProyecto` estaban declaradas **dentro** de esta
 * función. Un componente declarado en el cuerpo del render es un **tipo nuevo en
 * cada render**, así que React no los reconcilia: los desmonta y los vuelve a
 * montar enteros. Con cada tecla del buscador y con cada mensaje que llegaba se
 * tiraban y se rehacían todas las filas —y con ellas el `usePresence` de cada
 * una, que se reiniciaba—.
 *
 * ## Y el filtro se aplica antes de mapear
 *
 * Estaba dentro de la fila, que devolvía `null` si no casaba. Las filas se
 * montaban igual, y los encabezados «Proyectos» y «Privados» se quedaban
 * puestos sobre cero resultados.
 */
function SidebarChatList({ zonePath, plegada }: { zonePath: string; plegada: boolean }) {
  const pathname = usePathname();
  const browserPath = zonePath + (pathname === '/' ? '' : pathname);
  const gatewayPath = `${zonePath}/api/gateway`;

  /**
   * Los datos vienen del proveedor, **no de aquí**.
   *
   * ⚠️ Este componente se pinta dos veces —el `<aside>` de escritorio y el cajón
   * móvil— y el `<aside>` es `display:none` en móvil, o sea que **sigue
   * montado**. Con el estado dentro, eran dos instancias pidiendo lo mismo y la
   * del cajón arrancaba de cero con su esqueleto cada vez que se abría. Ver
   * `DirectorioDeChatsProvider`.
   */
  const { directas, deProyecto, directorio, cargando } = useDirectorioDeChats();
  const [busqueda, setBusqueda] = useState('');

  /**
   * ⚠️ **Todos los chats, de todas tus organizaciones.** Los de proyecto se
   * filtraban por la organización activa, y un mensaje de un proyecto de otra
   * organización solo se encontraba cambiando de organización primero. Una
   * conversación no es inventario del plan: es alguien esperando respuesta.
   * Ni `/me/chats` ni `/me/chats/projects` filtran en el servidor; el filtro
   * era solo este.
   */
  const termino = normalizarBusqueda(busqueda);
  const proyectosVisibles = deProyecto.filter(
    (c) => !termino || normalizarBusqueda(c.project.name).includes(termino),
  );

  const directasVisibles = directas.filter((c) => {
    if (!termino) return true;
    const peer = directorio.get(c.peerId);
    return normalizarBusqueda(peer ? personLabel(peer) : 'Alguien').includes(termino);
  });

  if (cargando) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <div className="h-11 animate-presione rounded-lg bg-white/5" />
        <div className="h-11 animate-presione rounded-lg bg-white/5" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!plegada && (
        <BuscadorDeBarra
          valor={busqueda}
          onCambiar={setBusqueda}
          placeholder="Buscar"
          etiqueta="Buscar conversaciones"
        />
      )}

      {proyectosVisibles.length > 0 && (
        <SidebarSection etiqueta="Proyectos" plegada={plegada}>
          {proyectosVisibles.map((chat) => (
            <FilaDeProyecto
              key={chat.project.id}
              chat={chat}
              autor={chat.ultimo?.authorId ? directorio.get(chat.ultimo.authorId) : undefined}
              activo={browserPath === `/chat/proyecto/${chat.project.id}`}
              plegada={plegada}
            />
          ))}
        </SidebarSection>
      )}

      {directasVisibles.length > 0 && (
        <SidebarSection etiqueta="Privados" plegada={plegada}>
          {directasVisibles.map((conversacion) => (
            <FilaDePersona
              key={conversacion.peerId}
              conversacion={conversacion}
              peer={directorio.get(conversacion.peerId)}
              activo={browserPath === `/chat/${conversacion.peerId}`}
              plegada={plegada}
              gatewayPath={gatewayPath}
            />
          ))}
        </SidebarSection>
      )}

      {/* Un buscador que no encuentra nada tiene que decirlo: con los dos grupos
          vacíos y sin esto, la pestaña se quedaba en blanco y parecía rota. */}
      {!plegada && termino && proyectosVisibles.length === 0 && directasVisibles.length === 0 && (
        <p className="px-3 py-6 text-center font-sans text-[13px] text-text-secondary">
          Ninguna conversación coincide con «{busqueda.trim()}».
        </p>
      )}
    </div>
  );
}

/**
 * La frase de una fila de la bandeja.
 *
 * ⚠️ **La tabla vive en `commons/notifications/avisos.ts`**, compartida con la
 * tarjeta emergente. Estaba duplicada aquí con otra redacción: el mismo aviso se
 * contaba distinto según lo leyeras en la tarjeta o en la fila.
 *
 * Lo único que se hace aquí es lo que sí es distinto: la fila tiene `actorId` y
 * resuelve el nombre contra el directorio; la tarjeta recibe `actorName` ya
 * resuelto por el gateway.
 */
function textoDeAviso(aviso: AppNotification, actor?: UserProfile): string {
  const legible: AvisoLegible = {
    type: aviso.type,
    quien: actor ? personLabel(actor) : aviso.actorId ? 'Alguien' : null,
    proyecto: aviso.projectName,
    tarea: aviso.taskTitle,
  };
  return describirAviso(legible);
}

/**
 * A dónde lleva una fila de la bandeja.
 *
 * ⚠️ `AppNotification` **no trae el slug** del proyecto, solo el UUID. Los dos
 * resuelven en `/projects/:idOrSlug`, así que la URL sale menos legible y
 * funciona igual; lo que no se hace es construirla a mano, que es lo que hacía
 * antes (`/projects/${n.projectId}?task=…`) y es la trampa 10 de CLAUDE.md.
 *
 * Sin destino se queda en la bandeja: un aviso de automatización ya está
 * contado aquí con su texto y su fecha, que es todo lo que hay que ver.
 */
function destinoDeUnAviso(aviso: AppNotification): string | undefined {
  return (
    destinoDeAviso({
      type: aviso.type,
      proyectoRef: aviso.projectId,
      taskId: aviso.taskId,
    }) ?? undefined
  );
}

/** Alto de la bandeja sin avisos y del esqueleto que la precede: el mismo, a propósito. */
const ALTO_VACIO = 'h-24';

/**
 * Anima el **alto** de lo que lleva dentro cuando cambia.
 *
 * Mide el contenido con un `ResizeObserver` y se lo da al contenedor como `height`
 * con una transición: pasar del esqueleto a la lista, o de la lista a «Nada
 * nuevo por aquí», se expande o se encoge en vez de saltar. El tope (`max-h`) lo
 * pone quien lo usa; con él el contenedor hace scroll y deja de crecer.
 */
function AlturaSuave({ children, className = '' }: { children: ReactNode; className?: string }) {
  const interior = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = interior.current;
    if (!el) return;
    setAlto(el.offsetHeight);
    const observador = new ResizeObserver(() => setAlto(el.offsetHeight));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      style={{ height: alto }}
      className={`transition-[height] duration-300 ease-[cubic-bezier(0.22,0.85,0.28,1)] motion-reduce:transition-none ${className}`}
    >
      <div ref={interior}>{children}</div>
    </div>
  );
}

/**
 * La bandeja de avisos, en su pestaña de la barra lateral.
 *
 * ## 🔴 Estaba siempre vacía, y el motivo era una letra
 *
 * Pedía `?limit=30&unread=true`. El DTO declara **`unreadOnly`**
 * (`contracts/src/notifications/notification.dto.ts`) y el gateway arranca con
 * `whitelist: true, forbidNonWhitelisted: true`: un campo que no reconoce no se
 * ignora, **es un 400**. Es la primera regla de «Reglas al escribir un fetch» de
 * CLAUDE.md, y aquí se incumplió por un nombre.
 *
 * Y el 400 se tragaba entero: `body?.data?.items || []` sobre un cuerpo de error
 * da lista vacía, así que la pestaña decía «Nada nuevo por aquí» con la bandeja
 * llena. «Sin leer» es la vista por defecto, o sea que era el caso normal.
 *
 * ⚠️ De ahí que ahora use `createApiClient`: desenvuelve `{ success, data,
 * meta }` y **lanza** un `ApiError` en vez de devolver un objeto que se lee como
 * una lista vacía. Con `fetch` a pelo, este fallo no tiene síntoma.
 *
 * ## Y no se enteraba de nada
 *
 * No tenía ni `useLiveEvent('aviso')` ni `useReconnection`: un aviso que llegaba
 * con la pestaña abierta sacaba su tarjeta emergente —`LiveNotices` sí escucha—
 * y no aparecía en la lista de debajo. Ahora escucha las dos cosas.
 *
 * ## Marcar leído
 *
 * Pulsar una fila navegaba y dejaba el aviso sin leer, así que la insignia no
 * bajaba nunca. Se marca antes de navegar y se avisa a la insignia
 * (`avisarDeAvisosLeidos`), que vuelve a preguntar en vez de restar a ciegas:
 * restar aquí sería adivinar, y adivinar en un contador acaba en insignias que
 * no se apagan.
 */
export function SidebarInboxList({
  zonePath,
  plegada,
  className = '',
  movil = false,
}: {
  zonePath: string;
  plegada: boolean;
  /** El tope de alto: en el popover de la campana es otro que en una pestaña. */
  className?: string;
  /**
   * La pantalla «Avisos» de móvil (`/main/notifications`, M8 de
   * `docs/PLAN-MOVIL.md`): el selector pegado arriba, filas y letra para el
   * dedo, y sin tope de alto —desplaza la pantalla, no la lista—.
   */
  movil?: boolean;
}) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [directorio, setDirectorio] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const api = useMemo(
    () => createApiClient({ gatewayPath: `${zonePath}/api/gateway` }),
    [zonePath],
  );

  const cargar = useCallback(() => {
    /* ⚠️ `unreadOnly`, no `unread`. Ver la cabecera de este componente. */
    const filtro = mostrarTodos ? '' : '&unreadOnly=true';
    api
      .get<NotificationPage>(`/me/notifications?limit=30${filtro}`)
      .then(async (pagina) => {
        setItems(pagina.items);

        const ids = [
          ...new Set(pagina.items.map((n) => n.actorId).filter((id): id is string => !!id)),
        ];
        if (ids.length === 0) return;

        /* Los nombres son decoración: si el directorio falla, las filas salen
           con «Alguien» y la bandeja se lee igual. */
        const perfiles = await api
          .get<Paginated<UserProfile>>(`/users?ids=${ids.join(',')}`)
          .catch(() => null);
        setDirectorio(new Map((perfiles?.items ?? []).map((u: UserProfile) => [u.id, u])));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [api, mostrarTodos]);

  useEffect(() => {
    setLoading(true);
    cargar();
  }, [cargar]);

  /* Un aviso nuevo entra en la lista sin recargar nada. Antes solo se enteraba
     al alternar «Sin leer / Todos». */
  useLiveEvent('aviso', () => cargar());
  useReconnection(cargar);

  /**
   * Marca leído y sigue.
   *
   * No se espera a la respuesta para navegar: el aviso ya está leído en cuanto
   * se pulsa, y hacer esperar a alguien por un `PATCH` cosmético es peor que
   * arriesgarse a que falle —si falla, sigue sin leer y se ve al recargar—.
   */
  function alPulsar(aviso: AppNotification) {
    if (aviso.readAt) return;
    setItems((previos) =>
      previos.map((n) => (n.id === aviso.id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    api
      .patch(`/me/notifications/${aviso.id}/read`, {})
      .then(() => avisarDeAvisosLeidos())
      .catch(() => undefined);
  }

  /* ⚠️ Mide **lo mismo que el estado vacío** (`ALTO_VACIO`): antes eran tres filas
     de 48 px y, al terminar de cargar sin avisos, el flotante pegaba un salto de
     golpe de una altura a la otra. */
  const loader = (
    <div className={`flex flex-col justify-center gap-2.5 px-4 ${ALTO_VACIO}`} aria-hidden="true">
      <div className="h-3 w-3/4 animate-presione rounded bg-white/5" />
      <div className="h-3 w-1/2 animate-presione rounded bg-white/5" />
    </div>
  );

  return (
    <div className="flex flex-col">
      {!plegada && (
        <div
          className={
            movil
              ? 'sticky top-0 z-10 -mx-4 -mt-4 mb-2 bg-surface/95 px-4 pb-2 pt-3 backdrop-blur-md'
              : 'contents'
          }
        >
          <div
            className={`flex shrink-0 rounded-lg bg-white/5 p-0.5 ${
              movil ? '[&>button]:min-h-9 [&>button]:text-[13px]' : 'mx-3 mb-3'
            }`}
          >
            <button
              type="button"
              onClick={() => setMostrarTodos(false)}
              className={`flex-1 rounded-md py-1.5 font-sans text-[11px] font-medium transition-colors ${
                !mostrarTodos
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-text-secondary hover:bg-white/5 hover:text-white'
              }`}
            >
              Sin leer
            </button>
            <button
              type="button"
              onClick={() => setMostrarTodos(true)}
              className={`flex-1 rounded-md py-1.5 font-sans text-[11px] font-medium transition-colors ${
                mostrarTodos
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-text-secondary hover:bg-white/5 hover:text-white'
              }`}
            >
              Todos
            </button>
          </div>
        </div>
      )}

      <AlturaSuave className={movil ? '' : `scrollbar-none overflow-y-auto ${className}`}>
        <div className={`flex flex-col gap-1 pb-4 ${movil ? '' : 'px-1'}`}>
          {loading ? (
            loader
          ) : items.length === 0 ? (
            <div
              className={`flex items-center justify-center px-4 text-center font-sans text-[13px] text-text-secondary ${ALTO_VACIO}`}
            >
              {mostrarTodos ? 'No tienes avisos.' : 'Nada nuevo por aquí.'}
            </div>
          ) : (
            items.map((aviso) => {
              const actor = aviso.actorId ? directorio.get(aviso.actorId) : undefined;
              const sinLeer = !aviso.readAt;
              return (
                <Link
                  key={aviso.id}
                  /**
                   * ⚠️ `?? '#'`, y no estaba antes.
                   *
                   * `destinoDeUnAviso` devuelve `undefined` para los avisos que no
                   * llevan a ninguna parte —los que no traen proyecto—, y un `<a>`
                   * sin `href` es válido: se pinta como texto y no navega. `Link`
                   * exige una URL, así que se le da una que no sale de aquí. El
                   * comportamiento es el mismo; lo que cambia es el tipo. */
                  href={destinoDeUnAviso(aviso) ?? '#'}
                  onClick={() => alPulsar(aviso)}
                  className={`relative flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-white/5 ${
                    movil ? 'active:bg-white/10' : ''
                  } ${sinLeer ? 'bg-white/[0.04]' : ''}`}
                >
                  {!plegada && (
                    /**
                     * El mismo `Avatar` que el tablero y la ficha de la barra, no
                     * un círculo dibujado aquí.
                     *
                     * ⚠️ **Sin foto pintaba UNA sola letra**, mientras que el
                     * resto del producto pinta dos: la misma persona salía como
                     * «A» en la bandeja y «AT» en su tarea, que es aprenderse dos
                     * veces lo mismo. `Avatar` ya trae la regla de iniciales, el
                     * repliegue cuando la foto no carga y el tono de «eres tú»;
                     * copiarla aquí era garantizar que divergieran.
                     */
                    <Avatar
                      size="base"
                      label={actor ? personLabel(actor) : 'Sistema'}
                      src={avatarHref(actor?.avatarUrl, `${zonePath}/api/gateway`)}
                      className="shrink-0"
                    />
                  )}
                  <div className={`flex min-w-0 flex-1 flex-col ${plegada ? 'hidden' : ''}`}>
                    {/* Sin leer pesa más y va en blanco; leído baja a secundario.
                      Los dos decían `text-white`: el ternario existía y devolvía
                      lo mismo en las dos ramas desde el rediseño monocromo. */}
                    <p
                      className={`line-clamp-2 [overflow-wrap:anywhere] font-sans leading-snug ${
                        movil ? 'text-[14px]' : 'text-[12px]'
                      } ${sinLeer ? 'font-medium text-white' : 'text-text-secondary'}`}
                    >
                      {textoDeAviso(aviso, actor)}
                    </p>
                    <span
                      className={`mt-1 font-sans text-text-secondary ${
                        movil ? 'text-[12px]' : 'text-[10px]'
                      }`}
                    >
                      {new Date(aviso.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {sinLeer && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })
          )}
        </div>
      </AlturaSuave>
    </div>
  );
}
