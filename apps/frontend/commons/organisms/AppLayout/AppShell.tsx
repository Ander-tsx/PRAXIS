'use client';

import { Columns3, File, Folder, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
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
import {
  ABRIR_BANDEJA_EVENT,
  type AvisoLegible,
  describirAviso,
  destinoDeAviso,
} from '../../notifications/avisos';
import { LivePresences, LiveSource, useLiveEvent, useReconnection } from '../../realtime';
import { usePresence } from '../../realtime/presence';
import { useMessageCount } from '../../realtime/useMessageCount';
import { avisarDeAvisosLeidos, useNoticeCount } from '../../realtime/useNoticeCount';
import { alpha, colors } from '../../tokens';
import { KylooWordmark } from '../KylooWordmark';
import { CrearEnProyecto, type TipoDeEspacio } from './CrearEnProyecto';
import { DirectorioDeChatsProvider, useDirectorioDeChats } from './DirectorioDeChats';
import { MenuDeContenido } from './MenuDeContenido';
import { DockColumn, DockProvider } from './DockPanel';
import { NavList } from './NavList';
import { OrgSwitcher } from './OrgSwitcher';
import { PraxProvider } from './PraxWindow';
import type { AppNavItem } from './navigation';

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
  /**
   * La fila «Nuevo proyecto» de «Inicio». La pone el `layout.tsx` porque el
   * formulario vive en `web` (acción de servidor) y `commons` no puede importarlo.
   */
  nuevoProyectoSlot?: ReactNode;
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
  openMenu: () => void;
  plegada: boolean;
} | null>(null);

/** Lo usa `AppHeader` para su botón de menú en móvil. */
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
              <ArmazonInterno {...props} />
            </PraxProvider>
          </DockProvider>
        </DirectorioDeChatsProvider>
      </LivePresences>
    </LiveSource>
  );
}

