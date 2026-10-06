'use client';

import {
  updateProfileAction,
  uploadAvatarAction,
  useGoogleAvatarAction,
} from '@/app/(privado)/main/profile/actions';
import { Avatar, olvidarDatosSinConexion } from '@praxis/commons';
import { Camera, ImageUp, Loader2, LogOut, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { PresencePicker } from '../PresencePicker';

export interface PerfilEnBarraProps {
  nombre: string;
  email: string;
  avatarSrc: string | null;
  /** La foto de la cuenta de Google, si se entró con ella alguna vez. */
  googleAvatarSrc: string | null;
  presencia: string;
  initialFirstName: string;
  initialLastName: string;
}

const CAMPO =
  'min-h-9 w-full rounded-lg bg-white/5 px-2.5 font-sans text-[13px] text-white ring-1 ring-inset ring-white/10 placeholder:text-text-secondary focus:outline-none focus:ring-white/35 disabled:opacity-60';

const FILA =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-sans text-[13px] font-medium transition-colors';

/**
 * El perfil, como flotante sobre la tarjeta de usuario (ver `PerfilFlotante` en
 * `AppShell`). Solo lo que se usa a diario:
 *
 * - **la foto**, que se cambia aquí mismo —subir una o volver a la de Google— y
 *   se aplica al instante: no hay un «Guardar» que olvidar;
 * - **nombre y apellidos**, que sí llevan «Guardar», y solo cuando hay algo que
 *   guardar;
 * - **el correo**, a la vista y sin poder tocarse: es la identidad de la cuenta;
 * - **el estado** y **cerrar sesión**.
 *
 * Ya no hay portada, biografía, ubicación ni «Eliminar mi cuenta» aquí: borrar una
 * cuenta no es algo que deba estar a un clic de la barra de cada día.
 */
export function PerfilEnBarra({
  nombre,
  email,
  avatarSrc,
  googleAvatarSrc,
  presencia,
  initialFirstName,
  initialLastName,
}: PerfilEnBarraProps) {
  const router = useRouter();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [nombrePila, setNombrePila] = useState(initialFirstName);
  const [apellidos, setApellidos] = useState(initialLastName);
  /* Lo último guardado: con él se sabe si hay cambios sin tener que esperar al servidor. */
  const [guardado, setGuardado] = useState({ n: initialFirstName, a: initialLastName });
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fotoLocal, setFotoLocal] = useState<string | null>(null);

  const etiqueta = nombre.trim() || email;
  const hayCambios =
    nombrePila.trim() !== guardado.n.trim() || apellidos.trim() !== guardado.a.trim();

  async function guardarNombre() {
    if (!hayCambios || guardando) return;
    if (nombrePila.trim().length === 0) {
      setError('El nombre no puede quedar vacío.');
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await updateProfileAction({
      firstName: nombrePila.trim(),
      lastName: apellidos.trim(),
    });
    setGuardando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setGuardado({ n: nombrePila.trim(), a: apellidos.trim() });
    router.refresh();
  }

  async function subirFoto(archivo: File) {
    setSubiendoFoto(true);
    setError(null);
    const datos = new FormData();
    datos.append('file', archivo);
    const res = await uploadAvatarAction(datos);
    setSubiendoFoto(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setFotoLocal(URL.createObjectURL(archivo));
    router.refresh();
  }

  async function volverAGoogle() {
    setSubiendoFoto(true);
    setError(null);
    const res = await useGoogleAvatarAction();
    setSubiendoFoto(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setFotoLocal(googleAvatarSrc);
    router.refresh();
  }

  async function cerrarSesion() {
    setSaliendo(true);
    /* Las pantallas guardadas para leer sin conexión son de esta persona:
       se van con ella (D5 de docs/PLAN-MOVIL.md). */
    await olvidarDatosSinConexion().catch(() => undefined);
    try {
      await fetch('/auth/api/logout', { method: 'POST' });
    } catch {
      /* Aunque falle, se sale igual: las cookies caducan solas. */
    }
    window.location.assign('/');
  }

  return (
    <div className="flex max-h-[calc(100dvh-7rem)] flex-col gap-3 overflow-y-auto p-3 scrollbar-none">
      {/* ── Foto y quién eres ───────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar label={etiqueta} mine size="xl" src={fotoLocal ?? avatarSrc} />
          {subiendoFoto && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
              <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="truncate font-sans text-[14px] font-semibold leading-tight text-white">
            {nombre.trim() || 'Sin nombre'}
          </p>
          <p
            className="flex items-center gap-1.5 font-sans text-[12px] text-text-secondary"
            title="El correo no se puede cambiar"
          >
            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{email}</span>
          </p>
        </div>
      </div>

      {/* Las dos formas de poner la foto, aplicadas al instante. */}
      <div className="flex gap-1.5">
        <input
          ref={archivoRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            e.target.value = '';
            if (archivo) void subirFoto(archivo);
          }}
        />
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={subiendoFoto}
          className="flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 font-sans text-[12px] font-medium text-text-primary transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Subir foto
        </button>
        {googleAvatarSrc && (
          <button
            type="button"
            onClick={() => void volverAGoogle()}
            disabled={subiendoFoto}
            className="flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 font-sans text-[12px] font-medium text-text-primary transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <ImageUp className="h-3.5 w-3.5" aria-hidden="true" />
            Usar la de Google
          </button>
        )}
      </div>

      {/* ── Nombre y apellidos ──────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guardarNombre();
        }}
        className="flex flex-col gap-1.5"
      >
        <input
          value={nombrePila}
          onChange={(e) => setNombrePila(e.target.value)}
          placeholder="Nombre"
          aria-label="Nombre"
          maxLength={60}
          disabled={guardando}
          className={CAMPO}
        />
        <input
          value={apellidos}
          onChange={(e) => setApellidos(e.target.value)}
          placeholder="Apellidos"
          aria-label="Apellidos"
          maxLength={60}
          disabled={guardando}
          className={CAMPO}
        />
        {/* El botón solo existe cuando hay algo que guardar, y crece en vez de aparecer de golpe. */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${
            hayCambios ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <button
              type="submit"
              disabled={!hayCambios || guardando}
              tabIndex={hayCambios ? 0 : -1}
              className="mt-0.5 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-white font-sans text-[12px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {guardando && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
              Guardar cambios
            </button>
          </div>
        </div>
      </form>

      {error && (
        <p role="alert" className="font-sans text-[11px] leading-snug text-error">
          {error}
        </p>
      )}

      {/* ── Tu estado ───────────────────────────────────────────── */}
      <div className="border-t border-border pt-2">
        <PresencePicker inicial={presencia} />
      </div>

      {/* ── La cuenta ───────────────────────────────────────────── */}
      <div className="border-t border-border pt-2">
        <button
          type="button"
          onClick={() => void cerrarSesion()}
          disabled={saliendo}
          className={`${FILA} text-text-primary hover:bg-white/5 hover:text-white disabled:opacity-60`}
        >
          <LogOut className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
          {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  );
}
