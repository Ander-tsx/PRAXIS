import { setPresenceAction } from '@/app/(privado)/presence-actions';
import { PraxCreateProjectTrigger } from '@/components/organisms/PraxCreateProjectTrigger';
import { PerfilEnBarra } from '@/components/organisms/PerfilEnBarra';
import { AvisoAsientoCongelado } from '@/components/organisms/Billing/AvisoAsientoCongelado';
import { AppShell, PresenceFooter, avatarHref, displayName } from '@praxis/commons';
import { loadPrivateChrome } from '@praxis/commons/auth';
import { getSidebarPlegada, getSidebarTab } from '@praxis/commons/theme';
import type { Metadata } from 'next';

/**
 * El área privada nunca se indexa: exige sesión (el guard redirige al login)
 * y esta directiva es la red declarativa por si alguna ruta quedara expuesta.
 * Los `title` de cada página siguen valiendo para la pestaña del navegador.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * El armazón del área privada. **Uno para las cinco secciones.**
 *
 * ## Esto es el motivo de la fusión, no una consecuencia
 *
 * Hubo cinco copias de este archivo, una por zona, y eran idénticas salvo el
 * comentario. Daba igual que lo fueran: cada zona era una aplicación Next
 * distinta, así que cambiar de sección era una **carga completa de página** y
 * el armazón se montaba de cero cada vez. Con él se rehacían la barra lateral,
 * el proveedor del directorio de chats y —lo que de verdad se notaba— **la
 * conexión SSE**, que se cerraba y se volvía a abrir en cada salto.
 *
 * Al colgar las cinco de un grupo de rutas, Next mantiene este layout montado
 * mientras solo cambie lo que hay debajo: la barra no parpadea, el directorio
 * no se vuelve a pedir y el flujo de avisos no se corta.
 *
 * ⚠️ **Para que eso ocurra, los enlaces del menú tienen que ser `next/link`.**
 * Un `<a>` es una navegación del navegador y vuelve a montarlo todo, que es
 * exactamente lo que había antes. Eran `<a>` obligatoriamente mientras cruzaban
 * de zona; ver `NavList`.
 *
 * ## Lo que NO va aquí
 *
 * El rol de administración. Lo comprueba `admin/layout.tsx`, un piso más abajo,
 * porque solo esa sección lo exige y porque puede explicar por qué no se entra
 * en vez de rebotar en silencio. La sesión la exige el guard, antes de llegar.
 */
export default async function PrivadoLayout({ children }: { children: React.ReactNode }) {
  const {
    profile,
    roles,
    navItems,
    organizaciones,
    organizacionActivaId,
    mensajesSinLeer,
    avisosSinLeer,
  } = await loadPrivateChrome();

  /* La cookie del pliegue, leída en el servidor: sin esto la barra se serviría
     desplegada y se plegaría al hidratar, parpadeando en cada navegación. */
  const plegada = await getSidebarPlegada();
  /* Igual que el pliegue: si el servidor no sabe qué pestaña va abierta, la
     pinta mal y el cliente la corrige — que es el error de hidratación que se
     arregló aquí. Ver `commons/theme/sidebar.ts`. */
  const pestana = await getSidebarTab();

  return (
    <AppShell
      navItems={navItems}
      /**
       * 🔴 **Vacío, y ya no puede ser otra cosa.**
       *
       * `zonePath` hacía dos trabajos: prefijar el proxy del gateway y
       * reconstruir la ruta del navegador, porque dentro de una zona
       * `usePathname()` llegaba sin el `basePath`. Aquí no hay `basePath` ni
       * zonas: la ruta viene entera y el proxy es `/api/gateway`.
       */
      zonePath=""
      plegadaInicial={plegada}
      pestanaInicial={pestana}
      /* El selector de organización de la barra: la lista y cuál se mira. Las
         dos las resuelve `loadPrivateChrome`, así que aquí no cuestan nada. */
      organizaciones={organizaciones}
      organizacionActivaId={organizacionActivaId}
      /* Las dos insignias de las pestañas de la barra: `loadPrivateChrome` ya
         las trae, y a partir de aquí las mantiene vivas el propio armazón
         escuchando el flujo. Ver `AppShellProps.mensajesSinLeer`. */
      mensajesSinLeer={mensajesSinLeer}
      avisosSinLeer={avisosSinLeer}
      nuevoProyectoSlot={
        <PraxCreateProjectTrigger triggerVariant="icono" organizationId={organizacionActivaId} />
      }
      perfilSlot={
        <PerfilEnBarra
          nombre={displayName(profile)}
          email={profile.credential.email}
          avatarSrc={avatarHref(profile.avatarUrl, '/api/gateway')}
          coverSrc={avatarHref(profile.coverUrl, '/api/gateway')}
          googleAvatarSrc={avatarHref(profile.googleAvatarUrl, '/api/gateway')}
          biography={profile.biography ?? null}
          location={profile.location ?? null}
          presencia={profile.presence ?? 'AVAILABLE'}
          roles={roles}
          miembroDesde={mesYAno(profile.createdAt)}
          initialFirstName={profile.firstName ?? ''}
          initialLastName={profile.lastName ?? ''}
        />
      }
      user={{
        name: displayName(profile),
        email: profile.credential.email,
        avatarSrc: avatarHref(profile.avatarUrl, '/api/gateway'),
        presence: profile.presence ?? null,
      }}
      /* El selector de estado se dibuja sobre la esquina del avatar: la esfera
       **es** el botón. Ver `PresenceFooter`. */
      estadoSlot={<PresenceFooter presencia={profile.presence} onCambiar={setPresenceAction} />}
    >
      {/* La cinta de «estás en solo lectura», encima de todo lo demás y en las
          cinco secciones. Va aquí y no en `AppShell` porque no es parte del
          armazón: es un aviso que casi nunca se pinta —no devuelve nada si no
          estás congelado— y el armazón no tiene por qué saber de facturación.

          ⚠️ Se le pasa la organización **resuelta**, no la cookie: con la cruda
          se preguntaría por una de la que quizá ya te fueron. Ver
          `resolverOrganizacionActiva`. */}
      <AvisoAsientoCongelado organizationId={organizacionActivaId} />
      {children}
    </AppShell>
  );
}

/* Formateado en el servidor, para que el HTML servido y el hidratado coincidan. */
const MES_Y_ANO = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
function mesYAno(iso: string): string {
  return MES_Y_ANO.format(new Date(iso));
}