function ArmazonInterno({
  navItems,
  zonePath,
  user,
  estadoSlot,
  plegadaInicial = false,
  pestanaInicial = 'home',
  organizaciones,
  organizacionActivaId,
  mensajesSinLeer: mensajesIniciales = 0,
  avisosSinLeer: avisosIniciales = 0,
  nuevoProyectoSlot,
  perfilSlot,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const browserPath = zonePath + (pathname === '/' ? '' : pathname);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /* Navegar desde el árbol de proyectos del cajón móvil no pasa por `onNavigate`:
     se cierra cuando cambia la ruta. */
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);
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
   * Si el contenido del cajón móvil está montado.
   *
   * ## 🔴 Por qué no basta con `mobileMenuOpen`
   *
   * El cajón se **monta siempre** para poder animar su salida con `transform`
   * (ver su bloque). Pero dentro van `SidebarChatList` y `SidebarInboxList`, que
   * no son marcado: son **suscripciones que piden datos al montarse**. Dejarlos
   * montados sin más significaría que en un escritorio —donde el cajón está
   * `md:hidden` y nunca se abre— esas listas se montan igual, duplicando cada
   * petición del directorio de chats y cada suscripción al flujo.
   *
   * `display:none` no salva de eso: esconde, no desmonta.
   *
   * Así que el contenedor vive siempre y el **contenido** solo mientras hace
   * falta: desde que se abre hasta que termina de salir. El retardo es el de la
   * transición; sin él, al cerrar se vería un panel vacío deslizándose.
   */
  const [cajonMontado, setCajonMontado] = useState(false);

  useEffect(() => {
    if (mobileMenuOpen) {
      setCajonMontado(true);
      return;
    }
    /* Espejo de `duration-200` de la transición. Si allí cambia, aquí también:
       de más deja las listas pidiendo datos de balde, y de menos vacía el panel
       antes de que termine de irse. */
    const t = window.setTimeout(() => setCajonMontado(false), 200);
    return () => window.clearTimeout(t);
  }, [mobileMenuOpen]);

  /**
   * Abrir la bandeja desde fuera del armazón.
   *
   * ⚠️ **La bandeja ya no tiene URL.** Cuando era una pantalla, la tarjeta de un
   * aviso de automatización navegaba a `/main#avisos`; al pasar a pestaña, ese
   * destino se quedó apuntando a una ruta que hoy redirige a la lista de
   * proyectos. Ver `destinoDeAviso`.
   *
   * En móvil hay que abrir además el cajón: es donde viven las pestañas cuando
   * no hay barra lateral.
   */
  useEffect(() => {
    function abrir() {
      setBandejaAbierta(true);
      if (window.matchMedia('(max-width: 767px)').matches) setMobileMenuOpen(true);
    }
    window.addEventListener(ABRIR_BANDEJA_EVENT, abrir);
    return () => window.removeEventListener(ABRIR_BANDEJA_EVENT, abrir);
  }, []);
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

  function alternarPliegue() {
    const siguiente = !plegada;
    setPlegada(siguiente);
    /* Se escribe desde el cliente: no hace falta una Server Action para una
       preferencia de tamaño, y así el cambio es inmediato. `path=/` para que
       las cinco zonas la vean — sin eso, plegarla aquí no la pliega allí. */
    document.cookie = `${SIDEBAR_COOKIE}=${siguiente ? '1' : '0'}; path=/; max-age=${UN_ANO}; samesite=lax`;
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
    <AppShellContext.Provider value={{ openMenu: () => setMobileMenuOpen(true), plegada }}>
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
      <div className="flex h-dvh overflow-hidden bg-[#191919] font-sans text-text-primary">
        {/* ── Barra lateral (escritorio) ───────────────────────── */}
        <aside
          className={`hidden shrink-0 flex-col border-r border-border bg-[#202020] transition-[width] duration-200 md:flex ${
            plegada ? 'w-[4.5rem]' : 'w-80'
          }`}
        >
          {/* El pliegue vive **en la cabecera, al lado de la marca**: es donde
              se busca por costumbre, y ahí no compite con «Cerrar sesión», que
              era el vecino que tenía abajo y con el que se podía confundir. */}
          {/**
           * Plegada, la marca **no está**: no se encoge a una inicial.
           *
           * Estuvo como una «P» suelta y no funcionaba — una letra sola en una
           * columna de iconos se lee como un icono más, no como la marca, y
           * encima competía por el sitio con el botón. Quien está dentro de la
           * aplicación ya sabe en qué aplicación está; el logotipo es para la
           * landing y para la pantalla de entrada.
           *
           * Lo que queda es el botón, centrado, que es lo único accionable de
           * esta franja cuando está plegada.
           */}
          <div
            className={`flex items-center border-b border-border ${
              plegada ? 'h-16 justify-center px-0' : 'h-16 justify-between px-6'
            }`}
          >
            {!plegada && (
              <div className="flex items-baseline gap-2">
                <Wordmark />
                <ByKyloo />
              </div>
            )}
            <BotonDePliegue plegada={plegada} onClick={alternarPliegue} />
          </div>

          {/* ⚠️ Selector y pestañas **fuera** del scroll: solo se desplaza el contenido de la pestaña. */}
          <div
            className={`flex min-h-0 flex-1 flex-col pt-2 ${plegada ? 'px-2' : 'px-4'}`}
          >
            <div className="mb-4">
              <OrgSwitcher
                name={user.name}
                plegada={plegada}
                organizaciones={organizaciones}
                activaId={organizacionActivaId ?? null}
                zonePath={zonePath}
              />
            </div>

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
              ninguna={perfilAbierto}
              mensajesSinLeer={mensajesSinLeer}
              plegada={plegada}
            />
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
            <div className={activeTab === 'home' && !perfilAbierto ? 'flex flex-col gap-4' : 'hidden'}>
              <SidebarProjectsTree
                zonePath={zonePath}
                plegada={plegada}
                activePath={activePathConConsulta}
                organizacionActivaId={organizacionActivaId ?? null}
                accionNueva={nuevoProyectoSlot}
              />
              <NavList
                navItems={navItems.filter((i) => i.href === '/assistant')}
                sinEtiquetas
                activePath={activePathDeSecciones}
                plegada={plegada}
              />
            </div>
            <div className={activeTab === 'chat' && !perfilAbierto ? undefined : 'hidden'}>
              <SidebarChatList
                zonePath={zonePath}
                plegada={plegada}
                organizacionActivaId={organizacionActivaId ?? null}
              />
            </div>
            <div className={activeTab === 'settings' && !perfilAbierto ? undefined : 'hidden'}>
              <NavList
                navItems={navItems.filter((i) => esDeConfiguracion(i.href))}
                activePath={activePathDeSecciones}
                plegada={plegada}
              />
            </div>
            {perfilAbierto && !plegada && perfilSlot}
            </div>
          </div>

          <div className={`relative border-t border-border ${plegada ? 'p-2' : 'p-4'}`}>
            {/* Plegada, la tarjeta de usuario se queda en el avatar: el nombre y
                el correo no caben, y el avatar ya identifica de quién es la
                sesión, que es lo que esa tarjeta viene a decir. */}
            {plegada ? (
              /* Plegada, el enlace y el selector siguen siendo hermanos por lo
                 mismo que desplegada: un botón dentro de un enlace no vale. */
              <div
                className={`mb-2 flex justify-center rounded-full p-1 transition-colors hover:bg-white/5 ${
                  enCuenta ? 'bg-white/5' : ''
                }`}
              >
                <span className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      alternarPliegue();
                      setPerfilAbierto(true);
                    }}
                    aria-pressed={enCuenta}
                    className="block"
                    title={`${user.name.trim() || user.email} — tu perfil`}
                  >
                    {/* Sin `presence`: el punto lo pinta `estadoSlot`, que
                        además se puede pulsar. Ver el aviso de esa prop. */}
                    <Avatar
                      label={user.name.trim() || user.email}
                      mine
                      size="md"
                      src={user.avatarSrc ?? null}
                    />
                  </button>
                  {estadoSlot && <span className="absolute bottom-0 right-0">{estadoSlot}</span>}
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <UserCard
                    user={user}
                    activa={enCuenta}
                    estadoSlot={estadoSlot}
                    onAbrir={() => setPerfilAbierto((v) => !v)}
                  />
                </div>
                {/* Solo el icono, a un lado del avatar: es la sección de avisos. */}
                <BandejaBoton
                  abierta={bandejaAbierta}
                  onCambiar={setBandejaAbierta}
                  sinLeer={avisosSinLeer}
                  zonePath={zonePath}
                />
              </div>
            )}
            {plegada && (
              <div className="flex justify-center">
                <BandejaBoton
                  abierta={bandejaAbierta}
                  onCambiar={setBandejaAbierta}
                  sinLeer={avisosSinLeer}
                  zonePath={zonePath}
                  plegada
                />
              </div>
            )}
          </div>
        </aside>

        {/* ── Contenido ────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>

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
         * ── Cajón lateral (móvil) ──────────────────────────────
         *
         * ## Ocupa la pantalla entera, y entra animado
         *
         * Era una columna de `w-64` sobre un velo, que aparecía y desaparecía de
         * golpe: `{mobileMenuOpen && …}` monta y desmonta, así que no hay estado
         * de salida al que animar. En un teléfono, 256 px para un menú que
         * ahora lleva **el árbol de proyectos, el directorio de chats y la
         * bandeja** era la mitad de lo que hace falta para leer una fila.
         *
         * ⚠️ **Se monta siempre y se traslada con `transform`**, no se
         * condiciona. Es lo que permite animar la salida —el nodo sigue ahí
         * mientras se va— y además lo que hace que la transición corra en el
         * compositor: animar `left` o `width` obliga a recalcular la
         * maquetación en cada fotograma y en un teléfono se ve.
         *
         * `inert` cuando está cerrado: fuera del flujo del foco y del lector de
         * pantalla. Sin él, un menú «invisible» a la derecha del viewport sigue
         * siendo tabulable, que es el fallo clásico de este patrón.
         *
         * `motion-reduce:transition-none` porque un panel de pantalla completa
         * deslizándose es justo lo que molesta a quien pide menos movimiento; el
         * cambio instantáneo ahí es correcto, no un defecto.
         */}
        <div
          className={`fixed inset-0 z-50 md:hidden ${mobileMenuOpen ? '' : 'pointer-events-none'}`}
          inert={!mobileMenuOpen}
        >
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileMenuOpen(false)}
            className={`fixed inset-0 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
              mobileMenuOpen ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: alpha(colors.overlay, 80) }}
            tabIndex={mobileMenuOpen ? 0 : -1}
          />

          <div
            className={`fixed inset-0 z-10 flex w-full flex-col justify-between bg-[#202020] p-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${
              mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {/* Solo mientras hace falta: ver `cajonMontado`. Sin esto, las listas
                de dentro se montarían y pedirían datos también en escritorio. */}
            {cajonMontado && (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-baseline gap-2 mt-1">
                    <Wordmark />
                    <ByKyloo />
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Cerrar menú"
                    className="rounded-md p-1 text-white transition-colors hover:text-text-primary"
                  >
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-col gap-4 flex-1 min-h-0 mb-6">
                  <OrgSwitcher
                    name={user.name}
                    plegada={false}
                    organizaciones={organizaciones}
                    activaId={organizacionActivaId ?? null}
                    zonePath={zonePath}
                  />

                  {/**
                   * 🔴 **Las tres pestañas, también aquí.**
                   *
                   * Este cajón tenía solo `NavList`, y las pestañas —con el
                   * directorio de chats y la bandeja dentro— viven en el `<aside
                   * hidden … md:flex>`, o sea **solo en escritorio**. Sumado a que
                   * `ac4caf1` borró la entrada `/chat` de la lista canónica, el
                   * resultado era que desde un teléfono no había **un solo enlace
                   * hacia una conversación** en toda la aplicación: ni en el menú,
                   * ni en el cajón, ni en ninguna pantalla.
                   *
                   * Comparte estado (`activeTab`) con la barra de escritorio a
                   * propósito: es la misma preferencia de la misma persona, y ya
                   * se guarda en `localStorage`.
                   */}
                  <SidebarTabs
                    activa={activeTab}
                    onCambiar={(t) => {
                setActiveTab(t);
                setPerfilAbierto(false);
              }}
              ninguna={perfilAbierto}
                    mensajesSinLeer={mensajesSinLeer}
                  />

                  <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
                  {/* Aquí sí se monta y se desmonta, al revés que en el escritorio:
                    el cajón entero solo existe mientras está abierto, así que
                    las suscripciones de estas listas ya viven en la barra de
                    escritorio cuando la hay, y en un teléfono no hay ninguna
                    barra que mantener viva por detrás. */}
                  {!perfilAbierto && activeTab === 'home' && (
                    <div className="flex flex-col gap-4">
                      {/* 🔴 El árbol de proyectos **también en móvil**: este cajón solo tenía el
                          enlace «Proyectos» de la lista, y al dejar Inicio con solo el
                          asistente se quedó sin ninguna puerta a los proyectos. */}
                      <SidebarProjectsTree
                        zonePath={zonePath}
                        plegada={false}
                        activePath={activePathConConsulta}
                        organizacionActivaId={organizacionActivaId ?? null}
                        accionNueva={nuevoProyectoSlot}
                      />
                    <NavList
                      navItems={navItems.filter((i) => i.href === '/assistant')}
                      sinEtiquetas
                      activePath={activePathDeSecciones}
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                    </div>
                  )}
                  {!perfilAbierto && activeTab === 'settings' && (
                    <NavList
                      navItems={navItems.filter((i) => esDeConfiguracion(i.href))}
                      activePath={activePathDeSecciones}
                      onNavigate={() => setMobileMenuOpen(false)}
                    />
                  )}
                  {!perfilAbierto && activeTab === 'chat' && (
                    <SidebarChatList
                      zonePath={zonePath}
                      plegada={false}
                      organizacionActivaId={organizacionActivaId ?? null}
                    />
                  )}
                  {perfilAbierto && perfilSlot}
                  </div>
                </div>

                <div className="relative border-t border-border pt-4">
                  <div className="flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      <UserCard
                    user={user}
                    activa={enCuenta}
                    estadoSlot={estadoSlot}
                    onAbrir={() => setPerfilAbierto((v) => !v)}
                  />
                    </div>
                    <BandejaBoton
                      abierta={bandejaAbierta}
                      onCambiar={setBandejaAbierta}
                      sinLeer={avisosSinLeer}
                      zonePath={zonePath}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShellContext.Provider>
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
      className={`mb-3 flex items-center gap-3 rounded-full p-1 transition-colors hover:bg-white/5 ${
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
 * El mismo logotipo que navbar/footer de la landing — `var(--font-grotesk)`
 * (Archivo 800), no `font-display` (Redaction 50, la voz del resto de la
 * app): el nombre de Praxis es una marca, no un titular, y las dos zonas
 * donde aparece tienen que decir lo mismo. Morado (`text-primary`) porque
 * aquí, a diferencia de la landing, la aplicación sí tiene color de marca.
 */
function Wordmark() {
  return (
    <span
      className="select-none text-2xl font-extrabold tracking-tight text-primary"
      style={{ fontFamily: 'var(--font-grotesk)' }}
    >
      Praxis
    </span>
  );
}

/**
 * "By Kyloo" — el mismo lettermark real que el cierre del footer de la
 * landing y `AuthPanel` (`kyloo-design/SKILL.md` §8, §12), a escala de
 * esquina de barra lateral. Cada zona que monta `AppShell` tiene que cargar
 * Archivo y Khteka en su propio `layout.tsx` — sin la variable, el texto cae
 * a su *fallback* en silencio, no revienta.
 */
function ByKyloo() {
  return (
    <span className="flex items-baseline gap-1.5 text-white">
      <span className="font-mono text-xs uppercase tracking-[0.18em]">By</span>
      {/**
       * El lettermark **lleva a kyloo.com.mx**, y solo él: «By» se queda fuera
       * del enlace porque es la preposición de la frase, no parte de la marca.
       *
       * ⚠️ `noopener` no es opcional: sin él la página que se abre recibe un
       * `window.opener` con el que puede redirigir la nuestra. Es la misma regla
       * que `CheckoutButton` al abrir el portal de Stripe.
       *
       * Es un `<a>` y no un `Link` de Next a propósito: sale de la aplicación,
       * así que no hay nada que prefetchear ni ninguna ruta que resolver.
       */}
      <a
        href="https://kyloo.com.mx"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Kyloo — abre kyloo.com.mx en una pestaña nueva"
        title="kyloo.com.mx"
        className="inline-flex rounded-sm opacity-100 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <KylooWordmark className="h-3.5 w-auto translate-y-[3.5px]" />
      </a>
    </span>
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
 * Vive en la cabecera junto a la marca. Es un icono de paneles —no una flecha
 * suelta— porque una flecha en un borde se lee como «atrás»; dos rectángulos con
 * uno estrecho dicen de qué va sin necesidad de leer nada.
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
      title={plegada ? 'Desplegar' : 'Plegar'}
      className="shrink-0 cursor-pointer rounded-md p-1.5 text-white transition-colors hover:bg-white/5 hover:text-text-primary"
    >
      <svg
        className="h-4 w-4"
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
  const ref = useRef<HTMLDivElement>(null);
  /* `visible` es si está montado; `entrada`, si está en su sitio. Son dos para
     poder animar las dos direcciones: al abrir se monta y **un fotograma después**
     se pone en su sitio (si no, nace ya en destino y no hay transición); al
     cerrar se saca primero y se desmonta cuando termina — espejo de
     `duration-300`. Como el efecto «génie» del Dock de macOS: el panel nace
     encogido **desde la campana** (de ahí el `origin-*`) y crece hasta su sitio; al
     cerrar vuelve a ser absorbido por ella. */
  const [visible, setVisible] = useState(false);
  const [entrada, setEntrada] = useState(false);

  useEffect(() => {
    const enPantalla = (ref.current?.getClientRects().length ?? 0) > 0;
    if (abierta && enPantalla) {
      setVisible(true);
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setEntrada(true)));
      return () => cancelAnimationFrame(f);
    }
    setEntrada(false);
    const t = window.setTimeout(() => setVisible(false), 320);
    return () => window.clearTimeout(t);
  }, [abierta]);

  useEffect(() => {
    const enPantalla = (ref.current?.getClientRects().length ?? 0) > 0;
    if (!abierta || !enPantalla) return;

    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCambiar(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onCambiar(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierta, onCambiar]);

  /* `mt-1`: la tarjeta de usuario mide 48 px y la campana 40; empezar arriba la
     dejaba por encima del nombre y del avatar. */
  return (
    <div ref={ref} className={plegada ? 'shrink-0' : 'mt-1 shrink-0'}>
      <button
        type="button"
        onClick={() => onCambiar(!abierta)}
        aria-expanded={abierta}
        aria-haspopup="dialog"
        aria-label={sinLeer > 0 ? `Avisos, ${sinLeer} sin leer` : 'Avisos'}
        title="Avisos"
        className={`relative flex items-center justify-center rounded-full p-2.5 text-white transition-colors hover:bg-white/5 ${
          abierta ? 'bg-white/10' : ''
        }`}
      >
        <svg
          className="h-5 w-5"
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
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-[#202020]" />
        )}
      </button>

      {visible && (
        <div
          role="dialog"
          aria-label="Avisos"
          className={`absolute z-50 rounded-2xl border border-border bg-[#252525] py-3 shadow-xl transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            plegada
              ? 'bottom-0 left-full ml-2 w-80 origin-bottom-left'
              : 'bottom-full left-2 right-2 mb-2 origin-bottom-right'
          } ${
            entrada
              ? 'scale-100 opacity-100'
              : 'pointer-events-none scale-[0.08] opacity-0'
          }`}
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
      className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-primary px-1 py-px text-center font-sans text-[9px] font-semibold leading-tight text-primary-foreground ring-2 ring-[#202020]"
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
  ninguna = false,
  plegada = false,
}: {
  activa: SidebarTab;
  /** Con el perfil abierto ninguna pestaña está puesta. */
  ninguna?: boolean;
  onCambiar: (tab: SidebarTab) => void;
  mensajesSinLeer: number;
  /** Plegada: solo los iconos, en columna, y la insignia se reduce a un punto. */
  plegada?: boolean;
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
          ? 'mb-4 flex shrink-0 flex-col items-center gap-1'
          : '-mt-2 mb-4 flex shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap pt-2 scrollbar-none'
      }
    >
      {pestanas.map((pestana) => {
        const puesta = activa === pestana.id && !ninguna;
        return (
          <button
            key={pestana.id}
            type="button"
            role="tab"
            aria-selected={puesta}
            onClick={() => onCambiar(pestana.id)}
            /* Plegada, la etiqueta se va y hace falta un `title`: un icono solo
               no dice qué es, y aquí no hay texto al lado que lo explique. */
            title={plegada ? pestana.etiqueta : undefined}
            className={`flex shrink-0 items-center font-sans text-[12px] font-semibold transition-colors ${
              plegada
                ? 'relative justify-center rounded-lg p-2'
                : 'gap-1 rounded-full px-2.5 py-1.5'
            } ${
              puesta
                ? 'bg-white/10 text-white'
                : 'text-text-secondary hover:bg-white/5 hover:text-white'
            }`}
          >
            {/* ⚠️ La fila lleva `pt-2` (y `-mt-2` para no moverla): `overflow-x-auto` recorta
                también en vertical y cortaba por arriba la burbuja del contador. */}
            {/* La insignia va **sobre el icono**, no al lado: inline ensanchaba la pestaña
                y «Configuraciones» se salía por el borde de la barra. */}
            <span className="relative inline-flex">
              <svg
                className="h-4 w-4"
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
                  className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"
                  aria-label={`${pestana.insignia} sin leer`}
                />
              )
            ) : (
              pestana.etiqueta
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

function SidebarProjectsTree({
  zonePath,
  plegada,
  activePath,
  organizacionActivaId,
  accionNueva,
}: {
  zonePath: string;
  plegada: boolean;
  activePath: string;
  organizacionActivaId: string | null;
  /** El «+» discreto del encabezado de la sección. Lo pone el layout: ver `nuevoProyectoSlot`. */
  accionNueva?: ReactNode;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<SidebarProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => desplegadosGuardados());
  /** El proyecto en el que se está creando algo desde la barra, si hay uno. */
  const [creandoEn, setCreandoEn] = useState<string | null>(null);
  /** Si se pulsó el «+» de un espacio: qué crear y dónde, ya elegido. */
  const [presetDeCrear, setPresetDeCrear] = useState<{
    que: 'documento' | 'tablero';
    espacioId: string;
  } | null>(null);
  /**
   * Los espacios abiertos o cerrados **por decisión de quien usa la barra**.
   * Sin decisión, un espacio está cerrado salvo que tenga dentro lo que se está
   * mirando: así el árbol ocupa poco y aun así enseña dónde estás.
   */
  const [espaciosAbiertos, setEspaciosAbiertos] = useState<Map<string, boolean>>(new Map());

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
      .filter((p) => expanded.has(p.id) && !espaciosPedidos.current.has(p.id))
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
  }, [projects, expanded, zonePath]);

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

  if (loading) {
    return (
      <div className="flex flex-col gap-1 px-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (projects.length === 0 && !plegada) {
    return (
      <div className="px-3 py-1">
        <div className="-mx-3 mb-1.5 border-t border-border" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white select-none block mb-1">
          Proyectos
        </span>
        <Link
          href="/projects"
          className="flex items-center gap-2 text-text-secondary hover:text-white text-[12px] py-1 transition-colors"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Crear primer proyecto
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Raya fina encima de la sección, igual que las de `NavList`. */}
      <div
        className={`${plegada ? 'mx-1' : ''} mb-1.5 border-t border-border`}
        aria-hidden="true"
      />
      {!plegada && (
        <div className="flex items-center justify-between px-3 mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white select-none">
            Proyectos
          </span>
          <span className="flex items-center gap-0.5">
          {accionNueva}
          <Link
            href="/projects"
            title="Ver todos los proyectos"
            className="rounded p-0.5 text-text-secondary hover:text-white transition-colors"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
          </Link>
          </span>
        </div>
      )}

      <nav aria-label="Proyectos" className="flex flex-col">
        {projects.map((project) => {
          const isOpen = expanded.has(project.id);
          // Las URLs de proyecto usan el SLUG, no el id
          const projectHref = `/projects/${project.slug}`;
          const isActiveProject =
            activePath === projectHref ||
            activePath.startsWith(`${projectHref}?`) ||
            activePath.startsWith(`${projectHref}/`);

          if (plegada) {
            return (
              <Link
                key={project.id}
                href={projectHref}
                title={project.name}
                aria-current={isActiveProject ? 'page' : undefined}
                className={`flex justify-center py-1 rounded-lg transition-colors hover:bg-white/[0.06] ${isActiveProject ? 'bg-white/10' : ''}`}
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
          }

          return (
            <div key={project.id} className="flex flex-col">
              <div
                className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.06] ${isActiveProject ? 'bg-white/10' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggleProject(project.id)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Colapsar ${project.name}` : `Expandir ${project.name}`}
                  className="flex shrink-0 items-center justify-center w-4 h-4 rounded text-text-secondary hover:text-white transition-colors"
                >
                  <ChevronIcon open={isOpen} />
                </button>

                <span className="flex h-7 w-7 shrink-0 items-center justify-center [&>*]:shrink-0 [&>*]:scale-[0.82]">
                  <ProjectMonogram
                    id={project.id}
                    name={project.name}
                    iconKey={project.iconKey}
                    imageUrl={project.imageUrl}
                    color={project.color}
                  />
                </span>

                <Link
                  href={projectHref}
                  className={`flex-1 min-w-0 truncate text-[13px] transition-colors ${
                    isActiveProject
                      ? 'text-white font-semibold'
                      : 'text-white font-medium opacity-75 hover:opacity-100'
                  }`}
                >
                  {project.name}
                </Link>

                {/* Crear sin entrar al proyecto: documento, tablero o espacio. */}
                <button
                  type="button"
                  onClick={() => {
                    /* Los espacios se piden al desplegar; el formulario los
                       necesita para ofrecer dónde crear. */
                    refrescarProyecto(project.id);
                    setCreandoEn(project.id);
                  }}
                  aria-label={`Nuevo en ${project.name}`}
                  title="Nuevo documento, tablero o espacio"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 ${
                    isActiveProject ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <div
                className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,0.85,0.28,1)]"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div
                  className="min-h-0 overflow-hidden"
                  style={{ opacity: isOpen ? 1 : 0, transition: 'opacity 200ms' }}
                >
                  <div className="flex flex-col gap-1 pl-7 pb-1.5 pt-1">
                    {project.workspaces.length === 0 ? (
                      <span className="px-2 py-1 text-[12px] text-white italic select-none">
                        Sin espacios
                      </span>
                    ) : (
                      project.workspaces.map((ws) => {
                        // URL correcta: /projects/{slug}?tab=espacios&ws={wsId}
                        const wsHref = `/projects/${project.slug}?tab=espacios&ws=${ws.id}`;
                        const isActiveWs = activePath.includes(`ws=${ws.id}`);
                        const Icono = Folder;
                        const wsAbierto = espaciosAbiertos.get(ws.id) ?? isActiveWs;
                        return (
                          <div key={ws.id} className="flex flex-col gap-1">
                            <div
                              className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${
                                isActiveWs
                                  ? 'bg-white/10 text-white font-medium'
                                  : 'text-text-secondary hover:text-white hover:bg-white/[0.06]'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setEspaciosAbiertos((previos) =>
                                    new Map(previos).set(ws.id, !wsAbierto),
                                  )
                                }
                                aria-expanded={wsAbierto}
                                aria-label={wsAbierto ? `Colapsar ${ws.name}` : `Expandir ${ws.name}`}
                                className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:text-white"
                              >
                                <ChevronIcon open={wsAbierto} />
                              </button>
                              <Link
                                href={wsHref}
                                aria-current={isActiveWs ? 'page' : undefined}
                                className="flex min-w-0 flex-1 items-center gap-2 py-[6px] pr-1 text-[13px]"
                              >
                                <Icono className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                                <span className="truncate">{ws.name}</span>
                              </Link>
                              <MenuDeContenido
                                projectId={project.id}
                                gatewayPath={`${zonePath}/api/gateway`}
                                activo={isActiveWs}
                                onCambiado={() => refrescarProyecto(project.id)}
                                alEliminar={() => router.push(projectHref)}
                                objetivo={{
                                  tipo: 'espacio',
                                  name: ws.name,
                                  path: `/workspaces/${ws.id}`,
                                  cuerpoDeNombre: (name) => ({ name }),
                                  permisoRenombrar: 'canEditBoard',
                                  permisoEliminar: 'canDeleteBoard',
                                  confirmarEscribiendo: true,
                                }}
                              />
                            </div>
                            {wsAbierto &&
                              ws.boards.map((tablero) => {
                                const tableroActivo = activePath.includes(`board=${tablero.id}`);
                                return (
                                  <div
                                    key={tablero.id}
                                    className={`group ml-7 flex items-center gap-1 rounded-md pr-1 transition-colors ${
                                      tableroActivo
                                        ? 'bg-white/10 text-white'
                                        : 'text-text-secondary hover:text-white hover:bg-white/[0.06]'
                                    }`}
                                  >
                                    <Link
                                      href={`${wsHref}&board=${tablero.id}`}
                                      aria-current={tableroActivo ? 'page' : undefined}
                                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-[6px] text-[13px]"
                                    >
                                      <Columns3
                                        className="h-3.5 w-3.5 shrink-0 opacity-60"
                                        aria-hidden="true"
                                      />
                                      <span className="truncate">{tablero.name}</span>
                                    </Link>
                                    <MenuDeContenido
                                      projectId={project.id}
                                      gatewayPath={`${zonePath}/api/gateway`}
                                      activo={tableroActivo}
                                      onCambiado={() => refrescarProyecto(project.id)}
                                      alEliminar={() => router.push(wsHref)}
                                      objetivo={{
                                        tipo: 'tablero',
                                        name: tablero.name,
                                        path: `/boards/${tablero.id}`,
                                        cuerpoDeNombre: (name) => ({ name }),
                                        permisoRenombrar: 'canEditBoard',
                                        permisoEliminar: 'canDeleteBoard',
                                        confirmarEscribiendo: true,
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            {wsAbierto && ws.documents.map((doc) => {
                              const docActivo = activePath.includes(`doc=${doc.id}`);
                              return (
                                <div
                                  key={doc.id}
                                  className={`group ml-7 flex items-center gap-1 rounded-md pr-1 transition-colors ${
                                    docActivo
                                      ? 'bg-white/10 text-white'
                                      : 'text-text-secondary hover:text-white hover:bg-white/[0.06]'
                                  }`}
                                >
                                  <Link
                                    href={`${wsHref}&doc=${doc.id}`}
                                    aria-current={docActivo ? 'page' : undefined}
                                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-[6px] text-[13px]"
                                  >
                                    <File
                                      className="h-3.5 w-3.5 shrink-0 opacity-60"
                                      aria-hidden="true"
                                    />
                                    <span className="truncate">{doc.title || 'Sin título'}</span>
                                  </Link>
                                  <MenuDeContenido
                                    projectId={project.id}
                                    gatewayPath={`${zonePath}/api/gateway`}
                                    activo={docActivo}
                                    onCambiado={() => refrescarProyecto(project.id)}
                                    alEliminar={() => router.push(wsHref)}
                                    objetivo={{
                                      tipo: 'documento',
                                      name: doc.title || 'Sin título',
                                      path: `/workspaces/${ws.id}/documents/${doc.id}`,
                                      cuerpoDeNombre: (title) => ({ title }),
                                      permisoRenombrar: 'canEditDocuments',
                                      permisoEliminar: 'canEditDocuments',
                                      confirmarEscribiendo: false,
                                    }}
                                  />
                                </div>
                              );
                            })}
                            {wsAbierto && (
                              <button
                                type="button"
                                onClick={() => {
                                  /* Los espacios se piden al desplegar; el formulario los necesita. */
                                  refrescarProyecto(project.id);
                                  setPresetDeCrear({
                                    que: ws.kind === 'DOCUMENTS' ? 'documento' : 'tablero',
                                    espacioId: ws.id,
                                  });
                                  setCreandoEn(project.id);
                                }}
                                className="ml-7 flex items-center gap-2 rounded-md px-2 py-[6px] text-left text-[13px] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-white"
                              >
                                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">
                                  {ws.kind === 'DOCUMENTS' ? 'Nuevo documento' : 'Nuevo tablero'}
                                </span>
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
      {(() => {
        const proyecto = projects.find((p) => p.id === creandoEn);
        if (!proyecto) return null;
        return (
          <CrearEnProyecto
            abierto
            onCerrar={() => {
              setCreandoEn(null);
              setPresetDeCrear(null);
            }}
            queInicial={presetDeCrear?.que}
            espacioInicialId={presetDeCrear?.espacioId}
            proyecto={proyecto}
            espacios={proyecto.workspaces}
            gatewayPath={`${zonePath}/api/gateway`}
            onCreado={() => refrescarProyecto(proyecto.id)}
          />
        );
      })()}
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
      className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10 ${
        plegada ? 'justify-center px-0' : ''
      } ${activo ? 'bg-white/10' : ''}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center [&>*]:shrink-0 [&>*]:scale-[1.1]">
        <Avatar
          label={nombre}
          size="sm"
          src={avatarHref(peer?.avatarUrl, gatewayPath)}
          presence={presencia}
        />
      </span>
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
      className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10 ${
        plegada ? 'justify-center px-0' : ''
      } ${activo ? 'bg-white/10' : ''}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center [&>*]:shrink-0 [&>*]:scale-[0.82]">
        <ProjectMonogram
          id={chat.project.id}
          name={chat.project.name}
          iconKey={chat.project.iconKey}
          imageUrl={chat.project.imageUrl}
          color={chat.project.color}
        />
      </span>
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
function resumenDe(mensaje: { body: string; deletedAt?: string | null }): string {
  if (mensaje.deletedAt) return 'Mensaje eliminado';
  const plano = mensaje.body.replace(/<[^>]*>?/g, '').trim();
  return plano.length > 50 ? `${plano.slice(0, 50)}…` : plano;
}

/** Hoy la hora; antes, el día. En una columna de 320 px no cabe más. */
function cuandoCorto(iso: string): string {
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
function SidebarChatList({
  zonePath,
  plegada,
  organizacionActivaId,
}: {
  zonePath: string;
  plegada: boolean;
  organizacionActivaId: string | null;
}) {
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

  const termino = busqueda.trim().toLowerCase();
  const proyectosVisibles = deProyecto
    .filter((c) => !organizacionActivaId || c.project.organizationId === organizacionActivaId)
    .filter((c) => !termino || c.project.name.toLowerCase().includes(termino));

  const directasVisibles = directas.filter((c) => {
    if (!termino) return true;
    const peer = directorio.get(c.peerId);
    return (peer ? personLabel(peer) : 'Alguien').toLowerCase().includes(termino);
  });

  if (cargando) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <div className="h-10 animate-pulse rounded-xl bg-white/5" />
        <div className="h-10 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-1 pb-4">
      {!plegada && (
        <div className="px-2">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar chats..."
            aria-label="Buscar conversaciones"
            className="w-full rounded-md bg-white/5 px-2 py-1 font-sans text-sm text-white placeholder-text-secondary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      )}

      {proyectosVisibles.length > 0 && (
        <div className="flex flex-col gap-1">
          {!plegada && (
            <span className="mx-1 px-2 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Proyectos
            </span>
          )}
          {proyectosVisibles.map((chat) => (
            <FilaDeProyecto
              key={chat.project.id}
              chat={chat}
              autor={chat.ultimo?.authorId ? directorio.get(chat.ultimo.authorId) : undefined}
              activo={browserPath === `/chat/proyecto/${chat.project.id}`}
              plegada={plegada}
            />
          ))}
        </div>
      )}

      {directasVisibles.length > 0 && (
        <div className="flex flex-col gap-1">
          {!plegada && (
            <span className="mx-1 px-2 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Privados
            </span>
          )}
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
        </div>
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
function SidebarInboxList({
  zonePath,
  plegada,
  className = '',
}: {
  zonePath: string;
  plegada: boolean;
  /** El tope de alto: en el popover de la campana es otro que en una pestaña. */
  className?: string;
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

  const loader = (
    <div className="flex flex-col gap-2 px-1 py-2">
      <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
      <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
      <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
    </div>
  );

  return (
    <div className={`flex flex-col ${className}`}>
      {!plegada && (
        <div className="mx-3 mb-3 flex shrink-0 rounded-lg bg-white/5 p-0.5">
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
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto scrollbar-none px-1 pb-4">
        {loading ? (
          loader
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center font-sans text-[13px] text-text-secondary">
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
                  sinLeer ? 'bg-white/[0.04]' : ''
                }`}
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
                    className={`line-clamp-2 font-sans text-[12px] leading-snug ${
                      sinLeer ? 'font-medium text-white' : 'text-text-secondary'
                    }`}
                  >
                    {textoDeAviso(aviso, actor)}
                  </p>
                  <span className="mt-1 font-sans text-[10px] text-text-secondary">
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
    </div>
  );
}
