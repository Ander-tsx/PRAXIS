'use client';

import { generateSeedPhraseAction, revokeVoiceLinkAction } from '@/app/(private)/settings/actions';
import { VOICE_LINK_INITIAL_STATE } from '@/lib/action-state';
import { type VoiceLink, estaActiva, formatoCuentaAtras, formatoFecha } from '@/lib/voice';
import { Badge, Button, alpha, colors, useAccion } from '@praxis/commons';
import { useEffect, useMemo, useState } from 'react';

export interface VoiceLinkingProps {
  /** Vinculaciones que ya existen. Las pinta el Server Component de la pantalla. */
  links: VoiceLink[];
  /** `true` si `GET /alexa/links` falló: alexa-service caído no rompe Configuración. */
  sinConexion?: boolean;
}

/**
 * Vinculación de la cuenta con **Praxis Voice**, la skill de Alexa.
 *
 * ## Por qué una frase y no una contraseña
 *
 * La skill no puede pedir usuario y contraseña: se dictan en voz alta, en un
 * salón, a un aparato que está escuchando. En su lugar la frase semilla son
 * cinco palabras comunes elegidas para que Alexa las transcriba bien —sin
 * homófonas, sin acentos—, **caduca a los cinco minutos** y es de **un solo
 * uso**. Lo que se canjea con ella es un token de solo lectura: por voz se
 * consulta, no se escribe.
 *
 * ## La frase se enseña una vez y no vuelve
 *
 * El backend guarda su hash, nunca el texto. No hay ninguna ruta que la
 * devuelva otra vez, así que **este componente es el único sitio donde existe
 * en claro** — de ahí que viva en el estado del formulario y no en la caché de
 * Next. Al recargar desaparece, y lo correcto entonces es generar otra: es
 * gratis y además invalida la anterior.
 *
 * ⚠️ **La cuenta atrás se calcula contra `expiresAt`, no restando de 300.** El
 * reloj del navegador y el del servidor no tienen por qué coincidir, pero lo
 * que caduca es la marca del servidor; contar hacia ella se equivoca como mucho
 * en la deriva entre los dos relojes, mientras que un contador propio se
 * equivoca además en todo lo que tarde la respuesta en llegar.
 */
export function VoiceLinking({ links, sinConexion = false }: VoiceLinkingProps) {
  const [state, generar, generando] = useAccion(generateSeedPhraseAction, VOICE_LINK_INITIAL_STATE);
  const [revocacion, revocar, revocando] = useAccion(
    revokeVoiceLinkAction,
    VOICE_LINK_INITIAL_STATE,
  );

  const activas = useMemo(() => links.filter(estaActiva), [links]);

  return (
    <div className="flex flex-col gap-6">
      <ComoFunciona />

      <GeneradorDeFrase
        phrase={state.phrase}
        expiresAt={state.expiresAt}
        error={state.error}
        generando={generando}
        generar={generar}
      />

      <Dispositivos
        activas={activas}
        sinConexion={sinConexion}
        error={revocacion.error}
        revocando={revocando}
        revocar={revocar}
      />
    </div>
  );
}

/** Los tres pasos, en el orden en que se hacen. */
function ComoFunciona() {
  const pasos = [
    'Genera tu frase semilla aquí abajo.',
    'Di «Alexa, abre Praxis Voice» en tu dispositivo.',
    'Cuando te la pida, dicta las cinco palabras.',
  ];

  return (
    <ol className="flex flex-col gap-2.5">
      {pasos.map((paso, i) => (
        <li key={paso} className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-sans text-[11px] font-semibold"
            style={{ background: alpha(colors.accent, 20), color: colors.accent }}
          >
            {i + 1}
          </span>
          <span className="font-sans text-sm text-text-secondary">{paso}</span>
        </li>
      ))}
    </ol>
  );
}

