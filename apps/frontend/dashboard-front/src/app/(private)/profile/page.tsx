import { PanelCard } from '@/components/molecules/PanelCard';
import { AccountIdentity } from '@/components/organisms/AccountIdentity';
import { DeleteAccount } from '@/components/organisms/DeleteAccount';
import { PresencePicker } from '@/components/organisms/PresencePicker';
import { ProfileForm } from '@/components/organisms/ProfileForm';
import { AppHeader, LogoutButton, hrefDeAvatar } from '@praxis/commons';
import { loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tu cuenta',
};

/**
 * Tu cuenta: quién eres y qué se ve de ti.
 *
 * ## Por qué existe, y por qué se llega pulsando tu propia cara
 *
 * Lo tuyo estaba repartido en tres sitios: el nombre en Configuración —entre la
 * facturación y el tema—, «Cerrar sesión» en el pie de la barra lateral, y
 * eliminar la cuenta en ninguno. Pulsar tu avatar es el gesto que ya se intenta
 * en cualquier otra herramienta, así que ahí es donde está ahora todo:
 * identidad, sesión y el final del camino.
 *
 * En Configuración se quedan los **ajustes**: apariencia, facturación y Alexa.
 * La diferencia que separa una pantalla de la otra es «quién eres» contra «cómo
 * se comporta la aplicación».
 *
 * ## Por qué ya no es una pila de secciones
 *
 * Lo era, y con cuatro: cada una traía un título, una frase en cursiva, una
 * línea de separación… y dos campos o un botón dentro. A 1400 px de ancho eso
 * son cuatro franjas de fondo vacío separadas por reglas horizontales, donde la
 * división pesaba más que lo dividido —y en una pantalla que se abre para
 * cambiar la foto o el nombre, lo primero que se veía era una tabla de
 * contenidos.
 *
 * Ahora son **tres bloques con forma**:
 *
 * | Bloque | Qué junta | Por qué |
 * |---|---|---|
 * | Portada (ancho completo) | foto, nombre, correo, rol, alta, estado de la cuenta | Es «quién eres» de un vistazo, y es lo que justifica el ancho |
 * | Rejilla de dos | «Tus datos» y «Tu estado» | Los dos son cortos: uno al lado del otro llenan la fila en vez de dejar medio ancho muerto |
 * | «Sesión y cuenta» | salir de aquí y borrarlo todo | Las dos formas de terminar, en la misma tarjeta y separadas por una línea vertical |
 *
 * En móvil la rejilla cae a una columna y la portada apila el retrato sobre los
 * datos: es la misma pieza, no una versión aparte.
 *
 * ⚠️ **La ruta ya existía como redirección** a `/settings`, de cuando esta
 * pantalla se fusionó con aquella. Volvió a ser una pantalla de verdad, y desde
 * esta pasada vive en `/profile` —en inglés, como `chat`, `notifications` y
 * `settings`—: `/perfil` sigue redirigiendo aquí por los marcadores.
 */
