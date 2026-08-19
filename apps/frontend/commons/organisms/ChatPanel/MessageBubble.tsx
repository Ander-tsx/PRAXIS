'use client';

import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatRefKind } from '../../api/chat-refs';
import { splitMessage } from '../../api/chat-refs';
import {
  CHAT_REACTIONS,
  type ChatAttachment,
  type ChatMessage,
  type UserProfile,
  formatBytes,
  personLabel,
} from '../../api/domain';
import type { LinkPreview } from '../../api/link-preview';
import { avatarHref } from '../../api/presence';
import { Avatar } from '../../atoms/Avatar';
import { usePresence } from '../../realtime';
import { alpha, colors } from '../../tokens';
import { AttachmentPreview } from './AttachmentPreview';
import { Composer, type Sugerencia } from './Composer';
import { RichText } from './RichText';
import { fieldFromBody } from './tagging';

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
   * El hilo de este mensaje tiene respuestas sin mirar.
   *
   * Pinta un punto a la derecha de «N respuestas al hilo». Lo decide
   * `useHilosNoLeidos`, que es quien explica por qué esto se recuerda en el
   * navegador y no lo contesta el servidor.
   */
  hiloConNovedad?: boolean;
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
 * ## Dos asas al pasar por encima, y nada más
 *
 * En escritorio la burbuja enseña **dos** controles al pasar el ratón, cada uno
 * con un único trabajo:
 *
 * - un **botón redondo de reacción**, fuera de la burbuja y del lado que da al
 *   centro de la conversación —a la derecha en un mensaje de entrada, a la
 *   izquierda en uno de salida— porque ese lado es el que siempre tiene sitio
 *   libre. Abre el selector de cinco emojis y no hace nada más;
 * - una **flecha de desplegable**, en la esquina de arriba del lado contrario y
 *   **dentro** de la burbuja, sobre un degradado del propio color del fondo que
 *   la despega del texto sin taparlo. Abre el menú vertical con el resto de
 *   acciones.
 *
 * Es el reparto de WhatsApp, y funciona por lo mismo: lo que se hace a todas
 * horas —reaccionar— está a un clic, y lo que se hace de vez en cuando está a
 * dos, sin que ninguno de los dos ocupe sitio permanente en la conversación.
 *
 * ⚠️ **Hubo una barra única con todo dentro, y el problema no era el `:hover`
 * sino el tamaño.** Seis emojis más cinco botones en una sola tira son once
 * blancos de 16 px que aparecían de golpe encima del mensaje, así que hubo que
 * esconderla detrás de un clic sobre la burbuja —un gesto que nadie adivina, y
 * que además convertía el mensaje entero en un control—. Repartida en dos asas
 * pequeñas vuelve a caber en el `:hover` sin saltar a la vista: lo que se
 * revela son dos círculos de 28 px, no una regleta.
 *
 * El teclado llega igual: los dos botones entran en el orden de tabulación y se
 * revelan con `focus-visible`, y Esc cierra lo que esté abierto.
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
  hiloConNovedad = false,
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
  const presencia = usePresence(message.authorId, author?.presence);

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

  /** El selector de cinco emojis, colgado del botón redondo. */
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  /** El menú vertical de acciones, colgado de la flecha. */
  const [menuAbierto, setMenuAbierto] = useState(false);

  /**
   * Hacia dónde crece cada superficie.
   *
   * Las dos se abren en su dirección natural —el selector hacia arriba, el menú
   * hacia abajo— y se voltean cuando por ahí se saldrían del contenedor con
   * scroll. Sin esto, el selector del primer mensaje de la conversación se
   * recortaba contra el borde de arriba y el menú del último quedaba mitad
   * fuera por abajo: se veía la primera fila y nada más.
   */
  const [selectorAbajo, setSelectorAbajo] = useState(false);
  const [menuArriba, setMenuArriba] = useState(false);

  /** Lo que ocupan, con holgura, para poder decidir el volteo antes de abrir. */
  const ALTO_SELECTOR = 56;
  const ALTO_MENU = 300;

  function huecos() {
    const burbuja = burbujaRef.current;
    const scroller = scrollerRef.current;
    if (!burbuja || !scroller) return null;
    return {
      burbuja: burbuja.getBoundingClientRect(),
      scroller: scroller.getBoundingClientRect(),
    };
  }

  function abrirSelector() {
    const medida = huecos();
    if (medida) {
      /* El selector sale del centro de la burbuja hacia arriba. */
      const centro = (medida.burbuja.top + medida.burbuja.bottom) / 2;
      setSelectorAbajo(centro - ALTO_SELECTOR < medida.scroller.top);
    }
    setMenuAbierto(false);
    setSelectorAbierto(true);
  }

  function abrirMenu() {
    const medida = huecos();
    if (medida) {
      /* El menú cuelga del borde de arriba de la burbuja hacia abajo. Solo se
         voltea si arriba cabe de verdad: en una burbuja muy alta pegada al
         fondo no cabe por ninguno de los dos lados, y ahí es mejor abajo —se ve
         la primera acción, que es la más usada— que arriba —donde se vería la
         última, que es «Eliminar»—. */
      const cabeAbajo = medida.burbuja.top + ALTO_MENU <= medida.scroller.bottom;
      const cabeArriba = medida.burbuja.bottom - ALTO_MENU >= medida.scroller.top;
      setMenuArriba(!cabeAbajo && cabeArriba);
    }
    setSelectorAbierto(false);
    setMenuAbierto(true);
  }

  function cerrarSuperficies() {
    setSelectorAbierto(false);
    setMenuAbierto(false);
    setConfirmandoBorrado(false);
    setListaDeVistos(false);
  }

  /**
   * «Visto por» y la confirmación de borrado son **modos del menú**, no
   * superficies aparte: en cuanto el menú se recoge dejan de tener dónde vivir.
   *
   * Va en un efecto y no en cada manejador porque hay varios caminos que
   * cierran el menú, y basta olvidarse de uno para que al volver a abrirlo
   * salga la lista —o la pregunta en rojo— en vez de las acciones.
   */
  useEffect(() => {
    if (!menuAbierto) {
      setListaDeVistos(false);
      setConfirmandoBorrado(false);
    }
  }, [menuAbierto]);

  /**
   * Cerrar al pulsar fuera y con Esc.
   *
   * El clic se escucha en la fase de **captura** y no en la de burbujeo: en
   * burbujeo, el mismo clic que abre una superficie llegaría después al
   * documento y la cerraría en el acto. Se ignora lo que caiga dentro de la
   * propia burbuja, que es de donde cuelgan las dos.
   */
  useEffect(() => {
    if (!selectorAbierto && !menuAbierto) return;
    /* Los cuatro `set` en vez de `cerrarSuperficies`: esa función se rehace en
       cada render, así que como dependencia volvería a suscribir y desuscribir
       los dos escuchadores del documento a cada pulsación de tecla del chat.
       Los `set` de `useState` sí son estables, y por eso la lista va vacía de
       todo salvo los dos interruptores que deciden si hay algo que cerrar. */
    function cerrar() {
      setSelectorAbierto(false);
      setMenuAbierto(false);
      setConfirmandoBorrado(false);
      setListaDeVistos(false);
    }
    function alPulsarFuera(evento: MouseEvent) {
      if (burbujaRef.current?.contains(evento.target as Node)) return;
      cerrar();
    }
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') cerrar();
    }
    document.addEventListener('click', alPulsarFuera, true);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('click', alPulsarFuera, true);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [selectorAbierto, menuAbierto]);

  /**
   * Copiar el texto del mensaje al portapapeles.
   *
   * ⚠️ **Lo que se copia es lo que se lee, no lo que se guarda.** El cuerpo
   * viaja con los ids dentro —`@[María](user:2222-…)`— y pegar eso en otro
   * sitio sería pegar un UUID. `fieldFromBody` deshace el disfraz igual que
   * al editar, así que se copia `@María`.
   *
   * El acuse es la propia fila, que dice «Copiado» y cierra sola: sin él no hay
   * forma de saber si el clic hizo algo, porque el portapapeles no se ve.
   */
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      const cuerpo = message?.body ?? '';
      const extraido = fieldFromBody(cuerpo);
      const textoParaCopiar = extraido ? extraido.texto : '';
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textoParaCopiar);
      }
      setCopiado(true);
      setTimeout(() => {
        setCopiado(false);
        setMenuAbierto(false);
      }, 900);
    } catch {
      /* Sin permiso de portapapeles no hay nada que hacer ni nada que avisar:
         el navegador ya lo ha dicho a su manera. Se cierra el menú y se deja
         el texto seleccionable, que es el camino de siempre. */
      setMenuAbierto(false);
    }
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

  /**
   * El fondo de la burbuja, **opaco**.
   *
   * ⚠️ **El del mensaje propio estaba en `alpha(primary, 16)` y eso ya no vale.**
   * La flecha del desplegable se apoya en un degradado del color de la burbuja
   * para despegarse del texto, y un degradado del mismo color translúcido se
   * suma al fondo que ya hay debajo: quedaba un manchón más oscuro en la
   * esquina en vez de una transición limpia. `color-mix` contra el fondo de la
   * página da exactamente el mismo tinte que se veía antes, pero como un color
   * sólido del que la esquina puede tirar.
   */
  const fondo = mine
    ? `color-mix(in srgb, ${colors.primary} 16%, ${colors.background})`
    : colors.surfaceElevated;

  /**
   * Si la flecha del desplegable tiene algo que desplegar.
   *
   * Dentro del panel del hilo se apagan responder, hilo y fijar de golpe, y en
   * el mensaje de otra persona no hay ni editar ni eliminar: sin esto quedaba
   * una flecha que abría un menú vacío.
   */
  const hayAcciones =
    permiteResponder || permiteAbrirHilo || canFijar || canDelete || mine || !sinTexto;

  /** Las reacciones agrupadas por emoji, con cuántos y si estás dentro. */
  const agrupadas = new Map<string, { total: number; mia: boolean }>();
  for (const reaccion of message.reactions) {
    const actual = agrupadas.get(reaccion.emoji) ?? { total: 0, mia: false };
    actual.total += 1;
    if (reaccion.userId === currentUserId) actual.mia = true;
    agrupadas.set(reaccion.emoji, actual);
  }

  const miReaccionActual = Array.from(agrupadas.entries()).find(([, meta]) => meta.mia)?.[0];

  const manejarReaccion = (emoji: string, puesta: boolean) => {
    if (puesta) {
      onReaccionar(message.id, emoji, false);
      return;
    }
    if (miReaccionActual && miReaccionActual !== emoji) {
      onReaccionar(message.id, miReaccionActual, false);
    }
    onReaccionar(message.id, emoji, true);
  };

  /**
   * El preview se pide de la primera URL del mensaje, una sola vez por burbuja.
   * `previewDeLink` es un server action de la zona: solo se dispara cuando el
   * panel la trae, y el `undefined` inicial distingue "todavía no preguntado"
   * de "preguntado y sin metadatos" (`null`), para no volver a pedir.
   */
  const primeraUrl = previewDeLink
    ? splitMessage(message.body).find((trozo) => trozo.tipo === 'url')?.url
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
            className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
            style={{ background: alpha(colors.textSecondary, 10) }}
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
          src={avatarHref(author?.avatarUrl, gatewayPath)}
          /* El punto de estado también en el chat: saber que alguien está en
             una reunión explica por qué no contesta, y ese es justo el momento
             en que se mira. Va por `usePresence` para que cambie solo sin
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

        <div
          ref={burbujaRef}
          /* `group/burbuja`: pasar el ratón por cualquier parte del mensaje es
             lo que revela las dos asas. Con nombre porque dentro hay otro grupo
             —el del reproductor de vídeo— y `group-hover` a secas se los
             confundiría. */
          className={`group/burbuja relative min-w-0 max-w-full rounded-2xl ${
            /* ⚠️ **Solo un medio: relleno igual por los cuatro lados.** El de
               un mensaje de texto (`px-3.5 py-2`) es más ancho que alto a
               propósito —así se lee mejor una línea— pero alrededor de una foto
               ese desajuste se ve: dos milímetros arriba y cuatro a los lados,
               como un marco mal cortado. */
            soloMedia ? 'p-2' : 'px-3.5 py-2'
          }`}
          /* Los tres gestos táctiles: `onGestoFin` cubre tanto soltar el dedo
             como que el sistema cancele el gesto a medias (una llamada
             entrante, por ejemplo) — sin `onPointerCancel`, la burbuja se
             quedaría desplazada para siempre. */
          onPointerDown={onGestoInicio}
          onPointerMove={onGestoMueve}
          onPointerUp={onGestoFin}
          onPointerCancel={onGestoFin}
          style={{
            background: fondo,
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
            /* El realce de un mensaje fijado se pinta con un div absoluto
               adentro para que quede por encima del botón de acciones y no
               se vea mordido por su fondo radial. */
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
                <AttachmentPreview mensaje={message.replyTo} />
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
           * Las reacciones, **dentro** de la burbuja.
           *
           * ⚠️ **Estuvieron debajo, sueltas, y ese es el problema que
           * resuelven aquí.** Una fila de píldoras flotando bajo el mensaje se
           * lee como una línea más de la conversación —no como parte de nada—
           * y empujaba hacia abajo al mensaje siguiente, así que reaccionar
           * movía de sitio todo lo que había debajo. Metidas en la burbuja son
           * lo que son: una marca del mensaje, del mismo color y con el mismo
           * borde, como en Telegram.
           *
           * `justify-end` en los tuyos por lo mismo que el resto del contenido:
           * la burbuja se lee de derecha a izquierda cuando está pegada a ese
           * lado.
           */}
          {agrupadas.size > 0 && (
            <div
              className={`mt-1.5 flex flex-wrap items-center gap-1 ${mine ? 'justify-end' : ''}`}
            >
              {[...agrupadas.entries()].map(([emoji, { total, mia }]) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={!canReact}
                  onClick={() => onReaccionar(message.id, emoji, !mia)}
                  aria-pressed={mia}
                  aria-label={`${emoji} — ${total}`}
                  /* La tuya se marca con borde y fondo: en un grupo de seis
                     personas, saber si ya reaccionaste es la mitad de la
                     información que da la píldora. */
                  className="flex cursor-pointer items-center gap-1 rounded-full border px-1.5 py-0.5 font-sans text-[11px] font-medium tabular-nums transition-colors hover:border-primary disabled:cursor-not-allowed disabled:hover:border-inherit"
                  style={{
                    borderColor: mia ? colors.primary : alpha(colors.border, 80),
                    background: mia ? alpha(colors.primary, 18) : alpha(colors.overlay, 12),
                    color: mia ? colors.primary : colors.textSecondary,
                  }}
                >
                  <span className="text-[13px] leading-none">{emoji}</span>
                  {total}
                </button>
              ))}
            </div>
          )}

          {/**
           * La marca de hilo: el pie de la burbuja.
           *
           * ## Por qué un pie y no una píldora
           *
           * Era una píldora gris con un icono que parecía un documento, del
           * mismo tamaño que una insignia cualquiera: se confundía con una
           * etiqueta —algo que **describe** el mensaje— cuando en realidad es
           * la **puerta** a una conversación entera que cuelga de él. Ahora
           * ocupa el ancho de la burbuja, se separa con una línea, se tiñe del
           * color de marca y acaba en un chevrón: las tres señales de «esto se
           * abre».
           *
           * El sangrado negativo (`-mx-3.5 -mb-2`) es lo que le deja llegar a
           * los bordes por dentro del relleno de la burbuja; el redondeo de
           * abajo tiene que coincidir con el de ella o asoma una esquina
           * cuadrada. Solo aparece en burbujas de texto: `soloMedia` es
           * incompatible con tener respuestas, así que el relleno de aquí es
           * siempre `px-3.5 py-2`.
           */}

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

          {/**
           * Las dos asas de escritorio.
           *
           * Van **dentro** de la burbuja aunque una de ellas se pinte fuera:
           * ser descendiente es lo que mantiene vivo el `:hover` del grupo
           * mientras el ratón viaja del texto al botón. Puestas como hermanas,
           * cruzar el borde apagaba el hover y el botón desaparecía justo
           * cuando ibas a pulsarlo.
           *
           * `max-md:hidden` porque el táctil tiene los suyos —deslizar
           * responde, mantener pulsado abre la hoja— y no tiene `:hover` que
           * valga.
           */}
          {canReact && !editandose && (
            <div
              /* `left-full` / `right-full` lo pega al canto de la burbuja y el
                 relleno hace de puente: con un hueco transparente en medio, el
                 ratón pasaba por tierra de nadie y el botón parpadeaba. */
              className={`absolute top-1/2 z-30 -translate-y-1/2 max-md:hidden ${
                mine ? 'right-full pr-1.5' : 'left-full pl-1.5'
              }`}
            >
              <button
                type="button"
                onClick={() => (selectorAbierto ? setSelectorAbierto(false) : abrirSelector())}
                aria-label="Reaccionar a este mensaje"
                aria-expanded={selectorAbierto}
                title="Reaccionar"
                /* Invisible **y sin eventos** mientras no se pasa por encima:
                   un botón transparente pero clicable es un agujero de 28 px
                   junto a cada mensaje que se traga los clics de al lado. */
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border transition duration-100 hover:scale-110 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/burbuja:pointer-events-auto group-hover/burbuja:opacity-100 ${
                  selectorAbierto
                    ? 'pointer-events-auto opacity-100'
                    : 'pointer-events-none opacity-0'
                }`}
                style={{
                  background: colors.surfaceElevated,
                  borderColor: colors.borderStrong,
                  color: selectorAbierto ? colors.primary : colors.textSecondary,
                  boxShadow: `0 4px 12px ${alpha(colors.overlay, 35)}`,
                }}
              >
                <IconoCarita className="h-4 w-4" />
              </button>

              {/**
               * El selector: cinco emojis en una tira redonda.
               *
               * Crece **hacia el centro** de la conversación —a la izquierda en
               * un mensaje de entrada, a la derecha en uno de salida— porque el
               * botón ya está en el canto y hacia fuera se saldría de la
               * pantalla en cuanto la ventana se estrecha. Ancla vertical
               * arriba salvo en el primer mensaje del scroll, donde se voltea.
               */}
              {selectorAbierto && (
                <div
                  className={`absolute z-50 flex items-center gap-0.5 rounded-full border p-1 ${
                    selectorAbajo ? 'top-full mt-2' : 'bottom-full mb-2'
                  } ${mine ? 'right-0' : 'left-0'}`}
                  style={{
                    background: colors.surfaceElevated,
                    borderColor: colors.borderStrong,
                    boxShadow: `0 10px 30px ${alpha(colors.overlay, 50)}`,
                  }}
                >
                  {CHAT_REACTIONS.map((emoji) => {
                    const puesta = agrupadas.get(emoji)?.mia ?? false;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          manejarReaccion(emoji, puesta);
                          setSelectorAbierto(false);
                        }}
                        aria-label={puesta ? `Quitar ${emoji}` : `Reaccionar con ${emoji}`}
                        aria-pressed={puesta}
                        /* `active:scale-90` además del `hover`: el emoji se hunde
                           al pulsarlo y vuelve, que es el acuse de recibo que
                           hace que un clic se sienta atendido aunque la red
                           tarde. */
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[19px] leading-none transition-transform duration-100 hover:scale-125 active:scale-90"
                        style={puesta ? { background: alpha(colors.primary, 22) } : undefined}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {hayAcciones && !editandose && (
            <div className={`absolute top-0 max-md:hidden ${mine ? 'right-0' : 'left-0'}`}>
              <button
                type="button"
                onClick={() => (menuAbierto ? setMenuAbierto(false) : abrirMenu())}
                aria-label="Acciones del mensaje"
                aria-expanded={menuAbierto}
                aria-haspopup="menu"
                title="Acciones"
                className={`relative z-30 flex h-7 w-10 cursor-pointer items-start justify-center pt-1.5 transition-opacity duration-100 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/burbuja:pointer-events-auto group-hover/burbuja:opacity-100 ${
                  menuAbierto ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
                /**
                 * El degradado que la despega del texto.
                 *
                 * Sale del propio color de la burbuja y se desvanece hacia
                 * dentro, así que **no tapa** lo que hay debajo: lo funde. Una
                 * pastilla opaca habría recortado un rectángulo del mensaje, y
                 * un icono a pelo sobre una línea de texto no se lee. Por eso
                 * el fondo de la burbuja tuvo que volverse sólido — con un
                 * color translúcido, este degradado se suma al que ya hay
                 * debajo y sale un manchón.
                 *
                 * El redondeo copia el de la esquina que ocupa, incluida la
                 * esquina recortada del primer mensaje de cada bloque: sin eso
                 * el degradado asoma por fuera de la burbuja.
                 */
                style={{
                  color: menuAbierto ? colors.textPrimary : colors.textSecondary,
                  background: `radial-gradient(farthest-corner at ${
                    mine ? '100% 0%' : '0% 0%'
                  }, ${fondo} 0%, ${fondo} 58%, transparent 100%)`,
                  borderTopRightRadius: mine && !continued ? '0.35rem' : '1rem',
                  borderTopLeftRadius: !mine && !continued ? '0.35rem' : '1rem',
                }}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {menuAbierto && (
                <div
                  role="menu"
                  className={`absolute z-50 flex w-52 flex-col overflow-hidden rounded-xl border py-1 ${
                    menuArriba ? 'bottom-full mb-1' : 'top-full mt-1'
                  } ${mine ? 'right-0' : 'left-0'}`}
                  style={{
                    background: colors.surfaceElevated,
                    borderColor: colors.borderStrong,
                    boxShadow: `0 14px 40px ${alpha(colors.overlay, 55)}`,
                  }}
                >
                  {listaDeVistos ? (
                    /**
                     * «Quién lo ha visto» **convierte el menú en la lista**, el
                     * mismo trato que la pregunta de borrado de más abajo.
                     *
                     * ⚠️ Estuvo como un panel aparte, bajo el mensaje, con su
                     * propio estado: se quedaba abierto después de cerrar las
                     * acciones y había que volver a pulsar el ojo para
                     * quitarlo. Viviendo dentro se va con el menú.
                     */
                    <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto px-3 py-1.5">
                      <span className="font-sans text-[10px] uppercase tracking-wide text-text-disabled">
                        Visto por
                      </span>
                      {vistoPor.map((userId) => (
                        <span key={userId} className="truncate font-sans text-xs text-text-primary">
                          {nombreDeAutor(userId)}
                        </span>
                      ))}
                    </div>
                  ) : confirmandoBorrado ? (
                    /**
                     * Borrar pide confirmación **en el propio menú**.
                     *
                     * Borrar un mensaje **no se deshace** —no hay papelera ni
                     * historial de ediciones—, así que es la única acción del
                     * chat cuyo error no tiene arreglo. Se resuelve pidiendo un
                     * segundo clic sobre un botón que cambia de sitio, de
                     * tamaño y de color: quien iba a por la fila de al lado no
                     * encuentra ahí lo que esperaba y para.
                     */
                    <div className="flex flex-col gap-2 px-3 py-2">
                      <span className="font-sans text-xs text-text-secondary">
                        ¿Eliminar este mensaje? No se puede deshacer.
                      </span>
                      <span className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmandoBorrado(false)}
                          className="cursor-pointer rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:text-text-primary"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            cerrarSuperficies();
                            onBorrar(message.id);
                          }}
                          className="cursor-pointer rounded-lg px-2.5 py-1 font-sans text-xs font-semibold transition-opacity hover:opacity-85"
                          style={{ background: colors.error, color: colors.textInverse }}
                        >
                          Eliminar
                        </button>
                      </span>
                    </div>
                  ) : (
                    <>
                      {permiteResponder && (
                        <FilaDeMenu
                          etiqueta="Responder"
                          icono={<IconoResponder />}
                          onClick={() => {
                            onResponder(message);
                            setMenuAbierto(false);
                          }}
                        />
                      )}

                      {!sinTexto && (
                        <FilaDeMenu
                          etiqueta={copiado ? 'Copiado' : 'Copiar texto'}
                          icono={copiado ? <IconoCheck /> : <IconoCopiar />}
                          activa={copiado}
                          onClick={() => void copiar()}
                        />
                      )}

                      {permiteAbrirHilo && (
                        <FilaDeMenu
                          etiqueta={message._count.replies > 0 ? 'Ver el hilo' : 'Abrir un hilo'}
                          icono={<IconoHilo />}
                          onClick={() => {
                            onAbrirHilo(message);
                            setMenuAbierto(false);
                          }}
                        />
                      )}

                      {canFijar && (
                        <FilaDeMenu
                          etiqueta={fijado ? 'Desfijar' : 'Fijar'}
                          icono={<IconoFijar relleno={fijado} />}
                          activa={fijado}
                          onClick={() => {
                            onFijar(message.id, !fijado);
                            setMenuAbierto(false);
                          }}
                        />
                      )}

                      {mine && (
                        <FilaDeMenu
                          etiqueta="Editar"
                          icono={<IconoEditar />}
                          onClick={() => {
                            onPedirEdicion(message);
                            setMenuAbierto(false);
                          }}
                        />
                      )}

                      {/* Solo en los tuyos: en el mensaje de otra persona, saber
                          quién más lo ha visto no es asunto de quien lo lee. Y
                          solo si alguien lo ha visto — una fila que abre una
                          lista vacía es una fila que no había que ofrecer. */}
                      {mine && isProjectChat && vistoPor.length > 0 && (
                        <FilaDeMenu
                          etiqueta={`Visto por ${vistoPor.length}`}
                          icono={<IconoOjo />}
                          onClick={() => setListaDeVistos(true)}
                        />
                      )}

                      {canDelete && (
                        <>
                          <span
                            aria-hidden="true"
                            className="my-1 h-px"
                            style={{ background: colors.border }}
                          />
                          <FilaDeMenu
                            etiqueta="Eliminar"
                            icono={<IconoPapelera />}
                            destructiva
                            onClick={() => setConfirmandoBorrado(true)}
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {fijado && (
            <div
              className="pointer-events-none absolute inset-0 z-40 rounded-[inherit]"
              style={{
                outline: `1.5px solid ${alpha(colors.primary, 55)}`,
                outlineOffset: '-1.5px',
              }}
            />
          )}
        </div>

        {mostrarMarcaDeHilo && message._count.replies > 0 && (
          <div
            className={`flex items-center gap-2 mt-1 ${mine ? 'flex-row-reverse mr-2' : 'ml-2'}`}
          >
            <div
              className={`w-4 h-5 border-b-2 ${
                mine ? 'border-r-2 rounded-br-xl -mr-1' : 'border-l-2 rounded-bl-xl -ml-1'
              } -mt-4`}
              style={{ borderColor: alpha(colors.textSecondary, 35) }}
            />
            <button
              type="button"
              onClick={() => onAbrirHilo(message)}
              className="cursor-pointer font-sans text-[13px] font-semibold transition-opacity hover:opacity-80"
              style={{ color: hiloConNovedad ? colors.primary : colors.textSecondary }}
              title="Ver las respuestas"
            >
              {message._count.replies}{' '}
              {message._count.replies === 1 ? 'respuesta al hilo' : 'respuestas al hilo'}
            </button>

            {/**
             * El punto de «aquí dentro hay algo sin leer».
             *
             * Va **a la derecha del texto** y dentro del mismo `flex`, así que
             * en un mensaje propio —que invierte la fila con
             * `flex-row-reverse`— acaba a la izquierda, o sea igual de pegado
             * a la marca. Es lo que se quiere: acompaña al texto, no al borde.
             *
             * ⚠️ **No lleva número.** El dato de que dispone el cliente es
             * «cuántas respuestas hay ahora» menos «cuántas había la última vez
             * que miré», y esa resta no es «cuántas sin leer» en cuanto alguien
             * borre una. Un punto dice lo que sí se sabe; un número diría de
             * más y a veces mentiría.
             *
             * `aria-hidden` y el texto para lector de pantalla aparte: un punto
             * de color no lo anuncia nadie, y quien no lo ve necesita que se lo
             * digan con palabras.
             */}
            {hiloConNovedad && (
              <>
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: colors.primary }}
                />
                <span className="sr-only">Hay respuestas nuevas en este hilo</span>
              </>
            )}
          </div>
        )}
      </div>

      {/**
       * La hoja de acciones táctil: lo que la pulsación larga abre.
       *
       * Reúne lo mismo que el menú de escritorio —reaccionar, copiar, fijar,
       * editar, responder, abrir el hilo, borrar— en una lista que se pulsa con
       * el pulgar, en vez de iconos de 16 px pensados para un cursor preciso.
       * Comparte con él los mismos componentes de icono: un juego distinto por
       * dispositivo sería el mismo menú diciendo dos cosas.
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
                            manejarReaccion(emoji, puesta);
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
                    icono={<IconoResponder className="h-5 w-5 shrink-0" />}
                    onClick={() => {
                      onResponder(message);
                      cerrarHoja();
                    }}
                  />
                )}

                {!sinTexto && (
                  <HojaBoton
                    etiqueta={copiado ? 'Copiado' : 'Copiar texto'}
                    activa={copiado}
                    icono={
                      copiado ? (
                        <IconoCheck className="h-5 w-5 shrink-0" />
                      ) : (
                        <IconoCopiar className="h-5 w-5 shrink-0" />
                      )
                    }
                    onClick={() => void copiar()}
                  />
                )}

                {permiteAbrirHilo && (
                  <HojaBoton
                    etiqueta={message._count.replies > 0 ? 'Ver el hilo' : 'Abrir un hilo'}
                    icono={<IconoHilo className="h-5 w-5 shrink-0" />}
                    onClick={() => {
                      onAbrirHilo(message);
                      cerrarHoja();
                    }}
                  />
                )}

                {canFijar && (
                  <HojaBoton
                    etiqueta={fijado ? 'Desfijar' : 'Fijar'}
                    activa={fijado}
                    icono={<IconoFijar relleno={fijado} className="h-5 w-5 shrink-0" />}
                    onClick={() => {
                      onFijar(message.id, !fijado);
                      cerrarHoja();
                    }}
                  />
                )}

                {mine && (
                  <HojaBoton
                    etiqueta="Editar"
                    icono={<IconoEditar className="h-5 w-5 shrink-0" />}
                    onClick={() => {
                      onPedirEdicion(message);
                      cerrarHoja();
                    }}
                  />
                )}

                {canDelete && (
                  <HojaBoton
                    etiqueta="Eliminar"
                    destructiva
                    icono={<IconoPapelera className="h-5 w-5 shrink-0" />}
                    onClick={() => setConfirmandoBorrado(true)}
                  />
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
 * El icono viene ya montado desde fuera y es **el mismo componente** que usa el
 * menú de escritorio para esa acción. Antes eran los `<path>` sueltos pasados
 * por `children`, lo que obligaba a repetir el trazo en los dos sitios: al
 * cambiar un icono había que acordarse de cambiarlo dos veces, y bastaba
 * olvidarse una para que la misma acción se dibujara distinta según el aparato.
 */
function HojaBoton({
  etiqueta,
  onClick,
  icono,
  activa = false,
  destructiva = false,
}: {
  etiqueta: string;
  onClick: () => void;
  icono: ReactNode;
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
      {icono}
      {etiqueta}
    </button>
  );
}

/**
 * Una fila del menú de acciones de escritorio: icono, etiqueta, todo el ancho.
 *
 * `role="menuitem"` y no un `<li>`: el contenedor es un `role="menu"` y esto es
 * lo que espera encontrar dentro un lector de pantalla.
 */
function FilaDeMenu({
  etiqueta,
  icono,
  onClick,
  activa = false,
  destructiva = false,
}: {
  etiqueta: string;
  icono: ReactNode;
  onClick: () => void;
  activa?: boolean;
  destructiva?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left font-sans text-[13px] transition-colors ${
        destructiva ? 'hover:bg-error/10' : 'hover:bg-overlay/10'
      }`}
      style={{ color: destructiva ? colors.error : activa ? colors.primary : colors.textPrimary }}
    >
      <span className="shrink-0 opacity-80">{icono}</span>
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
    </button>
  );
}

/**
 * Los iconos de las acciones del mensaje.
 *
 * ## Por qué están aquí y no sueltos en cada botón
 *
 * Los mismos siete se pintan en tres sitios —el menú de escritorio, la hoja
 * táctil y el pie de hilo de la burbuja—. Cuando cada sitio llevaba su propio
 * `<svg>` con los `<path>` copiados, «hilo» era un rectángulo con cuatro rayas
 * que se leía como un documento y la papelera era un trazo hecho a mano con la
 * tapa pegada al cubo: dos dibujos que no significaban lo que decían, y en tres
 * copias cada uno.
 *
 * Todos comparten caja (`0 0 24 24`), grosor (1.75) y remates redondos, que es
 * lo que hace que una lista de iconos distintos parezca **un juego** y no siete
 * dibujos apilados.
 */
const TRAZO = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Flecha que vuelve: responder. */
function IconoResponder({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...TRAZO} aria-hidden="true">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </svg>
  );
}

/** Dos hojas superpuestas: copiar. */
function IconoCopiar({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...TRAZO} aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M6 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" />
    </svg>
  );
}

/** El acuse de «Copiado». */
function IconoCheck({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...TRAZO} strokeWidth={2.25} aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

/**
 * Un globo del que sale otro: el hilo.
 *
 * ⚠️ **Era un rectángulo con cuatro rayas dentro** —el icono universal de
 * «documento»— y por eso el pie de un mensaje con respuestas parecía un archivo
 * adjunto. Un hilo son mensajes colgando de un mensaje, y eso es lo que dibuja:
 * un globo grande y otro pequeño saliendo de él.
 */
function IconoHilo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...TRAZO} aria-hidden="true">
      <path d="M3 5.5A2.5 2.5 0 015.5 3h8A2.5 2.5 0 0116 5.5v4a2.5 2.5 0 01-2.5 2.5H8l-3.5 3v-3H5.5A2.5 2.5 0 013 9.5z" />
      <path d="M19 9.5h.5A2.5 2.5 0 0122 12v3.5a2.5 2.5 0 01-2.5 2.5H19v3l-3.5-3h-2" />
    </svg>
  );
}

/** La chincheta: fijar. Se rellena cuando ya está puesta. */
function IconoFijar({
  relleno = false,
  className = 'h-4 w-4',
}: { relleno?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      {...TRAZO}
      fill={relleno ? 'currentColor' : 'none'}
      strokeWidth={relleno ? 2 : 1.75}
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" />
    </svg>
  );
}

/** El lápiz con su línea: editar. */
function IconoEditar({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...TRAZO} aria-hidden="true">
      <path d="M16.5 3.5a2.12 2.12 0 013 3L8 18l-4 1 1-4z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}

/** El ojo: quién lo ha visto. */
function IconoOjo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...TRAZO} aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * La papelera: eliminar.
 *
 * ⚠️ El trazo anterior (`M6 7h12M10 7V5h4v2M9 7v10…`) dibujaba la tapa **dentro**
 * del cubo y las tres rayas de dentro llegando hasta el borde: a 16 px salía un
 * garabato que costaba reconocer justo en la acción que más falta hace
 * reconocer antes de pulsarla.
 */
function IconoPapelera({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...TRAZO} aria-hidden="true">
      <path d="M3.5 6h17" />
      <path d="M9 6V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V6" />
      <path d="M18.5 6l-.8 13.1a2 2 0 01-2 1.9H8.3a2 2 0 01-2-1.9L5.5 6" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

/**
 * La carita del botón de reaccionar.
 *
 * Una cara sonriente y no un `+` ni un corazón: el `+` no dice de qué, y un
 * corazón es **una** de las cinco reacciones, así que ponerlo de portada
 * sugiere que ese es el botón de «me encanta» y no el de elegir.
 */
function IconoCarita({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...TRAZO} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 007 0" />
      <path d="M9 9.5h.01M15 9.5h.01" strokeWidth={2.5} />
    </svg>
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
