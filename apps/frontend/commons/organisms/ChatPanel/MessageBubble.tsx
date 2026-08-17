'use client';

import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatRefKind } from '../../api/chat-refs';
import { trocearMensaje } from '../../api/chat-refs';
import {
  CHAT_REACTIONS,
  type ChatAttachment,
  type ChatMessage,
  type UserProfile,
  formatBytes,
  personLabel,
} from '../../api/domain';
import type { LinkPreview } from '../../api/link-preview';
import { hrefDeAvatar } from '../../api/presence';
import { Avatar } from '../../atoms/Avatar';
import { usePresencia } from '../../realtime';
import { alpha, colors } from '../../tokens';
import { AdjuntoPreview } from './AdjuntoPreview';
import { Composer, type Sugerencia } from './Composer';
import { RichText } from './RichText';
import { campoDesdeCuerpo } from './etiquetado';

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
  /** Proxy de la zona, para componer la URL de la foto de quien escribe. */
  gatewayPath: string;
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
  /**
   * Pide editar este mensaje.
   *
   * ⚠️ **La burbuja no edita.** El editor es **el compositor de abajo, el
   * mismo con el que se escribe**: se rellena con el mensaje, esconde el clip
   * y saca «Guardar» y «Cancelar». Aquí hubo un compositor propio dentro de la
   * burbuja y no era lo mismo — dos campos que mantener, dos sitios donde
   * mirar, y el de arriba salía más pequeño que el de abajo. Quien lleva el
   * estado es el panel, que es de quien es el compositor.
   */
  onPedirEdicion: (message: ChatMessage) => void;
  /** Si este mensaje es el que se está editando ahora mismo, abajo. */
  editandose?: boolean;
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
  /**
   * Si puede abrirse un hilo desde este mensaje.
   *
   * Apagado dentro del propio panel del hilo: un hilo no tiene hilo, y sin
   * esto el botón «Hilo» seguía apareciendo ahí aunque `onAbrirHilo` fuera un
   * no-op — se veía, no hacía nada, y eso es peor que no estar.
   */
  permiteAbrirHilo?: boolean;
  /**
   * Si puede responderse a este mensaje citándolo.
   *
   * ⚠️ **Apagado dentro del panel del hilo, y no por gusto.** Una respuesta
   * pertenece al hilo por tener `replyToId` apuntando a la raíz; responder a
   * una respuesta pondría ahí el id de esa respuesta, y el mensaje
   * desaparecería de los dos sitios — del hilo, porque ya no apunta a la raíz,
   * y del chat general, porque nació con `visibleEnChat: false`. Eso es lo que
   * pasaba: se enviaba y no se veía en ninguna parte. Poder responder dentro
   * de un hilo necesita un `threadRootId` en el modelo, que es del backend;
   * está anotado en PENDIENTES-BACKEND.md.
   */
  permiteResponder?: boolean;
  /**
   * El id de mensaje cuya cita **no** se pinta, aunque `message.replyTo`
   * apunte a él.
   *
   * Dentro de un hilo, cada respuesta cita a la raíz por construcción —es lo
   * que las hace parte del hilo—, así que esa cita en concreto no informa de
   * nada que la cabecera del panel no diga ya. Si `replyTo` apunta a otro
   * mensaje —la raíz citaba a un tercero antes de que alguien abriera hilo en
   * ella—, esa cita sigue siendo información nueva y se pinta igual.
   */
  ocultarCitaSiApuntaA?: string;
  /**
   * Lo que necesita el compositor cuando se edita este mensaje: si `@` ofrece
   * personas, el catálogo de sugerencias y cómo pedirlo.
   *
   * Viene del panel y no de aquí porque el catálogo es **del canal**: pedirlo
   * por burbuja serían tantas consultas como mensajes en pantalla.
   */
  permiteMenciones: boolean;
  sugerencias: Sugerencia[];
  onPedirSugerencias: () => void;
  /**
   * Quién ha leído **este** mensaje. Vacío si nadie o si no se sabe.
   *
   * ⚠️ **Antes esto se pintaba como una fila de caritas bajo el mensaje**, y
   * salía también en los tuyos: ahí lo que se quiere saber no es una lista de
   * caras, es si ya llegó. Ahora alimenta dos cosas distintas — los checks de
   * tus propios mensajes y la lista que abre «Quién lo ha visto»— y no ocupa
   * una línea por conversación.
   */
  vistoPor?: string[];
  /**
   * Cuánta gente además de ti puede leer el canal.
   *
   * Con esto y `vistoPor` se decide el segundo check: **visto por todos** solo
   * cuando no falta nadie. Sin el total, «todos» sería «todos los que alguna
   * vez abrieron el canal», que es otra cosa y más optimista.
   */
  cuantosPuedenVer?: number;
  /**
   * Si se pinta la marca de «visto» bajo tus propios mensajes.
   *
   * ⚠️ **El panel del hilo la apaga**, y no es una preferencia estética: dentro
   * de un hilo esa marca **no significa nada**. Los acuses de lectura se guardan
   * por canal (`ChatChannelState.lastReadAt`), no por mensaje, así que lo único
   * que se sabe es hasta qué momento ha leído cada persona la conversación —no
   * si ha abierto un hilo concreto ni hasta dónde ha llegado dentro de él.
   *
   * Con la marca puesta, un check gris bajo una respuesta de hilo se lee como
   * «llegó pero nadie lo ha visto», que es una afirmación que el sistema no
   * puede hacer. Vale más no decir nada que decir algo que no se sabe.
   *
   * Contestarlo de verdad exigiría acuses **por mensaje** —una fila por mensaje
   * y por persona— y es una decisión de modelo, no un arreglo de interfaz.
   */
  mostrarVisto?: boolean;
  /** Nombre de quien escribió el mensaje citado, para la cita. */
  nombreDeAutor: (userId: string) => string;
  /** Preview de la primera URL del mensaje, si el panel la sabe pedir. */
  previewDeLink?: (url: string) => Promise<LinkPreview | null>;
  /** Si el chat es de proyecto o directo. Necesario para mostrar Visto por. */
  isProjectChat?: boolean;
}

