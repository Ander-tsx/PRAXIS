import { AccountIdentity } from '@/components/organisms/AccountIdentity';
import { DeleteAccount } from '@/components/organisms/DeleteAccount';
import { PresencePicker } from '@/components/organisms/PresencePicker';
import { AppHeader, LogoutButton, avatarHref } from '@praxis/commons';
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
    <AppHeader title="Tu cuenta" anchoCompleto={true}>
      <AccountIdentity
        nombre={nombre}
        email={profile.credential.email}
        avatarSrc={avatarHref(profile.avatarUrl, '/dashboard/api/gateway')}
        coverSrc={profile.coverUrl ? avatarHref(profile.coverUrl, '/dashboard/api/gateway') : null}
        biography={profile.biography ?? null}
        location={profile.location ?? null}
        presencia={profile.presence ?? 'AVAILABLE'}
        roles={roles}
        estadoDeCuenta={estadoDeCuenta(profile.status)}
        miembroDesde={mesYAno(profile.createdAt)}
        actualizado={fechaLarga(profile.updatedAt)}
        initialFirstName={profile.firstName ?? ''}
        initialLastName={profile.lastName ?? ''}
      >
        <div className="flex flex-col gap-6 pt-6 mt-6 border-t border-white/5">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white">Tu estado</h3>
            <p className="text-sm text-white mb-2">Hazle saber tu disponibilidad a los demás.</p>
            <div className="w-full">
              <PresencePicker inicial={profile.presence ?? 'AVAILABLE'} />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <h3 className="text-sm font-semibold text-white">Sesión y cuenta</h3>
            <div className="flex flex-wrap items-start gap-8 mt-2">
              <div className="flex flex-col gap-2 max-w-[240px] sm:max-w-none">
                <div className="w-fit"><LogoutButton compacto={false} /></div>
                <p className="text-xs text-white leading-relaxed">Se cierra en este navegador. Podrás volver a entrar cuando quieras.</p>
              </div>
              <div className="flex flex-col gap-2 max-w-[240px] sm:max-w-none">
                <div className="w-fit"><DeleteAccount email={profile.credential.email} /></div>
                <p className="text-xs text-white leading-relaxed">Lo último y lo único que no se deshace.</p>
              </div>
            </div>
          </div>
        </div>
      </AccountIdentity>
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