export default async function CuentaPage() {
  const { profile, roles } = await loadCurrentUser();

  const nombre = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return (
    <AppHeader title="Tu cuenta">
      {/* Las insignias del rol global **no** van en la cabecera aquí, al revés
          que en el resto de la zona: en esta pantalla ya salen junto a tu
          nombre, en la portada, que es su sitio natural. Repetirlas arriba
          sería el mismo dato dos veces en la misma vista. */}
      <div className="flex flex-col gap-4">
        <AccountIdentity
          nombre={nombre}
          email={profile.credential.email}
          /* La foto se sirve por el proxy de **esta** zona: `avatarUrl` viene
             relativa al gateway justo para no atarla a ninguna. */
          avatarSrc={hrefDeAvatar(profile.avatarUrl, '/dashboard/api/gateway')}
          presencia={profile.presence ?? 'AVAILABLE'}
          roles={roles}
          estadoDeCuenta={estadoDeCuenta(profile.status)}
          miembroDesde={mesYAno(profile.createdAt)}
          actualizado={fechaLarga(profile.updatedAt)}
        />

        {/**
         * 5 y 7, no 6 y 6.
         *
         * Las dos tarjetas de una fila miden lo mismo de alto (`items-stretch`,
         * que es el defecto), así que el reparto lo decide la más alta: seis
         * estados en dos columnas son tres filas, y un formulario de dos campos
         * a mitad de ancho no llega ni de lejos —a 6/6 quedaba un palmo de
         * tarjeta vacía bajo los campos—. Con el formulario más estrecho, sus
         * campos se apilan y las dos columnas acaban casi a la misma altura.
         */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <PanelCard
            title="Tus datos"
            description="Tu nombre y tu apellido, como los verá el resto de tu equipo."
            icon={<IconoIdentidad />}
            className="lg:col-span-5"
          >
            <ProfileForm
              initialFirstName={profile.firstName ?? ''}
              initialLastName={profile.lastName ?? ''}
            />
          </PanelCard>

          <PanelCard
            title="Tu estado"
            description="Hazle saber tu disponibilidad a los demás."
            icon={<IconoEstado />}
            className="lg:col-span-7"
          >
            <PresencePicker inicial={profile.presence ?? 'AVAILABLE'} />
          </PanelCard>
        </div>

        {/* Las dos formas de terminar, juntas: salir es cotidiano y borrar no se
            deshace, pero las dos responden a «me voy» y separarlas en dos
            franjas era parte de lo que sobraba. La línea las divide sin
            convertirlas en dos bloques. */}
        <PanelCard
          title="Sesión y cuenta"
          description="Cierra tu sesión o borra tu cuenta."
          icon={<IconoSalida />}
          tone="danger"
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 sm:divide-x sm:divide-border">
            <div className="flex flex-col gap-3 sm:pr-8">
              <div className="flex flex-col gap-1">
                <h3 className="font-sans text-sm font-semibold text-text-primary">Cerrar sesión</h3>
                <p className="font-sans text-xs text-text-secondary">
                  Se cierra en este navegador. Podrás volver a entrar cuando quieras.
                </p>
              </div>
              {/* El mismo botón que estaba en la barra lateral, y por eso vive en
                  `commons`: lo único que cambia es dónde se pinta. `compacto`
                  en falso porque aquí el pliegue de la barra no pinta nada —sin
                  él, plegarla dejaba este botón sin su palabra. */}
              <div className="mt-auto w-full sm:max-w-[16rem]">
                <LogoutButton compacto={false} />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="font-sans text-sm font-semibold text-text-primary">
                  Eliminar la cuenta
                </h3>
                <p className="font-sans text-xs text-text-secondary">
                  Lo último y lo único que no se deshace.
                </p>
              </div>
              <div className="mt-auto">
                <DeleteAccount email={profile.credential.email} />
              </div>
            </div>
          </div>
        </PanelCard>
      </div>
    </AppHeader>
  );
}

/**
 * Las fechas se formatean **en el servidor**.
 *
 * `Intl` en el navegador usa la zona horaria de quien mira, que no tiene por
 * qué ser la del servidor: formateando en el cliente, el HTML servido y el
 * hidratado pueden no coincidir. Aquí se convierten a texto una vez y viajan
 * ya hechas.
 */
const MES_Y_ANO = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const FECHA_LARGA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function mesYAno(iso: string): string {
  return MES_Y_ANO.format(new Date(iso));
}

function fechaLarga(iso: string): string {
  return FECHA_LARGA.format(new Date(iso));
}

/**
 * El estado **administrativo** de la cuenta, en palabras.
 *
 * ⚠️ No es la presencia: esto lo pone la plataforma y decide si la cuenta
 * sirve; la presencia la eliges tú y solo informa (ver `commons/api/presence`).
 * Lo que no reconozcamos se enseña tal cual y sin pintarlo de verde: un estado
 * nuevo del backend no debe salir como «todo bien» por defecto.
 */
function estadoDeCuenta(status: string): { etiqueta: string; activa: boolean } {
  switch (status) {
    case 'ACTIVE':
      return { etiqueta: 'Activa', activa: true };
    case 'INACTIVE':
      return { etiqueta: 'Inactiva', activa: false };
    case 'SUSPENDED':
      return { etiqueta: 'Suspendida', activa: false };
    default:
      return { etiqueta: status, activa: false };
  }
}

/* Los iconos de las tarjetas, a 18 px y con el mismo trazo que los de la barra
   lateral. Van aquí y no en un átomo nuevo porque los usa solo esta pantalla. */

function IconoIdentidad() {
  return (
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
        d="M15.5 8.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zM5 20a7 7 0 0114 0"
      />
    </svg>
  );
}

function IconoEstado() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconoSalida() {
  return (
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
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}
