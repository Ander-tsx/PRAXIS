'use client';

import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import type { ChatRefKind } from '../../api/chat-refs';
import { textoPlano, trocearMensaje } from '../../api/chat-refs';
import {
  CHAT_REACTIONS,
  type ChatAttachment,
  type ChatMessage,
  type UserProfile,
  formatBytes,
  personLabel,
} from '../../api/domain';
import type { LinkPreview } from '../../api/link-preview';
import { Avatar } from '../../atoms/Avatar';
import { alpha, colors } from '../../tokens';
import { RichText } from './RichText';

export interface MessageBubbleProps {
  message: ChatMessage;
  author: UserProfile | undefined;
  mine: boolean;
  /** Continúa un bloque de la misma persona: sin avatar ni cabecera. */
  continued: boolean;
  canDelete: boolean;
  canReact: boolean;
  canFijar: boolean;
  currentUserId: string;
  /** A dónde lleva pulsar el nombre. `null` si no lleva a ninguna parte. */
  hrefDePersona: string | null;
  hrefDeRef?: (kind: ChatRefKind, id: string) => string | null;
  /** URL de los bytes de un adjunto. La da el panel, que conoce el canal. */
  hrefDeAdjunto?: (attachmentId: string) => string;
  /**
   * El contenedor con scroll donde vive la conversación.
   *
   * La barra de acciones se voltea hacia abajo cuando el mensaje está pegado al
   * borde superior del scroll y la barra no cabría arriba; para decidirlo hace
   * falta comparar la posición del mensaje contra la del contenedor.
   */
  scrollerRef: RefObject<HTMLDivElement | null>;
  onResponder: (message: ChatMessage) => void;
  onReaccionar: (messageId: string, emoji: string, on: boolean) => void;
  onFijar: (messageId: string, on: boolean) => void;
  onEditar: (messageId: string, body: string) => Promise<boolean>;
  onBorrar: (messageId: string) => void;
  /** Abre el panel lateral del hilo de este mensaje. */
  onAbrirHilo: (message: ChatMessage) => void;
  /**
   * La marca «N respuestas» bajo el mensaje.
   *
   * Va encendida en el historial, donde es lo que anuncia que un mensaje tiene
   * hilo, y apagada dentro del panel del hilo — ahí ya se está viendo el hilo,
   * y la marca no haría más que repetir el número que dice la cabecera.
   */
  mostrarMarcaDeHilo?: boolean;
  /** Nombre de quien escribió el mensaje citado, para la cita. */
  nombreDeAutor: (userId: string) => string;
  /** Preview de la primera URL del mensaje, si el panel la sabe pedir. */
  previewDeLink?: (url: string) => Promise<LinkPreview | null>;
}

/**
 * Un mensaje.
 *
 * ## Las acciones aparecen al pasar por encima, no siempre
 *
 * Tres botones fijos en cada burbuja convierten la conversación en una rejilla
 * de controles y le quitan sitio al texto, que es lo único que se viene a leer.
 * Aparecen al pasar el ratón **y al enfocar con teclado**: con solo
 * `group-hover`, quien navega con tabulador tendría botones que existen y no
 * puede ver.
 */
