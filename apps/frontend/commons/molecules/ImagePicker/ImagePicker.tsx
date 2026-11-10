'use client';

import { useRef, useState } from 'react';
import { Button } from '../../atoms/Button';

/** Mismo tope que el gateway (`IMAGEN_MAX_BYTES`): el mensaje llega antes. */
const MAX_BYTES = 2 * 1024 * 1024;
const TIPOS = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Subir o quitar una imagen de identidad (organización o proyecto).
 *
 * Sube **en el momento de elegir el archivo**, sin esperar al «Guardar» del
 * formulario: es un endpoint aparte y una foto grande no tiene por qué viajar
 * junto con el nombre. La lógica de negocio vive en la página: aquí solo se
 * valida tipo y tamaño y se llama a `onUpload` / `onRemove`, que devuelven el
 * mensaje de error o `null`.
 *
 * ⚠️ El `<input type="file">` se vacía tras cada elección: sin eso, volver a
 * elegir el mismo archivo no dispara `change` y parece que el botón no hace nada.
 */
export function ImagePicker({
  tieneImagen,
  onUpload,
  onRemove,
  disabled = false,
}: {
  tieneImagen: boolean;
  onUpload: (file: File) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(tarea: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      setError(await tarea());
    } catch {
      setError('No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  }

  function alElegir(archivo: File | undefined) {
    if (inputRef.current) inputRef.current.value = '';
    if (!archivo) return;
    if (!TIPOS.includes(archivo.type)) {
      setError('La imagen tiene que ser PNG, JPEG o WebP.');
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError('La imagen pesa más de 2 MB.');
      return;
    }
    void ejecutar(() => onUpload(archivo));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={TIPOS.join(',')}
          className="hidden"
          onChange={(evento) => alElegir(evento.target.files?.[0])}
        />
        <Button
          type="button"
          variant="secondary"
          isLoading={busy}
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {tieneImagen ? 'Cambiar imagen' : 'Subir imagen'}
        </Button>
        {tieneImagen && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => void ejecutar(onRemove)}
          >
            Quitar imagen
          </Button>
        )}
      </div>
      <p className="font-sans text-xs text-text-secondary">
        PNG, JPEG o WebP, hasta 2 MB. La imagen sustituye al icono.
      </p>
      {error && (
        <p role="alert" className="font-sans text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
