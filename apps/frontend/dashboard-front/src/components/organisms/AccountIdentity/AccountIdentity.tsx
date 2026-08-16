'use client';

import {
  deleteAvatarAction,
  setPresenceAction,
  uploadAvatarAction,
} from '@/app/(private)/perfil/actions';
import { Avatar, Button, PRESENCES, type Presence, colors, presenciaDe } from '@praxis/commons';
import { useRef, useState } from 'react';

export interface AccountIdentityProps {
  nombre: string;
  email: string;
  /** La foto actual, ya con el proxy de la zona delante. */
  avatarSrc: string | null;
  presenciaInicial: string;
}

/** Lo que el gateway acepta como foto. Espejo de `AVATAR_ALLOWED_MIME`. */
const TIPOS = ['image/png', 'image/jpeg', 'image/webp'];

/** 2 MB, igual que el tope del gateway. Se comprueba antes de subir. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Tu cara: foto, nombre visible y estado.
 *
 * ## Por qué la foto y la presencia van juntas y el nombre no
 *
 * Son las dos cosas que **se ven de ti sin abrir nada** —el círculo de la barra
 * lateral y el punto de color que lo acompaña— así que se editan mirando
 * exactamente ese mismo círculo, en grande. El nombre se edita justo debajo,
 * con el formulario de siempre: es texto, y ahí no hay nada que previsualizar.
 */
export function AccountIdentity({
  nombre,
  email,
  avatarSrc,
  presenciaInicial,
}: AccountIdentityProps) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presencia, setPresencia] = useState(presenciaInicial);
  const [guardandoPresencia, setGuardandoPresencia] = useState(false);
  /**
   * La foto que se está viendo.
   *
   * Se pinta lo que **confirma el servidor** (la `avatarUrl` nueva, con su
   * `?v=`), no una vista previa local: así lo que se ve aquí es exactamente lo
   * que verá el resto del equipo, y no hay un momento en que difieran.
   */
  const [src, setSrc] = useState(avatarSrc);

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

  async function cambiarPresencia(siguiente: Presence) {
    const anterior = presencia;
    setPresencia(siguiente);
    setGuardandoPresencia(true);
    const confirmada = await setPresenceAction(siguiente);
    setGuardandoPresencia(false);
    /* Se corrige con lo que confirma el servidor, no con lo que se pidió. */
    setPresencia(confirmada ?? anterior);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar
          label={nombre.trim() || email}
          mine
          size="md"
          src={src}
          presence={presencia}
          className="scale-[1.6] [transform-origin:left_center]"
        />

        <div className="ml-8 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={archivoRef}
              type="file"
              accept={TIPOS.join(',')}
              onChange={alElegirArchivo}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => archivoRef.current?.click()}
              disabled={subiendo}
            >
              {subiendo ? 'Subiendo…' : src ? 'Cambiar foto' : 'Subir foto'}
            </Button>
            {src && (
              <button
                type="button"
                onClick={() => void quitarFoto()}
                disabled={subiendo}
                className="cursor-pointer rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Quitar
              </button>
            )}
          </div>
          <p className="font-sans text-xs text-text-disabled">
            PNG, JPEG o WebP. Hasta 2 MB. Se ve en cada mensaje que escribas.
          </p>
          {error && (
            <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
              {error}
            </p>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={guardandoPresencia}>
        <legend className="mb-1 font-sans text-sm font-medium text-text-primary">Tu estado</legend>
        <p className="mb-1 font-sans text-xs text-text-secondary">
          Lo ve tu equipo junto a tu nombre. Lo eliges tú y se queda hasta que lo cambies.
        </p>

        <div className="flex flex-wrap gap-2">
          {PRESENCES.map((clave) => {
            const descripcion = presenciaDe(clave);
            const puesta = clave === presencia;
            return (
              <button
                key={clave}
                type="button"
                onClick={() => void cambiarPresencia(clave)}
                aria-pressed={puesta}
                title={descripcion.ayuda}
                className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 font-sans text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: puesta ? descripcion.color : colors.border,
                  background: puesta ? `${descripcion.color}1f` : 'transparent',
                  color: puesta ? colors.textPrimary : colors.textSecondary,
                }}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: descripcion.color }}
                />
                {descripcion.etiqueta}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
