'use client';

import { useEffect, useId, useRef } from 'react';

/**
 * El botón oficial de «Entrar con Google».
 *
 * Lo dibuja Google, no nosotros: su script recibe un contenedor vacío y monta
 * dentro un iframe con el botón. Por eso aquí no hay ni estilos ni texto — y
 * por eso tampoco se puede maquillar para que combine con el resto. Es una
 * condición de las normas de marca de Google, y saltárselas es motivo de
 * rechazo al verificar la aplicación.
 *
 * ⚠️ Este componente **no hace fetch**. Recibe el token y lo entrega hacia
 * arriba con `onCredencial`; quien llama al BFF es la page, como el resto de la
 * lógica de negocio de esta zona.
 */

interface BotonGoogleProps {
  /**
   * ID de cliente de OAuth. Es **público por diseño**: viaja en el JavaScript
   * que descarga el navegador y Google cuenta con ello. Lo que protege la
   * cuenta es que el token solo vale para el origen autorizado, no que este
   * identificador sea secreto.
   */
  clientId: string;
  /** Recibe el ID token ya emitido por Google. */
  onCredencial: (idToken: string) => void;
  /** Mientras la page procesa la entrada, el botón se apaga. */
  deshabilitado?: boolean;
}

/** Lo que el script de Google deja colgando de `window`. */
interface GoogleAccounts {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (respuesta: { credential?: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      renderButton: (
        contenedor: HTMLElement,
        opciones: {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'small' | 'medium' | 'large';
          text?: 'signin_with' | 'signup_with' | 'continue_with';
          shape?: 'rectangular' | 'pill';
          width?: number;
          locale?: string;
        },
      ) => void;
    };
  };
}

const URL_SCRIPT = 'https://accounts.google.com/gsi/client';

export function BotonGoogle({ clientId, onCredencial, deshabilitado = false }: BotonGoogleProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const idContenedor = useId();

  /**
   * `onCredencial` en una ref y no en las dependencias del efecto: la page la
   * redefine en cada render (es una función nueva cada vez), y si el efecto
   * dependiera de ella, Google volvería a montar el botón en cada pulsación de
   * tecla del formulario.
   */
  const alRecibir = useRef(onCredencial);
  alRecibir.current = onCredencial;

  useEffect(() => {
    if (!clientId) return;

    let cancelado = false;

    function montar() {
      const google = (window as unknown as { google?: GoogleAccounts }).google;
      if (!google || cancelado || !contenedor.current) return;

      google.accounts.id.initialize({
        client_id: clientId,
        callback: (respuesta) => {
          if (respuesta.credential) alRecibir.current(respuesta.credential);
        },
        /* Sin selección automática: entrar en una sesión sin haberlo pedido
           desconcierta, sobre todo en un equipo compartido. */
        auto_select: false,
      });

      /**
       * El tema se lee del `data-theme` que cada zona estampa en el `<html>`.
       *
       * Sin esto el botón sale siempre en `outline` —fondo blanco y borde gris—
       * que sobre el tema oscuro del sistema aparece como un recuadro claro
       * pegado en medio del formulario. `filled_black` es la variante que
       * Google publica justo para fondos oscuros.
       */
      const oscuro = document.documentElement.dataset.theme !== 'light';

      /**
       * El ancho se mide del contenedor para que coincida con el botón de
       * enviar, que es `fullWidth`.
       *
       * ⚠️ Google lo topa en 400 px y **exige un número**, no un porcentaje: no
       * hay forma de decirle «el 100%». Por eso se mide en píxeles aquí en vez
       * de resolverlo con CSS.
       */
      const ancho = Math.min(contenedor.current.offsetWidth || 320, 400);

      google.accounts.id.renderButton(contenedor.current, {
        type: 'standard',
        theme: oscuro ? 'filled_black' : 'outline',
        /* `large` son 40 px de alto: exactamente los `h-10` del átomo Button. */
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: ancho,
        locale: 'es',
      });
    }

    /* El script puede estar ya cargado si se navega entre login y registro sin
       recargar la página. Volver a añadirlo duplicaría el botón. */
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${URL_SCRIPT}"]`);

    if (existente) {
      montar();
      return () => {
        cancelado = true;
      };
    }

    const script = document.createElement('script');
    script.src = URL_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = montar;
    document.head.appendChild(script);

    return () => {
      cancelado = true;
    };
  }, [clientId]);

  /* Sin ID de cliente no hay nada que dibujar. Se devuelve null en vez de un
     botón roto: en un entorno sin Google configurado, la entrada con contraseña
     sigue estando y no conviene ofrecer algo que va a fallar. */
  if (!clientId) return null;

  return (
    <div
      /* `w-full` para que la medición de arriba dé el ancho real del
         formulario; `overflow-hidden` con el mismo radio que el átomo Button
         (`rounded-lg`) recorta las esquinas del botón de Google, que solo
         admite las suyas. Es un ajuste de encaje, no un rediseño: el botón
         sigue siendo el que dibuja Google. */
      className="w-full overflow-hidden rounded-lg"
      style={{
        opacity: deshabilitado ? 0.5 : 1,
        pointerEvents: deshabilitado ? 'none' : 'auto',
      }}
    >
      <div ref={contenedor} id={`google-${idContenedor}`} className="w-full" />
    </div>
  );
}
