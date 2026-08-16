'use client';

import { deleteAvatarAction, uploadAvatarAction } from '@/app/(private)/profile/actions';
import { Avatar, Badge, GlobalRoleBadges, alpha, colors, presenciaDe } from '@praxis/commons';
import { type ReactNode, useRef, useState } from 'react';

export interface AccountIdentityProps {
  nombre: string;
  email: string;
  /** La foto actual, ya con el proxy de la zona delante. */
  avatarSrc: string | null;
  /** La presencia que dio el servidor. Aquí solo se pinta; se cambia en `PresencePicker`. */
  presencia: string;
  /** Roles globales, tal como los da `loadCurrentUser()`. Vacío es lo normal. */
  roles: readonly string[];
  /** Estado administrativo de la cuenta (`UserProfile.status`), ya traducido. */
  estadoDeCuenta: { etiqueta: string; activa: boolean };
  /** «agosto de 2026», ya formateado en el servidor. */
  miembroDesde: string;
  /** «12 de agosto de 2026», ya formateado en el servidor. */
  actualizado: string;
}

/** Lo que el gateway acepta como foto. Espejo de `AVATAR_ALLOWED_MIME`. */
const TIPOS = ['image/png', 'image/jpeg', 'image/webp'];

/** 2 MB, igual que el tope del gateway. Se comprueba antes de subir. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * El encabezado de tu cuenta: quién eres, en una sola pieza.
 *
 * ## Por qué es una portada y no otra sección más
 *
 * La pantalla eran cuatro secciones apiladas con dos líneas de contenido cada
 * una, así que lo primero que se veía al entrar en «tu cuenta» era un título y
 * un formulario. Lo que se espera ver es **tu cara**, y es además lo que
 * justifica el ancho de la pantalla: la portada ocupa la franja entera, y
 * debajo caben dos tarjetas en paralelo en vez de dos franjas de aire.
 *
 * La foto se sube desde aquí porque aquí es donde se está mirando en grande, y
 * el resto —el correo, el rol, desde cuándo estás— es lectura: no hay ningún
 * campo editable en esta pieza salvo la foto.
 *
 * ## Las fechas llegan formateadas
 *
 * `Intl` con la zona horaria del navegador da un resultado distinto al del
 * servidor, y eso en un componente de cliente es un desajuste de hidratación.
 * Formatea la page, que es servidor, y aquí solo se pinta la cadena.
 *
 * ## La presencia se pinta, no se cambia
 *
 * El punto del retrato sale de la prop, sin estado propio: quien lo cambia es
 * `PresencePicker`, cuyo server action revalida el layout entero y hace que
 * esta portada se repinte con el valor **confirmado**. Con estado local aquí,
 * los dos sitios donde se ve la presencia podrían decir cosas distintas.
 */