/**
 * Un mensaje.
 *
 * ## Las acciones aparecen al pulsar, no siempre ni al pasar por encima
 *
 * Tres botones fijos en cada burbuja convierten la conversación en una rejilla
 * de controles y le quitan sitio al texto, que es lo único que se viene a leer.
 *
 * ⚠️ **Estuvieron en `:hover` y era peor que tenerlos fijos**: la barra saltaba
 * sola al recorrer la conversación leyendo, seis emojis y cinco botones
 * apareciendo bajo el cursor en cada mensaje que cruzabas sin haber pedido
 * nada. Ahora abre un clic sobre el mensaje y cierra otro clic —en el mensaje,
 * fuera, o sobre la acción que elijas—, el mismo trato deliberado que la hoja
 * táctil. El teclado las saca con `focus-visible`, así que quien navega con
 * tabulador no se queda sin botones que existen.
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
  gatewayPath,
  scrollerRef,
  onResponder,
  onReaccionar,
  onFijar,
  onPedirEdicion,
  editandose = false,
  onBorrar,
  onAbrirHilo,
  mostrarMarcaDeHilo = true,
  permiteAbrirHilo = true,
  permiteResponder = true,
  ocultarCitaSiApuntaA,
  permiteMenciones,
  sugerencias,
  onPedirSugerencias,
  vistoPor = [],
  cuantosPuedenVer = 0,
  mostrarVisto = true,
  nombreDeAutor,
  previewDeLink,
  isProjectChat = false,
}: MessageBubbleProps) {
  const fijado = message.pinnedAt !== null && message.pinnedAt !== undefined;
  const editado = message.editedAt !== null && message.editedAt !== undefined;
  const sinTexto = message.body.trim().length === 0;

  /**
   * El acuse de tu propio mensaje: **entregado** o **visto por todos**.
   *
   * Un check gris significa que está guardado en el servidor —si se está
   * viendo, lo está—; dos en azul, que no falta nadie por leerlo. El estado
   * intermedio («lo han visto tres de cinco») no tiene marca propia a
   * propósito: son tres estados para una esquina de 14 px, y el detalle está a
   * un clic en «Quién lo ha visto».
   *
   * Solo en los tuyos: en el mensaje de otra persona, decirte que tú lo has
   * visto no informa de nada.
   */
  const vistoPorTodos = cuantosPuedenVer > 0 && vistoPor.length >= cuantosPuedenVer;
  const [listaDeVistos, setListaDeVistos] = useState(false);
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
  /**
   * Cómo se lee quien escribió.
   *
   * ⚠️ El respaldo **no** es la cadena «Alguien que ya no está» a pelo: eso
   * afirmaba que la cuenta se había ido cada vez que el perfil no estaba en el
   * mapa, y no estar en el mapa también pasa cuando el directorio no se pudo
   * consultar. Se delega en `nombreDeAutor`, que sí conoce esa diferencia.
   */
  const nombre = author ? personLabel(author) : nombreDeAutor(message.authorId);
  /* Lo del perfil es del último render de la página; el flujo en vivo lo pisa. */
  const presencia = usePresencia(message.authorId, author?.presence);

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
    /** Si este mensaje admite la respuesta rápida al deslizar. */
    puedeDeslizar: true,
    temporizador: null as ReturnType<typeof setTimeout> | null,
  });

  function limpiarTemporizador() {
    if (gestoRef.current.temporizador) {
      clearTimeout(gestoRef.current.temporizador);
      gestoRef.current.temporizador = null;
    }
  }

  function onGestoInicio(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch' || editandose || confirmandoBorrado) return;
    /* Sin respuesta posible no hay deslizamiento que valga: dentro de un hilo
       arrastrar la burbuja no llevaba a ninguna parte. La pulsación larga sí
       sigue abriendo la hoja, que ahí tiene el resto de acciones. */
    gestoRef.current.startX = e.clientX;
    gestoRef.current.startY = e.clientY;
    gestoRef.current.siguiendo = true;
    gestoRef.current.esDeslizamiento = false;
    gestoRef.current.puedeDeslizar = permiteResponder;
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
      if (!gestoRef.current.puedeDeslizar || Math.abs(dy) > Math.abs(dx)) {
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
   * Hacia dónde se abre la barra de acciones.
   *
   * Por defecto hacia arriba (`-top-4`), pero cuando el mensaje está pegado al
   * borde superior del scroll la barra quedaría **fuera del área visible y se
   * recortaría**. Se voltea hacia abajo para que las acciones siempre se vean.
   */
  const [barraAbajo, setBarraAbajo] = useState(false);

  /**
   * Si la barra de acciones está desplegada.
   *
   * ⚠️ **Se abre al pulsar el mensaje, no al pasar el ratón por encima.** Con
   * `:hover` la barra saltaba sola mientras se recorría la conversación
   * leyendo: seis emojis y cinco botones apareciendo y desapareciendo bajo el
   * cursor a cada mensaje que cruzabas, sin haber pedido nada. Ahora es un
   * gesto deliberado —clic para abrir, clic fuera o elegir algo para cerrar—,
   * el mismo trato que la hoja de acciones táctil.
   */
  const [barraAbierta, setBarraAbierta] = useState(false);

  /**
   * Cerrar al pulsar en cualquier otro sitio.
   *
   * En la fase de **captura** y no en la de burbujeo: en burbujeo, el mismo
   * clic que abre la barra llegaría después al documento y la cerraría en el
   * acto. Se ignora lo que caiga dentro de la propia burbuja, que es quien
   * gobierna su barra.
   */
  /**
   * La lista de «visto por» es **un modo de la barra**, no una superficie
   * aparte: en cuanto la barra se recoge —por un clic fuera, por elegir una
   * acción o por lo que sea— la lista deja de tener sitio donde vivir.
   *
   * Va en un efecto y no en cada manejador porque hay seis caminos que cierran
   * la barra, y bastaba olvidarse de uno para que al volver a abrirla saliera
   * la lista en vez de las acciones.
   */
  useEffect(() => {
    if (!barraAbierta) setListaDeVistos(false);
  }, [barraAbierta]);

  useEffect(() => {
    if (!barraAbierta) return;
    function alPulsarFuera(evento: MouseEvent) {
      if (burbujaRef.current?.contains(evento.target as Node)) return;
      setBarraAbierta(false);
      setConfirmandoBorrado(false);
      setListaDeVistos(false);
    }
    document.addEventListener('click', alPulsarFuera, true);
    return () => document.removeEventListener('click', alPulsarFuera, true);
  }, [barraAbierta]);

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

  /**
   * Un mensaje que **solo** es una imagen o un vídeo: sin texto, sin cita, sin
   * marca de hilo y sin preview de enlace.
   *
   * Sirve para quitarle el margen superior al medio, que solo separa de un
   * texto que aquí no hay.
   *
   * ⚠️ **La burbuja conserva su relleno.** Estuvo sin él, con la foto pegada a
   * los cuatro bordes, y así **no quedaba un solo píxel de burbuja donde
   * pulsar**: cualquier clic caía sobre la imagen —que abre el visor— en vez de
   * sobre el mensaje, que es lo que despliega responder, reaccionar y el resto.
   * El medio llena la tarjeta interior, y ese marco de dos milímetros es la
   * zona por la que se agarra el mensaje.
   */
  const citaVisible = Boolean(message.replyTo && message.replyTo.id !== ocultarCitaSiApuntaA);
  const marcaHiloVisible = Boolean(mostrarMarcaDeHilo && message._count.replies > 0);
  const soloMedia =
    !editandose &&
    sinTexto &&
    !citaVisible &&
    !marcaHiloVisible &&
    !preview &&
    message.attachments.length > 0 &&
    message.attachments.every(
      (adjunto) => adjunto.mimeType.startsWith('image/') || adjunto.mimeType.startsWith('video/'),
    );

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

  /**
   * Un mensaje borrado: la lápida, y nada más.
   *
   * ## Por qué se corta aquí arriba y no se apagan las acciones una a una
   *
   * Un mensaje borrado no tiene texto, ni adjuntos, ni reacciones, ni cita que
   * pintar, y **ninguna** acción tiene sentido sobre él: responderlo dejaría una
   * cita vacía, reaccionar sería reaccionar a nada, fijarlo lo anclaría para
   * siempre a un hueco y editarlo lo resucitaría con texto nuevo. Apagarlas de
   * una en una serían siete condiciones repartidas por cuatrocientas líneas, y
   * bastaría con olvidar una para reabrir el agujero. Saliendo por aquí no hay
   * barra que apagar, ni gestos táctiles, ni menú: no existen.
   *
   * El servidor rechaza las cuatro por su cuenta (`ChatService`), así que esto
   * es lo que se ve, no lo que lo impide.
   *
   * Se conserva el sitio, el autor y la hora, que es justo lo que hace que la
   * conversación siga leyéndose: sin la fila, quien está mirando solo ve que
   * algo se ha movido.
   */
  if (message.deletedAt) {
    return (
      <article
        className={`relative flex min-w-0 gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${
          continued ? 'mt-0.5' : 'mt-3'
        }`}
      >
        {/* El hueco del avatar, para que la lápida quede en la misma columna que
            el resto de burbujas y no se desalinee el bloque. */}
        <span className="w-6 shrink-0" aria-hidden="true" />

        <div className={`flex min-w-0 max-w-[78%] flex-col gap-1 ${mine ? 'items-end' : ''}`}>
          {!continued && (
            <span className="flex items-center gap-2 px-1 font-sans text-xs">
              <span className="font-semibold text-text-disabled">{mine ? 'Tú' : nombre}</span>
            </span>
          )}

          <div
            /* Borde discontinuo y fondo transparente: se lee como un hueco
               marcado y no como un mensaje más. Una burbuja sólida con texto en
               cursiva se confundía con alguien que hubiera escrito eso. */
            className="flex items-center gap-2 rounded-2xl border border-dashed px-3.5 py-2"
            style={{ borderColor: colors.border }}
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 text-text-disabled"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M5.6 5.6l12.8 12.8" />
            </svg>
            <span className="font-sans text-xs italic text-text-disabled">Mensaje eliminado</span>
            <span className="font-sans text-[11px] text-text-disabled">
              {soloHora(message.createdAt)}
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`relative flex min-w-0 gap-2.5 ${mine ? 'flex-row-reverse' : ''} ${
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
        <Avatar
          label={nombre}
          mine={mine}
          size="sm"
          src={hrefDeAvatar(author?.avatarUrl, gatewayPath)}
          /* El punto de estado también en el chat: saber que alguien está en
             una reunión explica por qué no contesta, y ese es justo el momento
             en que se mira. Va por `usePresencia` para que cambie solo sin
             recargar la conversación. */
          presence={presencia}
        />
      )}

      <div
        className={`relative flex min-w-0 max-w-[78%] flex-col gap-1 ${mine ? 'items-end' : ''}`}
      >
        {!continued && (
          /**
           * La cabecera: **quién**, y nada más.
           *
           * ⚠️ La hora, los checks y la marca «editado» **estaban aquí**, y esa
           * era la razón de que no se pudiera saber hasta dónde te habían leído:
           * la cabecera solo se pinta cuando el mensaje **no** continúa un
           * bloque, así que en una ráfaga de cinco mensajes seguidos solo el
           * primero llevaba hora y checks. Los otros cuatro no decían nada, y
           * los del primero se leían como si valieran para todo el bloque.
           *
           * Ahora esos tres bajan **dentro de la burbuja**, uno por mensaje —el
           * modelo de WhatsApp y Telegram—, así que cada mensaje dice su propia
           * hora y su propio estado de lectura. Ver `PieDeBurbuja`.
           *
           * `items-center` y no `items-baseline`: un `<svg>` no tiene línea
           * base, y en una fila alineada por ella los iconos se apoyan en el
           * borde inferior de su caja.
           */
          <span className="flex items-center gap-2 px-1 font-sans text-xs">
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

        {/* biome-ignore lint/a11y/useKeyWithClickEvents: ver el comentario de `onClick`, más abajo — la burbuja no es un control y el teclado llega a la barra por tabulación */}
        <div
          ref={burbujaRef}
          className={`relative min-w-0 max-w-full rounded-2xl ${
            /* ⚠️ **Solo un medio: relleno igual por los cuatro lados.** El de
               un mensaje de texto (`px-3.5 py-2`) es más ancho que alto a
               propósito —así se lee mejor una línea— pero alrededor de una foto
               ese desajuste se ve: dos milímetros arriba y cuatro a los lados,
               como un marco mal cortado. */
            soloMedia ? 'p-2' : 'px-3.5 py-2'
          } ${
            /* El puntero de mano dice que la burbuja hace algo al pulsarla
               —abre sus acciones—, que es justo lo que no se adivinaba desde
               que dejaron de salir al pasar el ratón. Mientras se edita no:
               ahí lo que hay es un campo de texto. */
            editandose ? '' : 'cursor-pointer'
          }`}
          /* Al irse del mensaje se recogen las superficies flotantes: ni el
             selector de reacciones ni la confirmación de borrado tienen sentido
             sobre una burbuja que ya no estás mirando, y dejarlos abiertos es lo
             que obligaba a cerrarlos a mano. Cubre además el caso de abrir el
             selector y apartar el ratón sin llegar a entrar en él.

             ⚠️ **El editor NO se cierra aquí.** Un redactor abierto se queda
             hasta que se guarde, se cancele o se pulse Esc: cerrarlo al mover el
             ratón hacía que editar fuera imposible — se abría y se cerraba solo
             en cuanto el foco iba al textarea. */
          /**
           * Pulsar el mensaje despliega —o recoge— su barra de acciones.
           *
           * ⚠️ **Se ignora el clic que cae sobre algo interactivo**: un enlace,
           * una mención, un adjunto, un botón de la propia barra. Sin ese
           * filtro, seguir una mención abría además la barra sobre el mensaje
           * que dejabas atrás, y cada botón de la barra la cerraba al pulsarlo.
           *
           * La burbuja **no es un control**: lleva texto seleccionable,
           * enlaces y menciones, y convertirla en `<button>` rompería las
           * tres. El teclado no depende de este clic — los botones de la barra
           * entran en el orden de tabulación y `has-[:focus-visible]` la
           * revela al llegar—, que es lo que justifica el silencio de la regla.
           */
          onClick={(evento) => {
            if (editandose || (evento.target as HTMLElement).closest('a,button,video,input'))
              return;
            if (!barraAbierta) decidirDireccionBarra();
            setBarraAbierta((previa) => !previa);
            setConfirmandoBorrado(false);
            /* La lista es un modo de la barra: al recogerla, se recoge. */
            setListaDeVistos(false);
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
          {message.replyTo && message.replyTo.id !== ocultarCitaSiApuntaA && (
            /**
             * La cita.
             *
             * ⚠️ Si el original se borró, `replyTo` llega `null` desde el
             * servidor —la clave foránea es `SET NULL`— y aquí simplemente no se
             * pinta nada. La respuesta se queda sin cita, no desaparece: es de
             * otra persona y sigue teniendo sentido.
             */
            <div
              /* Solo el tinte de fondo, sin barra lateral. Llevaba un
                 `border-l-[3px]` del color primario y sobraba: el bloque ya se
                 distingue por el fondo teñido y el nombre en color, y la barra
                 metía un tercer acento vertical en una burbuja que ya tiene su
                 propio borde. El tinte usa el primario muy rebajado, así que
                 escala con el tema en vez de pelearse con él. */
              className="mb-1.5 flex flex-col gap-0.5 rounded-lg px-2.5 py-1"
              style={{ background: alpha(colors.primary, 10) }}
            >
              <span
                className="font-sans text-[11px] font-semibold"
                style={{ color: colors.primary }}
              >
                {nombreDeAutor(message.replyTo.authorId)}
              </span>
              <span className="line-clamp-2 font-sans text-xs text-text-secondary">
                <AdjuntoPreview mensaje={message.replyTo} />
              </span>
            </div>
          )}

          {/* El cuerpo. Editarlo no pasa por aquí: lo hace el compositor de
              abajo, que es el mismo con el que se escribe. */}
          {
            /* Un mensaje que solo trae adjuntos no pinta cuerpo: un `<p>` vacío
               sigue ocupando su línea, y esa línea era la franja de color de más
               que se veía encima de una foto. */
            !sinTexto && (
              <RichText
                cuerpo={message.body}
                currentUserId={currentUserId}
                {...(hrefDeRef ? { hrefDeRef } : {})}
              />
            )
          }

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
           * barra no cabría encima: `decidirDireccionBarra` lo mide justo antes
           * de abrirla, contra el `scrollerRef`.
           */}
          {preview && <LinkPreviewCard preview={preview} mine={mine} />}

          {message.attachments.length > 0 && (
            <div
              className={`flex flex-col gap-1.5 ${mine ? 'items-end' : ''} ${
                soloMedia ? '' : 'mt-1.5'
              }`}
            >
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
           * La barra de acciones solo aparece al pulsar; esta marca está
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

          {/**
           * El pie de la burbuja: hora, «editado» y los checks de lectura.
           *
           * ## Por qué está aquí abajo y no en la cabecera
           *
           * ⚠️ **Estaba en la cabecera, y la cabecera solo se pinta una vez por
           * bloque.** Cinco mensajes seguidos tuyos compartían la hora y los
           * checks del primero: no había forma de saber hasta cuál te habían
           * leído, que es justo lo que el «visto» tiene que contestar. Con el
           * pie dentro de cada burbuja, cada mensaje lleva su marca y el corte
           * de lectura se ve de un vistazo — es el modelo de WhatsApp y
           * Telegram, y funciona por eso.
           *
           * ## Que no se solape con el texto
           *
           * Va en su propia fila (`flex justify-end`) y no flotando sobre la
           * última línea. Flotar ahorra un renglón y a cambio obliga a reservar
           * un hueco a la derecha del texto que depende del ancho exacto de la
           * hora, del idioma y de si hay checks: con un mensaje de una sola
           * palabra el hueco es más ancho que el mensaje. Una fila propia no
           * puede solaparse nunca.
           *
           * `-mb-0.5` recupera parte del alto que añade: el relleno inferior de
           * la burbuja ya separa lo suficiente.
           */}
          <span
            className={`-mb-0.5 mt-1 flex items-center gap-1.5 font-sans text-[10px] leading-none text-text-disabled ${
              mine ? 'justify-end' : 'justify-start'
            }`}
          >
            {editado && (
              <span title="Mensaje editado" className="uppercase tracking-wide">
                editado
              </span>
            )}
            <span>{soloHora(message.createdAt)}</span>
            {mine && mostrarVisto && (
              <ChecksDeEnvio vistoPorTodos={vistoPorTodos} cuantosLoVieron={vistoPor.length} />
            )}
          </span>

          <div
            className={`absolute z-10 flex items-center gap-0.5 rounded-xl border p-1 shadow-lg transition-all duration-150 max-md:hidden has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100 ${
              /* Abierta por un clic en el mensaje. `pointer-events-none` al
                 estar cerrada: una barra invisible pero clicable se tragaba
                 los clics del mensaje que hay encima. El `has-[:focus-visible]`
                 de arriba la devuelve para quien navega con tabulador. */
              barraAbierta || confirmandoBorrado ? 'opacity-100' : 'pointer-events-none opacity-0'
            } ${
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
            }`}
            /**
             * ⚠️ **En oscuro, la sombra no separa nada.**
             *
             * Una sombra funciona proyectando oscuridad sobre lo de debajo: en
             * tema claro despega la barra del fondo, pero sobre un fondo ya
             * oscuro no hay contraste que añadir y la barra se fundía con los
             * mensajes. Lo que sí separa en los dos temas es un **borde
             * marcado** y un fondo un punto más claro, así que el contraste se
             * confía al borde y la sombra se queda solo como profundidad.
             */
            style={{
              background: colors.surfaceElevated,
              borderColor: colors.borderStrong,
              boxShadow: `0 8px 24px ${alpha(colors.overlay, 45)}, 0 0 0 1px ${alpha(
                colors.borderStrong,
                60,
              )}`,
            }}
          >
            {/**
             * Pedir «quién lo ha visto» **convierte la barra en la lista**, el
             * mismo trato que la pregunta de borrado unas líneas más abajo.
             *
             * ⚠️ Estuvo como un panel aparte, bajo el mensaje, con su propio
             * estado: se quedaba abierto indefinidamente después de cerrar la
             * barra y había que volver a pulsar el ojo para quitarlo. Viviendo
             * dentro, se va con ella y no hay un segundo sitio que cerrar.
             */}
            {listaDeVistos ? (
              <span className="flex max-w-56 flex-col gap-0.5 px-1.5 py-0.5">
                <span className="font-sans text-[10px] uppercase tracking-wide text-text-disabled">
                  Visto por
                </span>
                {vistoPor.map((userId) => (
                  <span key={userId} className="truncate font-sans text-xs text-text-primary">
                    {nombreDeAutor(userId)}
                  </span>
                ))}
              </span>
            ) : (
              <>
                {canReact &&
                  !confirmandoBorrado &&
                  CHAT_REACTIONS.map((emoji) => {
                    const puesta = agrupadas.get(emoji)?.mia ?? false;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          onReaccionar(message.id, emoji, !puesta);
                          setBarraAbierta(false);
                        }}
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
                    onClick={() => {
                      onFijar(message.id, !fijado);
                      setBarraAbierta(false);
                    }}
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
                      onPedirEdicion(message);
                      setBarraAbierta(false);
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

                {!confirmandoBorrado && permiteAbrirHilo && (
                  <button
                    type="button"
                    onClick={() => {
                      onAbrirHilo(message);
                      setBarraAbierta(false);
                    }}
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

                {!confirmandoBorrado && permiteResponder && (
                  <button
                    type="button"
                    onClick={() => {
                      onResponder(message);
                      setBarraAbierta(false);
                    }}
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20 4v7a4 4 0 01-4 4H4"
                      />
                    </svg>
                  </button>
                )}

                {/**
                 * Quién lo ha visto.
                 *
                 * En la barra y no bajo el mensaje: es un dato que se consulta
                 * cuando hace falta —«¿lo habrá leído ya?»— no algo que quieras
                 * leer en cada burbuja mientras repasas la conversación. Ahí
                 * estaba antes y ocupaba una línea por mensaje.
                 *
                 * Solo aparece si alguien lo ha visto: un botón que abre una lista
                 * vacía es un botón que no había que ofrecer.
                 */}
                {/* Solo en los tuyos: en el mensaje de otra persona, saber quién
                más lo ha visto no es asunto de quien lo lee — y ahí el dato
                que importa ya lo da su propio autor. */}
                {!confirmandoBorrado &&
                  mine &&
                  mostrarVisto &&
                  vistoPor.length > 0 &&
                  isProjectChat && (
                    <button
                      type="button"
                      onClick={() => setListaDeVistos((previo) => !previo)}
                      aria-label="Ver quién lo ha visto"
                      aria-expanded={listaDeVistos}
                      title={`Visto por ${vistoPor.length}`}
                      className="flex cursor-pointer items-center gap-0.5 rounded-lg p-1 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
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
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span className="font-sans text-[10px] tabular-nums">{vistoPor.length}</span>
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
                          setBarraAbierta(false);
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
              </>
            )}
          </div>
        </div>

        {agrupadas.size > 0 && (
          <div className={`flex flex-wrap items-center gap-1 px-1 ${mine ? 'justify-end' : ''}`}>
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

                {permiteResponder && (
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
                )}

                {permiteAbrirHilo && (
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
                )}

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
                      onPedirEdicion(message);
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

  const [ampliada, setAmpliada] = useState(false);

  if (esImagen) {
    return (
      <>
        {/**
         * La imagen es un botón: pulsarla la abre a tamaño completo.
         *
         * ⚠️ **Sin nombre ni tamaño debajo.** Los llevaba, y en una foto no
         * dicen nada que la propia foto no diga —«captura-2026-08-15.png ·
         * 240 kB»— mientras ocupaban una franja de color bajo cada imagen.
         * Siguen estando donde sí importan: en un archivo que no se puede
         * mirar, más abajo.
         */}
        <button
          type="button"
          onClick={() => setAmpliada(true)}
          aria-label={`Ver ${adjunto.filename} a tamaño completo`}
          className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border"
        >
          <img
            src={href}
            alt={adjunto.filename}
            loading="lazy"
            /* `w-full` y no `w-auto`: la imagen llena el ancho de la burbuja en
               vez de dejar una franja de fondo a los lados. El alto se limita
               para que una foto vertical no se coma la conversación entera. */
            className="block max-h-96 w-full object-cover"
          />
        </button>

        {ampliada && (
          <VisorImagen href={href} nombre={adjunto.filename} onCerrar={() => setAmpliada(false)} />
        )}
      </>
    );
  }

  if (esVideo) {
    return <ReproductorVideo href={href} />;
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
/**
 * La imagen a tamaño completo, sobre el resto de la aplicación.
 *
 * Cierra con Esc, con el aspa o pulsando el fondo — las tres, porque quien
 * amplía una foto para mirarla un segundo no quiere buscar cómo salir. El
 * `overflow` del `body` se bloquea mientras está abierto: sin eso, la rueda del
 * ratón mueve la conversación de debajo y al cerrar te has perdido de sitio.
 */
function VisorImagen({
  href,
  nombre,
  onCerrar,
}: {
  href: string;
  nombre: string;
  onCerrar: () => void;
}) {
  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = previo;
    };
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-10">
      <button
        type="button"
        aria-label="Cerrar la imagen"
        onClick={onCerrar}
        className="fixed inset-0 cursor-zoom-out backdrop-blur-sm"
        style={{ background: alpha(colors.overlay, 82) }}
      />

      <img
        src={href}
        alt={nombre}
        /* `pointer-events-none`: cualquier clic —también el que cae sobre la
           propia foto— tiene que llegar al fondo y cerrar. */
        className="pointer-events-none relative max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir en otra pestaña"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition-transform hover:scale-105 sm:right-8 sm:top-8"
        style={{ background: alpha(colors.overlay, 55), color: colors.textInverse }}
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
          <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        <span className="sr-only">Abrir la imagen en otra pestaña</span>
      </a>
    </div>
  );
}

/** `m:ss`, o `h:mm:ss` si pasa de la hora. Para los tiempos del reproductor. */
function reloj(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return '0:00';
  const total = Math.floor(segundos);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const dos = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

/**
 * El reproductor de vídeo del chat.
 *
 * ## Por qué no `controls` a secas
 *
 * Los controles nativos son de cada navegador: en Chrome son una barra gris
 * opaca con su propio tipo de letra y su propio menú de tres puntos, en Safari
 * son otra cosa distinta, y ninguno se parece al resto de PRAXIS. Aquí se
 * dibujan los cuatro que hacen falta —reproducir, buscar, silenciar, pantalla
 * completa— con los tokens del sistema.
 *
 * ⚠️ **Nada de reproducción automática.** Un vídeo que arranca solo al pasar
 * por el scroll es ruido y datos de alguien. Empieza cuando se pulsa.
 * `preload="metadata"` trae solo la duración y el primer fotograma para poder
 * pintar la barra, no el archivo entero.
 */
/**
 * Blanco fijo para todo lo que va **encima del vídeo**.
 *
 * ⚠️ **Aquí no valen los tokens de texto.** `textInverse` se invierte con el
 * tema —negro en claro, blanco en oscuro— y estos controles no están sobre el
 * fondo de la aplicación: están sobre el vídeo, que es negro siempre. Con el
 * token, en uno de los dos temas los iconos quedaban negros sobre negro y no
 * se distinguían.
 */
const TINTA_SOBRE_VIDEO = '#ffffff';

/** El velo de los botones flotantes del reproductor. Negro, no `overlay`. */
const VELO_SOBRE_VIDEO = 'rgba(0, 0, 0, 0.55)';

function ReproductorVideo({ href }: { href: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [silenciado, setSilenciado] = useState(false);
  const [momento, setMomento] = useState(0);
  const [duracion, setDuracion] = useState(0);

  /**
   * Si esta caja es la que está a pantalla completa.
   *
   * ⚠️ **Hace falta saberlo, y esto es lo que estaba roto.** Quien va a
   * pantalla completa es el contenedor —no el `<video>`, para que los controles
   * propios sigan encima—, así que el vídeo se quedaba con el `max-h-96` del
   * chat: un recuadro pequeño arriba del todo y el resto de la pantalla en
   * negro. En pantalla completa el vídeo tiene que llenar la caja y centrarse,
   * que es lo único que cambia.
   *
   * Se escucha `fullscreenchange` en vez de fiarse del clic: también se sale
   * con Esc, con el gesto del sistema o desde otra pestaña, y en esos casos
   * nadie llamaría a nuestro manejador.
   */
  const [aPantallaCompleta, setAPantallaCompleta] = useState(false);

  /* El vídeo que ya venía cargado de la caché: su `loadedmetadata` ocurrió
     antes de montar esto, así que se lee directamente. */
  useEffect(() => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      setDuracion(video.duration);
    }
  }, []);

  useEffect(() => {
    function alCambiar() {
      setAPantallaCompleta(document.fullscreenElement === cajaRef.current);
    }
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  function alternarPantallaCompleta() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void cajaRef.current?.requestFullscreen?.();
  }

  function alternar() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  const progreso = duracion > 0 ? (momento / duracion) * 100 : 0;

  return (
    <div
      ref={cajaRef}
      className={`group/video relative overflow-hidden bg-black ${
        aPantallaCompleta
          ? 'flex h-full w-full items-center justify-center'
          : 'rounded-xl border border-border'
      }`}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: los adjuntos los sube quien escribe y no hay pista de subtítulos que ofrecer */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: pulsar el vídeo para pausarlo es el gesto de cualquier reproductor; el teclado tiene los botones de la barra, que sí son `<button>` y entran en el orden de tabulación */}
      <video
        ref={videoRef}
        src={href}
        preload="metadata"
        playsInline
        onClick={alternar}
        onPlay={() => setReproduciendo(true)}
        onPause={() => setReproduciendo(false)}
        onTimeUpdate={(evento) => setMomento(evento.currentTarget.currentTime)}
        /**
         * ⚠️ **`loadedmetadata` no basta, y esa era la causa de que la barra no
         * se pudiera mover.**
         *
         * Ese evento se dispara **una sola vez y muy pronto**: si el vídeo ya
         * está en la caché del navegador —el caso al recargar, o al volver a un
         * chat— ya ha ocurrido antes de que React enganche el manejador, así
         * que nunca llega y `duracion` se queda en 0. Con `max={0}` el
         * deslizador no admite ningún valor y el contador dice «0:00 / 0:00»:
         * exactamente el fallo intermitente que se veía —unos vídeos sí y otros
         * no, y ninguno tras refrescar—.
         *
         * Se cierra por tres lados: este evento, `durationchange` (que sí llega
         * en más casos) y una lectura al montar, más abajo, para el vídeo que
         * ya venía listo.
         */
        onLoadedMetadata={(evento) => setDuracion(evento.currentTarget.duration)}
        onDurationChange={(evento) => setDuracion(evento.currentTarget.duration)}
        onVolumeChange={(evento) => setSilenciado(evento.currentTarget.muted)}
        className={`block cursor-pointer object-contain ${
          aPantallaCompleta ? 'h-full max-h-none w-full' : 'max-h-96 w-full'
        }`}
      />

      {/**
       * El botón grande del centro, solo mientras está parado. Al reproducir se
       * va: un triángulo sobre la imagen en marcha tapa justo lo que se está
       * viendo.
       */}
      {!reproduciendo && (
        <button
          type="button"
          onClick={alternar}
          aria-label="Reproducir"
          className="absolute inset-0 flex cursor-pointer items-center justify-center"
        >
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full backdrop-blur transition-transform hover:scale-105"
            style={{ background: VELO_SOBRE_VIDEO, color: TINTA_SOBRE_VIDEO }}
          >
            <svg
              className="ml-0.5 h-6 w-6"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}

      {/**
       * La barra inferior. Aparece al pasar por encima y **mientras está
       * parado**: si solo dependiera del hover, en táctil no habría forma de
       * llegar a ella.
       */}
      <div
        className={`absolute inset-x-0 bottom-0 flex items-center gap-2 px-2.5 pb-2 pt-6 transition-opacity ${
          reproduciendo ? 'opacity-0 group-hover/video:opacity-100' : 'opacity-100'
        }`}
        style={{
          /* Negro fijo, no `overlay`: el degradado va sobre el vídeo. */
          background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
        }}
      >
        <button
          type="button"
          onClick={alternar}
          aria-label={reproduciendo ? 'Pausar' : 'Reproducir'}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
          style={{ color: TINTA_SOBRE_VIDEO }}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {reproduciendo ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" /> : <path d="M8 5v14l11-7z" />}
          </svg>
        </button>

        {/* Buscar. Un `range` nativo con la pista pintada a mano: es el único
            control que ya sabe de teclado, arrastre y accesibilidad. */}
        <input
          type="range"
          min={0}
          /* Sin duración conocida el deslizador se desactiva en vez de quedarse
             mudo con `max=0`: así se ve que aún no se puede mover. */
          max={duracion || 1}
          disabled={duracion <= 0}
          step={0.1}
          value={momento}
          aria-label="Buscar en el vídeo"
          onChange={(evento) => {
            const video = videoRef.current;
            if (!video) return;
            video.currentTime = Number(evento.target.value);
            setMomento(Number(evento.target.value));
          }}
          className="barra-de-video min-w-0 flex-1 cursor-pointer outline-none"
          style={{
            /* Lo ya reproducido en el color de marca; lo que queda, un blanco
               rebajado —fijo, por lo mismo que la tinta—. */
            background: `linear-gradient(to right, ${colors.primary} ${progreso}%, rgba(255,255,255,0.35) ${progreso}%)`,
          }}
        />

        <span
          className="shrink-0 font-sans text-[10px] tabular-nums"
          style={{ color: TINTA_SOBRE_VIDEO }}
        >
          {reloj(momento)} / {reloj(duracion)}
        </span>

        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (video) video.muted = !video.muted;
          }}
          aria-label={silenciado ? 'Activar el sonido' : 'Silenciar'}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
          style={{ color: TINTA_SOBRE_VIDEO }}
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
            <path d="M11 5L6 9H2v6h4l5 4z" />
            {silenciado ? (
              <path d="M22 9l-6 6M16 9l6 6" />
            ) : (
              <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
            )}
          </svg>
        </button>

        <button
          type="button"
          onClick={alternarPantallaCompleta}
          aria-label={aPantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
          style={{ color: TINTA_SOBRE_VIDEO }}
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
            <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

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

/**
 * Los dos checks de un mensaje propio.
 *
 * Uno gris: llegó al servidor. Dos azules: no queda nadie por leerlo. Es el
 * lenguaje que ya trae aprendido cualquiera de otra app de mensajería, y por
 * eso no lleva texto — el `title` lo dice para quien pase por encima y para un
 * lector de pantalla.
 */
function ChecksDeEnvio({
  vistoPorTodos,
  cuantosLoVieron,
}: {
  vistoPorTodos: boolean;
  cuantosLoVieron: number;
}) {
  const titulo = vistoPorTodos
    ? 'Visto por todos'
    : cuantosLoVieron > 0
      ? `Visto por ${cuantosLoVieron}`
      : 'Enviado';

  return (
    <span
      title={titulo}
      aria-label={titulo}
      className="inline-flex items-center"
      style={{ color: vistoPorTodos ? colors.info : colors.textDisabled }}
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 13l4 4L15 7" />
        {/* El segundo palito solo cuando lo han visto todos: dos checks grises
            y dos azules se distinguen mal de un vistazo, un check y dos no. */}
        {vistoPorTodos && <path d="M8 13l4 4L23 6" />}
      </svg>
    </span>
  );
}