export function MessageBubble({
  message,
  author,
  mine,
  continued,
  canDelete,
  canReact,
  canFijar,
  currentUserId,
  hrefDePersona,
  hrefDeRef,
  hrefDeAdjunto,
  scrollerRef,
  onResponder,
  onReaccionar,
  onFijar,
  onEditar,
  onBorrar,
  onAbrirHilo,
  mostrarMarcaDeHilo = true,
  nombreDeAutor,
  previewDeLink,
}: MessageBubbleProps) {
  const [eligiendoReaccion, setEligiendoReaccion] = useState(false);
  const fijado = message.pinnedAt !== null && message.pinnedAt !== undefined;
  const editado = message.editedAt !== null && message.editedAt !== undefined;
  /**
   * Borrar pide confirmación **en la propia barra**, no en un diálogo.
   *
   * El aspa estaba pegada a «Responder», del mismo tamaño y sin ninguna
   * defensa: un clic de más en la acción de al lado y el mensaje ya no estaba.
   * Y borrar un mensaje **no se deshace** — no hay papelera ni historial de
   * ediciones—, así que es la única acción del chat cuyo error no tiene arreglo.
   *
   * Se resuelve pidiendo un segundo clic sobre un botón que **cambia de sitio,
   * de tamaño y de color**: quien iba a por «Responder» no encuentra ahí lo que
   * esperaba y para. Un `window.confirm` habría servido igual de bien y habría
   * bloqueado la pestaña entera; un diálogo propio son cuarenta líneas para
   * preguntar una cosa.
   */
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined);
  const nombre = author ? personLabel(author) : 'Alguien que ya no está';

  /**
   * Modo edición.
   *
   * `editando` es lo que abre el redactor en lugar de la burbuja; `borrador`
   * guarda lo que se está escribiendo para que Esc y «Cancelar» lo suelten sin
   * haber tocado nada. Se anula al apartar el ratón, como la confirmación de
   * borrado: un redactor abierto sobre un mensaje que ya no estás mirando es
   * exactamente el mismo problema que una pregunta de borrado a medio responder.
   */
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');

  async function confirmarEdicion() {
    const guardado = await onEditar(message.id, borrador);
    if (guardado) setEditando(false);
  }

  /**
   * Gestos táctiles: deslizar responde, mantener pulsado abre la hoja de
   * acciones.
   *
   * ## Por qué no la barra de acciones también en móvil
   *
   * La barra aparece con `:hover`, y el táctil no tiene ese estado —una
   * pulsación lo dispara a veces, pegado hasta el siguiente toque en otro
   * sitio, que es peor que no tenerlo—. En vez de perseguir ese estado, se le
   * dan dos gestos que ya conoce de cualquier app de mensajería: deslizar de
   * lado para la respuesta rápida, mantener pulsado para el resto.
   *
   * Los dos se leen con Pointer Events y no con Touch Events: son el mismo
   * gesto para ratón y dedo, así que no hace falta duplicar el manejo, y
   * `pointerType` filtra el táctil sin tocar el comportamiento de ratón que
   * ya tenía la barra.
   */
  const ARRASTRE_UMBRAL = 56;
  const ARRASTRE_TOPE = 84;
  const PULSACION_LARGA_MS = 450;

  const [arrastreX, setArrastreX] = useState(0);

  /**
   * La hoja de acciones móvil: montada, visible y el arrastre para cerrarla
   * tirando hacia abajo — las tres por separado porque son tres momentos
   * distintos de la misma animación.
   *
   * `hojaMontada` decide si existe en el DOM; `hojaVisible` es la clase que
   * dispara la transición CSS. Van separados porque cerrar tiene que **verse**
   * —deslizarse hacia abajo— antes de desaparecer: si se desmontara al mismo
   * tiempo que se pide cerrar, no habría nada que animar. El doble
   * `requestAnimationFrame` al abrir es lo que garantiza que el navegador
   * pinte el estado inicial (fuera de pantalla) antes de pasar al final
   * (visible); sin él, a veces monta ya en su sitio y la entrada no se ve.
   */
  const [hojaMontada, setHojaMontada] = useState(false);
  const [hojaVisible, setHojaVisible] = useState(false);
  const [arrastreHojaY, setArrastreHojaY] = useState(0);
  const gestoHojaRef = useRef({ startY: 0, activo: false });

  function abrirHoja() {
    setArrastreHojaY(0);
    setHojaMontada(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setHojaVisible(true)));
  }

  function cerrarHoja() {
    setHojaVisible(false);
    setConfirmandoBorrado(false);
  }

  function onHojaGestoInicio(e: React.PointerEvent<HTMLDivElement>) {
    gestoHojaRef.current = { startY: e.clientY, activo: true };
  }

  function onHojaGestoMueve(e: React.PointerEvent<HTMLDivElement>) {
    if (!gestoHojaRef.current.activo) return;
    setArrastreHojaY(Math.max(0, e.clientY - gestoHojaRef.current.startY));
  }

  function onHojaGestoFin() {
    if (!gestoHojaRef.current.activo) return;
    gestoHojaRef.current.activo = false;
    /* 100 px de tirón cierra; menos, se suelta y vuelve a su sitio — el mismo
       umbral que cualquier hoja inferior de un sistema operativo móvil. */
    if (arrastreHojaY > 100) cerrarHoja();
    setArrastreHojaY(0);
  }

  const gestoRef = useRef({
    startX: 0,
    startY: 0,
    siguiendo: false,
    /** Se decide en el primer movimiento real: horizontal (desliza) o no (deja pasar el scroll). */
    esDeslizamiento: false,
    temporizador: null as ReturnType<typeof setTimeout> | null,
  });

  function limpiarTemporizador() {
    if (gestoRef.current.temporizador) {
      clearTimeout(gestoRef.current.temporizador);
      gestoRef.current.temporizador = null;
    }
  }

  function onGestoInicio(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch' || editando || confirmandoBorrado) return;
    gestoRef.current.startX = e.clientX;
    gestoRef.current.startY = e.clientY;
    gestoRef.current.siguiendo = true;
    gestoRef.current.esDeslizamiento = false;
    gestoRef.current.temporizador = setTimeout(() => {
      if (!gestoRef.current.siguiendo) return;
      gestoRef.current.siguiendo = false;
      setArrastreX(0);
      abrirHoja();
      navigator.vibrate?.(10);
    }, PULSACION_LARGA_MS);
  }

  function onGestoMueve(e: React.PointerEvent<HTMLDivElement>) {
    if (!gestoRef.current.siguiendo) return;
    const dx = e.clientX - gestoRef.current.startX;
    const dy = e.clientY - gestoRef.current.startY;

    if (!gestoRef.current.esDeslizamiento) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      /* Más vertical que horizontal: es el scroll de la conversación, no un
         deslizamiento. Se suelta el gesto entero y no se vuelve a mirar hasta
         el próximo `pointerdown`. */
      if (Math.abs(dy) > Math.abs(dx)) {
        gestoRef.current.siguiendo = false;
        limpiarTemporizador();
        return;
      }
      gestoRef.current.esDeslizamiento = true;
      limpiarTemporizador();
    }

    setArrastreX(Math.max(-ARRASTRE_TOPE, Math.min(ARRASTRE_TOPE, dx)));
  }

  function onGestoFin() {
    limpiarTemporizador();
    if (gestoRef.current.esDeslizamiento && Math.abs(arrastreX) >= ARRASTRE_UMBRAL) {
      onResponder(message);
      navigator.vibrate?.(8);
    }
    gestoRef.current.siguiendo = false;
    gestoRef.current.esDeslizamiento = false;
    setArrastreX(0);
  }

  /** La burbuja, para saber su posición respecto al contenedor con scroll. */
  const burbujaRef = useRef<HTMLDivElement>(null);

  /**
   * El editor en línea. Se enfoca al entrar en modo edición (un `autoFocus`
   * lo rechaza el linter de a11y, y este efecto lo consigue igual: el foco
   * cae donde el usuario acaba de pedir editar).
   */
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editando) editorRef.current?.focus();
  }, [editando]);

  /**
   * Hacia dónde se abre la barra de acciones.
   *
   * Por defecto hacia arriba (`-top-4`), pero cuando el mensaje está pegado al
   * borde superior del scroll la barra quedaría **fuera del área visible y se
   * recortaría**. Se voltea hacia abajo para que las acciones siempre se vean.
   */
  const [barraAbajo, setBarraAbajo] = useState(false);

  /**
   * Cuánto ocupa la barra de acciones más una holgura.
   *
   * Con `p-1`, botones de `h-4` y el borde ronda los 26 px; 36 deja aire para
   * que no roce el borde del mensaje de encima.
   */
  const ALTO_BARRA = 36;

  function decidirDireccionBarra() {
    const burbuja = burbujaRef.current;
    const scroller = scrollerRef.current;
    if (!burbuja || !scroller) return;
    const burbujaRect = burbuja.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const cabeArriba = burbujaRect.top - ALTO_BARRA >= scrollerRect.top;
    const cabeAbajo = burbujaRect.bottom + ALTO_BARRA <= scrollerRect.bottom;
    /* Si no cabe arriba, abajo. Si tampoco cabe abajo (burbuja muy alta), se
       queda arriba: mejor que no quepa del todo a estar fuera de la vista. */
    setBarraAbajo(!cabeArriba && cabeAbajo);
  }

  /** Las reacciones agrupadas por emoji, con cuántos y si estás dentro. */
  const agrupadas = new Map<string, { total: number; mia: boolean }>();
  for (const reaccion of message.reactions) {
    const actual = agrupadas.get(reaccion.emoji) ?? { total: 0, mia: false };
    actual.total += 1;
    if (reaccion.userId === currentUserId) actual.mia = true;
    agrupadas.set(reaccion.emoji, actual);
  }

  /**
   * El preview se pide de la primera URL del mensaje, una sola vez por burbuja.
   * `previewDeLink` es un server action de la zona: solo se dispara cuando el
   * panel la trae, y el `undefined` inicial distingue "todavía no preguntado"
   * de "preguntado y sin metadatos" (`null`), para no volver a pedir.
   */
  const primeraUrl = previewDeLink
    ? trocearMensaje(message.body).find((trozo) => trozo.tipo === 'url')?.url
    : undefined;
  useEffect(() => {
    if (!primeraUrl || preview !== undefined) return;
    let activo = true;
    previewDeLink?.(primeraUrl).then((resultado) => {
      if (activo) setPreview(resultado);
    });
    return () => {
      activo = false;
    };
  }, [primeraUrl, preview, previewDeLink]);

  return (
    <article
      className={`relative flex gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${
        continued ? 'mt-0.5' : 'mt-3'
      }`}
    >
      {/**
       * Hueco del ancho del avatar cuando no se pinta, para que las burbujas
       * seguidas queden alineadas entre sí.
       *
       * ⚠️ **`w-6` porque `Avatar size="sm"` es `h-6 w-6`.** Estaba en `w-8` y el
       * resultado eran 8 px de desfase: la primera burbuja de cada bloque nacía
       * pegada al borde y las siguientes se separaban. Si algún día cambia el
       * tamaño del átomo, esto tiene que cambiar con él.
       */}
      {continued ? (
        <span className="w-6 shrink-0" aria-hidden="true" />
      ) : (
        <Avatar label={nombre} mine={mine} size="sm" />
      )}

      <div
        className={`relative flex min-w-0 max-w-[78%] flex-col gap-1 ${mine ? 'items-end' : ''}`}
      >
        {!continued && (
          <span className="flex items-baseline gap-2 px-1 font-sans text-xs">
            {hrefDePersona && !mine ? (
              <a
                href={hrefDePersona}
                title={`Escribir a ${nombre} en privado`}
                className="font-semibold text-text-primary underline-offset-2 hover:underline"
              >
                {nombre}
              </a>
            ) : (
              <span className="font-semibold text-text-primary">{mine ? 'Tú' : nombre}</span>
            )}
            <span className="text-[11px] text-text-disabled">{soloHora(message.createdAt)}</span>
            {editado && (
              <span
                title="Mensaje editado"
                className="font-sans text-[10px] uppercase tracking-wide text-text-disabled"
              >
                editado
              </span>
            )}
            {fijado && (
              <span
                title="Mensaje fijado"
                className="flex items-center gap-0.5 font-sans text-[10px]"
                style={{ color: colors.primary }}
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 17v5" />
                  <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
                </svg>
                Fijado
              </span>
            )}
          </span>
        )}

        {/**
         * ⚠️ **El `group` está aquí, en la burbuja, y no en el `<article>`.**
         *
         * Estaba en la fila entera, que ocupa todo el ancho del panel: pasar el
         * ratón por el hueco vacío de la derecha —o por el avatar, o por el
         * nombre— ya sacaba los tres botones. Con varios mensajes seguidos, se
         * encendían y apagaban solos al mover el ratón por la conversación.
         *
         * Se nombra (`group/burbuja`) a propósito: sin nombre, cualquier `group`
         * que alguien añada más arriba volvería a capturarlo sin avisar.
         */}
        {/**
         * El indicador del deslizamiento: una respuesta ↩ que se hace más
         * visible cuanto más se arrastra, hasta el umbral que la dispara.
         *
         * Vive fuera de `burbujaRef` — es su hermano, no su hijo— para que el
         * `translateX` de la burbuja no se lo lleve consigo: tiene que
         * quedarse fijo en el sitio que la burbuja está dejando al descubierto,
         * no viajar pegado a ella.
         */}
        {arrastreX !== 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full"
            style={{
              [arrastreX > 0 ? 'left' : 'right']: '0.25rem',
              opacity: Math.min(1, Math.abs(arrastreX) / ARRASTRE_UMBRAL),
              background: alpha(colors.primary, 18),
              color: colors.primary,
            }}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 10L4 15l5 5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 4v7a4 4 0 01-4 4H4" />
            </svg>
          </span>
        )}

        <div
          ref={burbujaRef}
          className="group/burbuja relative min-w-0 max-w-full rounded-2xl px-3.5 py-2"
          /* Al irse del mensaje se recogen las superficies flotantes: ni el
             selector de reacciones ni la confirmación de borrado tienen sentido
             sobre una burbuja que ya no estás mirando, y dejarlos abiertos es lo
             que obligaba a cerrarlos a mano. Cubre además el caso de abrir el
             selector y apartar el ratón sin llegar a entrar en él.

             ⚠️ **El editor NO se cierra aquí.** Un redactor abierto se queda
             hasta que se guarde, se cancele o se pulse Esc: cerrarlo al mover el
             ratón hacía que editar fuera imposible — se abría y se cerraba solo
             en cuanto el foco iba al textarea. */
          onMouseEnter={decidirDireccionBarra}
          onMouseLeave={() => {
            setConfirmandoBorrado(false);
            setEligiendoReaccion(false);
            setBarraAbajo(false);
          }}
          /* Los tres gestos táctiles: `onGestoFin` cubre tanto soltar el dedo
             como que el sistema cancele el gesto a medias (una llamada
             entrante, por ejemplo) — sin `onPointerCancel`, la burbuja se
             quedaría desplazada para siempre. */
          onPointerDown={onGestoInicio}
          onPointerMove={onGestoMueve}
          onPointerUp={onGestoFin}
          onPointerCancel={onGestoFin}
          style={{
            background: mine ? alpha(colors.primary, 16) : colors.surfaceElevated,
            /* `pan-y`: el navegador sigue scrolleando la conversación en
               vertical de forma nativa: el deslizamiento solo captura el eje
               horizontal, a mano, con los manejadores de arriba. */
            touchAction: 'pan-y',
            transform: arrastreX !== 0 ? `translateX(${arrastreX}px)` : undefined,
            transition: gestoRef.current.esDeslizamiento ? 'none' : 'transform 150ms ease-out',
            /* La esquina que apunta al avatar se queda cuadrada solo en el
               primero del bloque: es lo que agrupa los mensajes seguidos
               visualmente sin necesidad de separadores. */
            borderTopLeftRadius: !mine && !continued ? '0.35rem' : undefined,
            borderTopRightRadius: mine && !continued ? '0.35rem' : undefined,
            /* El realce de un mensaje fijado: la marca «Fijado» de arriba ya lo
               dice, pero en un bloque largo de burbujas seguidas hay que poder
               distinguirlo sin leer cada una. Un borde entero y no solo un
               tinte de fondo — el tinte por sí solo se confundía con el propio
               matiz de "mine" en las burbujas del autor. */
            outline: fijado ? `1.5px solid ${alpha(colors.primary, 55)}` : undefined,
            outlineOffset: fijado ? '-1.5px' : undefined,
          }}
        >
          {message.replyTo && (
            /**
             * La cita.
             *
             * ⚠️ Si el original se borró, `replyTo` llega `null` desde el
             * servidor —la clave foránea es `SET NULL`— y aquí simplemente no se
             * pinta nada. La respuesta se queda sin cita, no desaparece: es de
             * otra persona y sigue teniendo sentido.
             */
            <div
              /* `border-l` con el primario a secas —no `alpha(colors.overlay, …)`,
                 que es el tono casi negro de los fondos de modales—: sobre una
                 burbuja clara salía sucio, y sobre una oscura, invisible. El
                 tinte de fondo es el mismo primario, muy rebajado, así que
                 escala con el tema en vez de pelearse con él. */
              className="mb-1.5 flex flex-col gap-0.5 rounded-lg border-l-[3px] py-1 pl-2.5 pr-2"
              style={{
                borderColor: alpha(colors.primary, 70),
                background: alpha(colors.primary, 10),
              }}
            >
              <span
                className="font-sans text-[11px] font-semibold"
                style={{ color: colors.primary }}
              >
                {nombreDeAutor(message.replyTo.authorId)}
              </span>
              <span className="line-clamp-2 font-sans text-xs text-text-secondary">
                {textoPlano(message.replyTo.body)}
              </span>
            </div>
          )}

          {editando ? (
            <div className="flex flex-col gap-1.5">
              <textarea
                value={borrador}
                onChange={(evento) => setBorrador(evento.target.value)}
                onKeyDown={(evento) => {
                  /* Enter guarda, Shift+Enter salta de línea: mismo gesto que el
                     compositor. Esc cancela sin tocar nada. */
                  if (evento.key === 'Enter' && !evento.shiftKey) {
                    evento.preventDefault();
                    void confirmarEdicion();
                  } else if (evento.key === 'Escape') {
                    evento.preventDefault();
                    setEditando(false);
                  }
                }}
                ref={editorRef}
                rows={Math.min(6, Math.max(2, message.body.split('\n').length))}
                aria-label="Editar mensaje"
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-text-primary outline-none focus:border-primary"
              />
              <span className="flex items-center gap-2 self-end">
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="cursor-pointer rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarEdicion()}
                  disabled={borrador.trim().length === 0}
                  className="cursor-pointer rounded-lg px-3 py-1 font-sans text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: colors.primary, color: colors.textInverse }}
                >
                  Guardar
                </button>
              </span>
            </div>
          ) : (
            <RichText
              cuerpo={message.body}
              currentUserId={currentUserId}
              {...(hrefDeRef ? { hrefDeRef } : {})}
            />
          )}

          {/**
           * La barra de acciones del mensaje.
           *
           * ## Las seis reacciones van dentro, no detrás de un botón
           *
           * Antes había una carita que abría un segundo desplegable. Eran dos
           * pasos, dos superficies flotantes y un hueco entre ellas por el que
           * el puntero se salía —lo que hacía imposible llegar al emoji— y todo
           * para elegir entre **seis** opciones que caben de sobra en una fila.
           * Con el conjunto cerrado que tiene el chat, el menú sobraba: ahora
           * reaccionar es un clic y no hay nada que cruzar.
           *
           * ## Y por qué se solapa con la burbuja
           *
           * Se ancla sobre el borde superior, hacia dentro del ancho del
           * mensaje. Fuera se salía del viewport en pantallas estrechas y se
           * recortaba contra el borde del hilo en el primer mensaje; aquí no
           * puede pasar ninguna de las dos, porque nunca sobresale de la
           * burbuja.
           *
           * ⚠️ **Salvo un caso: el primer mensaje del scroll.** Ahí el borde de
           * arriba del contenedor **sí** recorta la barra que cuelga `-top-4`
           * —se veía cortada o directamente no se veía—. Se voltea hacia abajo
           * (`top-full`) cuando el mensaje está pegado al borde superior y la
           * barra no cabría encima: `decidirDireccionBarra` lo mide contra el
           * `scrollerRef` al pasar el ratón.
           *
           * ⚠️ **Sin `focus-within`**, que es lo que la dejaba fija: al pulsar
           * un botón el foco se queda en él y la barra no se iba al apartar el
           * ratón. `focus-visible` cubre el teclado sin ese efecto.
           */}
          {preview && <LinkPreviewCard preview={preview} mine={mine} />}

          {message.attachments.length > 0 && (
            <div className={`mt-1.5 flex flex-col gap-1.5 ${mine ? 'items-end' : ''}`}>
              {message.attachments.map((adjunto) => {
                const href = hrefDeAdjunto?.(adjunto.id) ?? '#';
                return <AttachmentCard key={adjunto.id} adjunto={adjunto} href={href} />;
              })}
            </div>
          )}

          {/**
           * La marca de hilo: «N respuestas».
           *
           * Un mensaje con respuestas es un hilo, y esta es la puerta: el número
           * que enseña el panel lateral, sin necesidad de haberlo abierto nunca.
           * La barra de acciones solo aparece al pasar el ratón; esta marca está
           * siempre — es la señal de que debajo hay conversación.
           */}
          {mostrarMarcaDeHilo && message._count.replies > 0 && (
            <button
              type="button"
              onClick={() => onAbrirHilo(message)}
              className={`mt-1.5 flex cursor-pointer items-center gap-1 self-start rounded-full border px-2.5 py-1 font-sans text-[11px] transition-colors ${
                mine ? 'self-end' : 'self-start'
              }`}
              style={{ borderColor: colors.border, color: colors.textSecondary }}
              title="Ver las respuestas"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="7" y="4" width="10" height="16" rx="2" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="11" x2="17" y2="11" />
                <line x1="7" y1="14" x2="17" y2="14" />
                <path d="M5 3.5h14" />
                <path d="M5 20.5h14" />
              </svg>
              <span className="font-medium text-text-secondary">
                {message._count.replies} {message._count.replies === 1 ? 'respuesta' : 'respuestas'}
              </span>
            </button>
          )}

          <div
            className={`absolute z-10 flex items-center gap-0.5 rounded-xl border p-1 opacity-0 shadow-lg transition-all duration-150 group-hover/burbuja:opacity-100 has-[:focus-visible]:opacity-100 ${
              /* Hacia arriba normalmente; hacia abajo (`top-full`) cuando el
                 mensaje está pegado al borde superior del scroll y arriba no
                 cabría. Ver `decidirDireccionBarra`. */
              barraAbajo ? 'top-full mt-1.5' : '-top-4'
            } ${
              /* Se ancla al lado de la burbuja que mira al centro del chat y
                 crece hacia dentro: así, con un mensaje corto, la barra —que es
                 más ancha que la burbuja— desborda hacia el medio de la
                 conversación, nunca hacia el borde del contenedor. Anclarla al
                 revés (pegada al borde exterior) era lo que la hacía salirse de
                 la pantalla con mensajes de una línea. */
              mine ? 'right-2' : 'left-2'
            } ${
              /* Mientras se confirma un borrado se queda: la pregunta no puede
                 irse antes de que se pueda responder. */
              confirmandoBorrado ? 'opacity-100' : ''
            }`}
            style={{
              background: colors.surfaceElevated,
              borderColor: colors.border,
              boxShadow: `0 8px 24px ${alpha(colors.overlay, 45)}`,
            }}
          >
            {canReact &&
              !confirmandoBorrado &&
              CHAT_REACTIONS.map((emoji) => {
                const puesta = agrupadas.get(emoji)?.mia ?? false;
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReaccionar(message.id, emoji, !puesta)}
                    aria-label={puesta ? `Quitar ${emoji}` : `Reaccionar con ${emoji}`}
                    aria-pressed={puesta}
                    title={emoji}
                    /* `active:scale-90` además del `hover`: el emoji se hunde al
                       pulsarlo y vuelve, que es el acuse de recibo que hace que
                       un clic se sienta atendido aunque la red tarde. */
                    className="cursor-pointer rounded-lg px-1 py-0.5 text-[15px] leading-none transition-transform duration-100 hover:scale-125 active:scale-90"
                    style={puesta ? { background: alpha(colors.primary, 20) } : undefined}
                  >
                    {emoji}
                  </button>
                );
              })}

            {canReact && !confirmandoBorrado && (
              <span
                aria-hidden="true"
                className="mx-0.5 h-4 w-px shrink-0"
                style={{ background: colors.border }}
              />
            )}

            {canFijar && !confirmandoBorrado && (
              <button
                type="button"
                onClick={() => onFijar(message.id, !fijado)}
                aria-label={fijado ? 'Desfijar mensaje' : 'Fijar mensaje'}
                aria-pressed={fijado}
                title={fijado ? 'Desfijar' : 'Fijar'}
                className={`cursor-pointer rounded-lg p-1 transition-colors hover:bg-surface ${
                  fijado ? 'text-primary' : 'text-text-disabled hover:text-text-primary'
                }`}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill={fijado ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 17v5" />
                  <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
                </svg>
              </button>
            )}

            {mine && !confirmandoBorrado && (
              <button
                type="button"
                onClick={() => {
                  setBorrador(message.body);
                  setEditando(true);
                }}
                aria-label="Editar mensaje"
                title="Editar"
                className="cursor-pointer rounded-lg p-1 text-text-disabled transition-colors hover:bg-surface hover:text-text-primary"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
            )}

            {!confirmandoBorrado && (
              <button
                type="button"
                onClick={() => onAbrirHilo(message)}
                aria-label="Abrir el hilo de este mensaje"
                title="Hilo"
                className="cursor-pointer rounded-lg p-1 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="7" y="4" width="10" height="16" rx="2" />
                  <line x1="7" y1="8" x2="17" y2="8" />
                  <line x1="7" y1="11" x2="17" y2="11" />
                  <line x1="7" y1="14" x2="17" y2="14" />
                  <path d="M5 3.5h14" />
                  <path d="M5 20.5h14" />
                </svg>
              </button>
            )}

            {!confirmandoBorrado && (
              <button
                type="button"
                onClick={() => onResponder(message)}
                aria-label="Responder"
                title="Responder"
                className="cursor-pointer rounded-lg p-1 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 10L4 15l5 5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 4v7a4 4 0 01-4 4H4" />
                </svg>
              </button>
            )}

            {canDelete &&
              (confirmandoBorrado ? (
                /**
                 * Al confirmar, la barra **se convierte en la pregunta**.
                 *
                 * Se ocultan las reacciones y responder: dejarlas al lado de un
                 * «Eliminar» en rojo invita a pulsar mal justo en la única
                 * acción que no se deshace. Lo que queda es la decisión.
                 */
                <span className="flex items-center gap-1 px-1">
                  <span className="font-sans text-xs text-text-secondary">¿Eliminar?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmandoBorrado(false);
                      onBorrar(message.id);
                    }}
                    aria-label="Confirmar que se elimina el mensaje"
                    className="cursor-pointer rounded-lg px-2 py-0.5 font-sans text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{ background: colors.error, color: colors.textInverse }}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrado(false)}
                    aria-label="No eliminar"
                    className="cursor-pointer rounded-lg px-2 py-0.5 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                  >
                    No
                  </button>
                </span>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="mx-0.5 h-4 w-px shrink-0"
                    style={{ background: colors.border }}
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrado(true)}
                    aria-label="Eliminar mensaje"
                    title="Eliminar"
                    className="cursor-pointer rounded-lg p-1 text-text-disabled transition-colors hover:bg-surface hover:text-error"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 7h12M10 7V5h4v2M9 7v10M15 7v10M7 7l1 12h8l1-12"
                      />
                    </svg>
                  </button>
                </>
              ))}
          </div>
        </div>

        {agrupadas.size > 0 && (
          <div className={`flex flex-wrap gap-1 px-1 ${mine ? 'justify-end' : ''}`}>
            {[...agrupadas.entries()].map(([emoji, { total, mia }]) => (
              <button
                key={emoji}
                type="button"
                disabled={!canReact}
                onClick={() => onReaccionar(message.id, emoji, !mia)}
                aria-pressed={mia}
                /* La tuya se marca con borde y fondo: en un grupo de seis
                   personas, saber si ya reaccionaste es la mitad de la
                   información que da la píldora. */
                className="flex cursor-pointer items-center gap-1 rounded-full border px-1.5 py-0.5 font-sans text-[11px] tabular-nums transition-colors disabled:cursor-not-allowed"
                style={{
                  borderColor: mia ? colors.primary : colors.border,
                  background: mia ? alpha(colors.primary, 18) : 'transparent',
                  color: mia ? colors.primary : colors.textSecondary,
                }}
              >
                <span className="text-[13px] leading-none">{emoji}</span>
                {total}
              </button>
            ))}
          </div>
        )}
      </div>

      {/**
       * La hoja de acciones táctil: lo que la pulsación larga abre.
       *
       * Reúne lo mismo que la barra de escritorio —reaccionar, fijar, editar,
       * responder, abrir el hilo, borrar— en una lista que se pulsa con el
       * pulgar, en vez de iconos de 16 px pensados para un cursor preciso.
       */}
      {hojaMontada && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Cerrar acciones"
            onClick={cerrarHoja}
            className="fixed inset-0 backdrop-blur-sm transition-opacity duration-200 ease-out"
            style={{ background: alpha(colors.overlay, 60), opacity: hojaVisible ? 1 : 0 }}
          />

          <div
            onTransitionEnd={(e) => {
              /* Solo el `transform` de este mismo elemento cuenta: los hijos
                 también disparan `transitionend` (el fondo de un botón, por
                 ejemplo) y burbujean hasta aquí. */
              if (e.target === e.currentTarget && !hojaVisible) setHojaMontada(false);
            }}
            onPointerDown={onHojaGestoInicio}
            onPointerMove={onHojaGestoMueve}
            onPointerUp={onHojaGestoFin}
            onPointerCancel={onHojaGestoFin}
            className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-1 rounded-t-2xl border-t p-3 ease-out"
            style={{
              background: colors.surfaceElevated,
              borderColor: colors.border,
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
              touchAction: 'none',
              transform: hojaVisible ? `translateY(${arrastreHojaY}px)` : 'translateY(100%)',
              transition: gestoHojaRef.current.activo ? 'none' : 'transform 220ms ease-out',
            }}
          >
            <span
              aria-hidden="true"
              className="mx-auto mb-1 h-1 w-10 rounded-full"
              style={{ background: colors.border }}
            />

            {confirmandoBorrado ? (
              <div className="flex items-center justify-between gap-3 px-2 py-3">
                <span className="font-sans text-sm text-text-primary">¿Eliminar este mensaje?</span>
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrado(false)}
                    className="cursor-pointer rounded-lg px-3 py-1.5 font-sans text-sm text-text-secondary"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      cerrarHoja();
                      onBorrar(message.id);
                    }}
                    className="cursor-pointer rounded-lg px-3 py-1.5 font-sans text-sm font-semibold"
                    style={{ background: colors.error, color: colors.textInverse }}
                  >
                    Eliminar
                  </button>
                </span>
              </div>
            ) : (
              <>
                {canReact && (
                  <div
                    className="flex items-center justify-around border-b pb-3 pt-1"
                    style={{ borderColor: colors.border }}
                  >
                    {CHAT_REACTIONS.map((emoji) => {
                      const puesta = agrupadas.get(emoji)?.mia ?? false;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            onReaccionar(message.id, emoji, !puesta);
                            cerrarHoja();
                          }}
                          aria-label={puesta ? `Quitar ${emoji}` : `Reaccionar con ${emoji}`}
                          aria-pressed={puesta}
                          className="cursor-pointer rounded-full p-1.5 text-2xl leading-none active:scale-90"
                          style={puesta ? { background: alpha(colors.primary, 20) } : undefined}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                )}

                <HojaBoton
                  etiqueta="Responder"
                  onClick={() => {
                    onResponder(message);
                    cerrarHoja();
                  }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 10L4 15l5 5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 4v7a4 4 0 01-4 4H4" />
                </HojaBoton>

                <HojaBoton
                  etiqueta="Ver hilo"
                  onClick={() => {
                    onAbrirHilo(message);
                    cerrarHoja();
                  }}
                >
                  <rect x="7" y="4" width="10" height="16" rx="2" />
                  <line x1="7" y1="8" x2="17" y2="8" />
                  <line x1="7" y1="11" x2="17" y2="11" />
                  <line x1="7" y1="14" x2="17" y2="14" />
                  <path d="M5 3.5h14" />
                  <path d="M5 20.5h14" />
                </HojaBoton>

                {canFijar && (
                  <HojaBoton
                    etiqueta={fijado ? 'Desfijar' : 'Fijar'}
                    activa={fijado}
                    onClick={() => {
                      onFijar(message.id, !fijado);
                      cerrarHoja();
                    }}
                  >
                    <path d="M12 17v5" />
                    <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
                  </HojaBoton>
                )}

                {mine && (
                  <HojaBoton
                    etiqueta="Editar"
                    onClick={() => {
                      setBorrador(message.body);
                      setEditando(true);
                      cerrarHoja();
                    }}
                  >
                    <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </HojaBoton>
                )}

                {canDelete && (
                  <HojaBoton
                    etiqueta="Eliminar"
                    destructiva
                    onClick={() => setConfirmandoBorrado(true)}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 7h12M10 7V5h4v2M9 7v10M15 7v10M7 7l1 12h8l1-12"
                    />
                  </HojaBoton>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Una fila de la hoja de acciones móvil: icono, etiqueta, todo el ancho.
 *
 * `children` son los `<path>`/`<rect>`/`<line>` del icono — el mismo trazo
 * que ya usa la barra de escritorio para la misma acción, sin duplicarlo con
 * otro juego de iconos que habría que mantener a la par.
 */
function HojaBoton({
  etiqueta,
  onClick,
  children,
  activa = false,
  destructiva = false,
}: {
  etiqueta: string;
  onClick: () => void;
  children: ReactNode;
  activa?: boolean;
  destructiva?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-3 text-left font-sans text-sm active:bg-overlay/10"
      style={{ color: destructiva ? colors.error : activa ? colors.primary : colors.textPrimary }}
    >
      <svg
        className="h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill={activa ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={activa ? 2 : 1.8}
        aria-hidden="true"
      >
        {children}
      </svg>
      {etiqueta}
    </button>
  );
}

/** Solo la hora: el día lo dice el separador que encabeza el bloque. */
function soloHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Un archivo dentro del mensaje.
 *
 * La imagen y el vídeo se pintan en línea —`<img>` y `<video>` no ejecutan
 * scripts—; el PDF se abre en otra pestaña (el gateway lo sirve dentro de un
 * sandbox sin `allow-same-origin`, así que un PDF con scripts no toca la
 * sesión); el resto sale como descarga con `nosniff`. El **SVG nunca** llega
 * aquí: no se admite al subir.
 *
 * ⚠️ **Todo se sirve por el proxy de la zona** (`/…/api/gateway/…`), que es el
 * mismo origen que la aplicación: la cookie de sesión viaja sola. Un enlace
 * directo al gateway iría sin credenciales y devolvería 401.
 */
function AttachmentCard({
  adjunto,
  href,
}: {
  adjunto: ChatAttachment;
  href: string;
}) {
  const esImagen = adjunto.mimeType.startsWith('image/');
  const esVideo = adjunto.mimeType.startsWith('video/');
  const esPdf = adjunto.mimeType === 'application/pdf';

  if (esImagen || esVideo) {
    return (
      <div
        className="overflow-hidden rounded-xl border border-border"
        style={{ background: alpha(colors.border, 30) }}
      >
        {esImagen ? (
          <img
            src={href}
            alt={adjunto.filename}
            loading="lazy"
            className="max-h-72 w-auto max-w-full object-contain"
          />
        ) : (
          /* `controls` y no reproducción automática: un vídeo que se lanza solo
             con el scroll es ruido y datos. `preload="metadata"` para no
             traer el archivo entero solo para pintar la portada. */
          <video
            src={href}
            controls
            preload="metadata"
            className="max-h-72 w-auto max-w-full bg-black"
          >
            <track kind="captions" />
          </video>
        )}
        {/* Solo el vídeo lleva el nombre debajo: la miniatura no dice de qué
            archivo es. Una imagen ya se enseña entera — el nombre del archivo
            no añade nada y es ruido en la interfaz. */}
        {esVideo && (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate font-sans text-xs text-text-secondary">
              {adjunto.filename}
            </span>
            <span className="shrink-0 font-sans text-[10px] tabular-nums text-text-disabled">
              {formatBytes(adjunto.size)}
            </span>
          </div>
        )}
      </div>
    );
  }

  /* PDF y el resto: un enlace. El PDF se sirve en línea por el gateway (sandbox
     mediante); lo demás cae como descarga. El `target="_blank"` con `noopener`
     aísla la pestaña nueva del contexto de la sesión. */
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full max-w-xs items-center gap-2.5 rounded-xl border border-border px-2.5 py-2 transition-colors hover:border-primary"
      style={{ background: alpha(colors.border, 22) }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-sans text-[9px] font-semibold uppercase text-text-secondary"
        style={{ background: alpha(colors.border, 45) }}
      >
        {extension(adjunto.filename)}
      </span>
      <span className="min-w-0 flex-1 flex-col">
        <span className="block truncate font-sans text-xs font-medium text-text-primary">
          {adjunto.filename}
        </span>
        <span className="block font-sans text-[10px] text-text-disabled">
          {esPdf ? 'Ver en otra pestaña' : 'Descargar'} · {formatBytes(adjunto.size)}
        </span>
      </span>
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-disabled"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

/** `informe-final.pdf` → `PDF`. Para el icono de los que no son imagen. */
function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1 || dot === filename.length - 1) return 'FILE';
  return filename.slice(dot + 1, dot + 5);
}

/**
 * La card de una URL con metadatos, al estilo WhatsApp.
 *
 * ⚠️ Nada de lo que trae se renderiza como HTML: título y descripción son
 * texto, y la imagen se sirve en un `<img>` nativo —que no ejecuta scripts—.
 * La URL de la imagen la validó el server action con el mismo guard SSRF que
 * la página, y se abre en pestaña nueva con `noopener`.
 */
function LinkPreviewCard({ preview, mine }: { preview: LinkPreview; mine: boolean }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-1.5 flex max-w-xs flex-col overflow-hidden rounded-xl border border-border transition-colors hover:border-primary ${
        mine ? 'items-end' : ''
      }`}
      style={{ background: alpha(colors.border, 22) }}
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          className="h-36 w-full object-cover"
          onError={(evento) => {
            /* Una imagen rota no debe matar la card: se oculta y queda el texto. */
            evento.currentTarget.remove();
          }}
        />
      )}
      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="line-clamp-1 font-sans text-xs font-semibold text-text-primary">
          {preview.title}
        </span>
        {preview.description && (
          <span className="line-clamp-2 font-sans text-[11px] text-text-secondary">
            {preview.description}
          </span>
        )}
        <span className="line-clamp-1 font-sans text-[10px] text-text-disabled">
          {dominioDe(preview.url)}
        </span>
      </span>
    </a>
  );
}

/** `https://github.com/a/b` → `github.com`. Para el pie de la card. */
function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