export function AccountIdentity({
  nombre,
  email,
  avatarSrc,
  presencia,
  roles,
  estadoDeCuenta,
  miembroDesde,
  actualizado,
}: AccountIdentityProps) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * La foto que se está viendo.
   *
   * Se pinta lo que **confirma el servidor** (la `avatarUrl` nueva, con su
   * `?v=`), no una vista previa local: así lo que se ve aquí es exactamente lo
   * que verá el resto del equipo, y no hay un momento en que difieran.
   */
  const [src, setSrc] = useState(avatarSrc);

  const etiqueta = nombre.trim() || email;

  async function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    /* Se vacía el campo para que elegir dos veces el mismo archivo vuelva a
       disparar `onChange`. */
    evento.target.value = '';
    if (!archivo) return;

    setError(null);
    if (!TIPOS.includes(archivo.type)) {
      setError('La foto tiene que ser PNG, JPEG o WebP.');
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError('La foto no puede pasar de 2 MB. Prueba con una más pequeña.');
      return;
    }

    const cuerpo = new FormData();
    cuerpo.append('file', archivo);

    setSubiendo(true);
    try {
      const resultado = await uploadAvatarAction(cuerpo);
      if (resultado.error) setError(resultado.error);
      /* La URL trae `?v=<epoch>`, así que el navegador la pide de nuevo en vez
         de sacar la vieja de su caché. */ else
        setSrc(resultado.avatarUrl ? `/dashboard/api/gateway${resultado.avatarUrl}` : null);
    } catch {
      setError('No se pudo subir la foto. Si es muy grande, prueba con otra.');
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarFoto() {
    setError(null);
    setSubiendo(true);
    const resultado = await deleteAvatarAction();
    if (resultado.error) setError(resultado.error);
    else setSrc(null);
    setSubiendo(false);
  }

  const estadoActual = presenciaDe(presencia);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      {/**
       * La franja de color.
       *
       * Es lo único decorativo de la pantalla y hace un trabajo concreto: da un
       * borde superior contra el que apoyar el retrato, que es lo que convierte
       * una fila de datos en una portada. Va con `alpha()` sobre los tokens de
       * marca —no con hexadecimales— para que funcione igual en los dos temas.
       */}
      <div
        aria-hidden="true"
        className="h-24 w-full sm:h-28"
        style={{
          background: `linear-gradient(115deg, ${alpha(colors.primary, 34)} 0%, ${alpha(
            colors.primary,
            10,
          )} 42%, ${alpha(colors.accent, 22)} 100%)`,
        }}
      >
        {/* Una trama diagonal muy suave: sin ella, el degradado a 1400 px de
            ancho se ve como una banda plana. */}
        <div
          className="h-full w-full"
          style={{
            background: `repeating-linear-gradient(115deg, transparent 0 22px, ${alpha(
              colors.textPrimary,
              4,
            )} 22px 23px)`,
          }}
        />
      </div>

      <div className="flex flex-col gap-6 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* En móvil el retrato va **encima** del nombre, no a su lado: 96 px
              de círculo más el margen dejan ~230 px para un nombre y un correo
              que en esa anchura se cortaban los dos. Apilado, el nombre tiene
              la fila entera. */}
          <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            {/* El anillo del color de la tarjeta recorta el retrato contra la
                franja: sin él, el círculo se funde con el degradado. */}
            <span className="-mt-12 shrink-0 rounded-full ring-4 ring-surface sm:-mt-14">
              <Avatar label={etiqueta} mine size="lg" src={src} presence={presencia} />
            </span>

            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="min-w-0 truncate font-display text-2xl text-text-primary sm:text-3xl">
                  {nombre.trim() || 'Sin nombre todavía'}
                </h2>
                <GlobalRoleBadges roles={roles} />
              </div>

              {/**
               * El correo, con el candado.
               *
               * ⚠️ Vive en `Credential`, en credentials-service, y **no hay
               * endpoint que lo cambie**: antes esto era un `<input>`
               * deshabilitado en el formulario de abajo con el motivo escrito
               * debajo. El motivo se conserva —es lo honesto— pero un campo que
               * no se puede tocar no tiene por qué ocupar una fila entera de
               * formulario: aquí es un dato más de la ficha.
               */}
              <p
                className="flex min-w-0 items-center gap-1.5 font-sans text-sm text-text-secondary"
                title="El correo pertenece a tus credenciales y no se edita desde aquí."
              >
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 11V7a4 4 0 10-8 0v4M6 11h12v9H6z"
                  />
                </svg>
                <span className="truncate">{email}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={archivoRef}
                type="file"
                accept={TIPOS.join(',')}
                onChange={alElegirArchivo}
                className="hidden"
              />
              {/* Botón propio y no el átomo `Button`: en la portada la acción de
                  la foto es secundaria —la primaria es guardar tus datos— y
                  tiene que pesar menos que el botón del formulario de abajo. */}
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                disabled={subiendo}
                className="cursor-pointer rounded-lg border border-border bg-surface-elevated px-3 py-2 mt-2 font-sans text-sm font-medium text-text-primary transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {subiendo ? 'Subiendo…' : src ? 'Cambiar foto' : 'Subir foto'}
              </button>
              {src && (
                <button
                  type="button"
                  onClick={() => void quitarFoto()}
                  disabled={subiendo}
                  className="cursor-pointer rounded-lg px-2 py-2 mt-2 font-sans text-sm text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Quitar
                </button>
              )}
            </div>
            <p className="font-sans text-xs text-text-disabled">PNG, JPEG o WebP. Hasta 2 MB.</p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border px-3 py-2 font-sans text-sm"
            style={{
              color: colors.error,
              background: alpha(colors.error, 10),
              borderColor: alpha(colors.error, 30),
            }}
          >
            {error}
          </p>
        )}

        {/**
         * La tira de datos.
         *
         * Son los tres únicos hechos que la cuenta sabe de sí misma y que no se
         * editan en ninguna parte. Puestos en fila ocupan el ancho que antes era
         * fondo vacío y responden a lo que se trae a esta pantalla —«¿desde
         * cuándo estoy?», «¿está bien mi cuenta?»— sin inventarse ningún dato
         * que el backend no dé.
         */}
        <dl className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3">
          <Dato etiqueta="Miembro desde" valor={miembroDesde} />
          <Dato
            etiqueta="Estado de la cuenta"
            valor={
              <Badge variant={estadoDeCuenta.activa ? 'success' : 'warning'}>
                {estadoDeCuenta.etiqueta.toUpperCase()}
              </Badge>
            }
          />
          <Dato
            etiqueta="Te ven como"
            valor={
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: estadoActual.color }}
                />
                {estadoActual.etiqueta}
              </span>
            }
            /* La fecha de la última edición cabe aquí como pie: es contexto de
               «tus datos», no un dato que se consulte por sí mismo. */
            pie={`Datos actualizados el ${actualizado}`}
            /* A media columna, el pie con la fecha larga se parte en tres
               líneas; ocupando la fila entera cabe en una. */
            className="col-span-2 sm:col-span-1"
          />
        </dl>
      </div>
    </section>
  );
}

/** Un hecho de la tira: rótulo arriba, valor debajo. */
function Dato({
  etiqueta,
  valor,
  pie,
  className = '',
}: { etiqueta: string; valor: ReactNode; pie?: string; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <dt className="font-sans text-xs uppercase tracking-wide text-text-disabled">{etiqueta}</dt>
      <dd className="font-sans text-sm text-text-primary">{valor}</dd>
      {pie && <p className="font-sans text-xs text-text-disabled">{pie}</p>}
    </div>
  );
}