function GeneradorDeFrase({
  phrase,
  expiresAt,
  error,
  generando,
  generar,
}: {
  phrase: string | null;
  expiresAt: string | null;
  error: string | null;
  generando: boolean;
  generar: (formData: FormData) => void;
}) {
  return (
    <form action={generar} className="flex flex-col gap-4">
      {phrase && expiresAt ? (
        <FraseViva phrase={phrase} expiresAt={expiresAt} />
      ) : (
        <div
          className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-6"
          style={{ borderColor: alpha(colors.border, 140) }}
        >
          <p className="font-sans text-sm text-text-secondary">
            Todavía no has generado ninguna frase. Se enseña una sola vez y dura cinco minutos, así
            que genérala cuando tengas el dispositivo a mano.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant={phrase ? 'secondary' : 'primary'} isLoading={generando}>
          {phrase ? 'Generar otra frase' : 'Generar frase semilla'}
        </Button>
        {phrase && (
          <span className="font-sans text-xs text-text-disabled">
            Generar otra anula la de arriba.
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="font-sans text-sm" style={{ color: colors.error }}>
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * La frase, en grande, con su cuenta atrás.
 *
 * Cada palabra va en su propia ficha numerada porque **hay que dictarlas de
 * una en una**: en una sola línea corrida es fácil saltarse una o perder el
 * sitio al mirar del móvil al altavoz.
 */
function FraseViva({ phrase, expiresAt }: { phrase: string; expiresAt: string }) {
  const total = 300;
  const [restante, setRestante] = useState(() =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setRestante(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  /* El aviso de copiado se borra solo: un «copiado» que se queda ahí para
     siempre deja de significar «acabas de copiarlo». */
  useEffect(() => {
    if (!copiado) return;
    const id = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(id);
  }, [copiado]);

  const caducada = restante === 0;
  const apurando = restante > 0 && restante <= 60;
  const palabras = phrase.split(/\s+/).filter(Boolean);
  const tono = caducada ? colors.error : apurando ? colors.warning : colors.accent;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopiado(true);
    } catch {
      /* Sin portapapeles —contexto no seguro, permiso denegado— la frase sigue
         a la vista y se puede leer. No es un error que merezca un mensaje. */
    }
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border p-6"
      style={{
        borderColor: alpha(tono, 60),
        background: `linear-gradient(160deg, ${alpha(tono, 12)}, transparent 70%)`,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-sans text-sm font-semibold text-text-primary">Tu frase semilla</h3>
          {caducada ? (
            <Badge variant="error">Caducada</Badge>
          ) : (
            <Badge variant={apurando ? 'warning' : 'accent'}>
              Caduca en {formatoCuentaAtras(restante)}
            </Badge>
          )}
        </div>

        {!caducada && (
          <button
            type="button"
            onClick={copiar}
            className="cursor-pointer rounded-lg px-2.5 py-1 font-sans text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary"
            style={{ background: alpha(colors.border, 50) }}
          >
            {copiado ? 'Copiada' : 'Copiar'}
          </button>
        )}
      </div>

      <ol
        className="flex flex-wrap gap-2"
        aria-label="Las palabras de tu frase, en orden"
        style={{ opacity: caducada ? 0.45 : 1 }}
      >
        {palabras.map((palabra, i) => (
          <li
            key={`${i}-${palabra}`}
            className="flex items-baseline gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5"
          >
            <span className="font-sans text-[10px] font-semibold text-text-disabled">{i + 1}</span>
            <span className="font-mono text-base font-semibold tracking-wide text-text-primary">
              {palabra}
            </span>
          </li>
        ))}
      </ol>

      {/* La barra baja mientras queda tiempo. Es redundante con el número a
          propósito: de reojo se ve cuánto queda sin leer nada. */}
      {!caducada && (
        <div
          className="h-1 overflow-hidden rounded-full"
          style={{ background: alpha(colors.border, 70) }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{
              width: `${Math.min(100, (restante / total) * 100)}%`,
              background: tono,
            }}
          />
        </div>
      )}

      <p className="font-sans text-xs text-text-disabled">
        {caducada
          ? 'Esta frase ya no sirve. Genera otra cuando quieras.'
          : 'De un solo uso. No la compartas: quien la dicte entra a consultar tus proyectos.'}
      </p>
    </div>
  );
}

function Dispositivos({
  activas,
  sinConexion,
  error,
  revocando,
  revocar,
}: {
  activas: VoiceLink[];
  sinConexion: boolean;
  error: string | null;
  revocando: boolean;
  revocar: (formData: FormData) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-sans text-sm font-semibold text-text-primary">
          Dispositivos vinculados{' '}
          {activas.length > 0 && (
            <span className="font-normal text-text-secondary">{activas.length}</span>
          )}
        </h3>

        {activas.length > 1 && (
          <form action={revocar}>
            <Button type="submit" variant="ghost" size="sm" isLoading={revocando}>
              Revocar todos
            </Button>
          </form>
        )}
      </div>

      {sinConexion ? (
        <p className="font-sans text-sm text-text-secondary">
          No se pudo consultar tus dispositivos ahora mismo. Puedes generar la frase igualmente.
        </p>
      ) : activas.length === 0 ? (
        <p className="font-sans text-sm text-text-secondary">
          Ninguno todavía. En cuanto dictes la frase, el dispositivo aparecerá aquí.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {activas.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-sans text-sm text-text-primary">Alexa</span>
                <span className="font-sans text-[11px] text-text-disabled">
                  Vinculado el {formatoFecha(link.createdAt) ?? '—'}
                  {link.lastUsedAt && ` · última vez el ${formatoFecha(link.lastUsedAt)}`}
                </span>
              </span>

              <form action={revocar} className="shrink-0">
                <input type="hidden" name="linkId" value={link.id} />
                <Button type="submit" variant="danger" size="sm" isLoading={revocando}>
                  Revocar
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="font-sans text-sm" style={{ color: colors.error }}>
          {error}
        </p>
      )}
    </div>
  );
}
