'use client';

import { AssistantChat, type AssistantQuota, type Project } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export interface PraxScreenProps {
  /** El foco actual. `null` mientras no se ha elegido proyecto. */
  projectId: string | null;
  proyectos: Project[];
  /** La conversación a recuperar, si la URL trae una. */
  conversacionInicial: string | null;
  cuotaInicial: AssistantQuota | null;
  nombres: Record<string, string>;
  etiquetas: Record<string, string>;
  /** El nombre de pila, para el saludo de la pantalla vacía. Ver `AssistantChatProps`. */
  userName?: string;
}

/**
 * La conversación, con el proyecto y el hilo en la URL.
 *
 * ## ⚠️ Cambiar de proyecto navega, y eso es lo importante
 *
 * Podría cambiarse en estado de cliente y sería peor: el contexto que ve el
 * modelo —los miembros, las etiquetas, la cuota— lo resuelve el Server Component
 * **por proyecto**, así que un cambio en cliente dejaría la conversación hablando
 * de un proyecto con los nombres del otro, y las propuestas pintarían un UUID
 * donde va un nombre.
 *
 * Navegando, el servidor lo recalcula entero. Y **el hilo no se pierde**: vive en
 * la base, así que basta con llevarse el `conversationId` en la URL para que la
 * conversación siga donde estaba. Es lo que hace que cambiar de foco a mitad no
 * cueste nada.
 *
 * ## Y por eso ya no hay `key={projectId}`
 *
 * Lo llevaba, para remontar el chat al cambiar de proyecto y no arrastrar un hilo
 * que hablaba de otro. Con el foco cambiable eso es justo lo contrario de lo que
 * se quiere: la conversación **es la misma**, lo que cambia es de qué va a partir
 * de ahora. Quien impide arrastrar contexto equivocado ahora es el servidor, que
 * guarda el proyecto de cada turno.
 *
 * ## Y por eso también desaparece el selector
 *
 * Era un desplegable encima del chat para elegir proyecto **antes** de poder
 * hablar. Ahora el proyecto se elige dentro de la conversación —PRAX lo pregunta
 * con botones— y se cambia desde ahí, así que un control aparte para lo mismo
 * sobraba y además ocupaba la fila más visible de la pantalla.
 *
 * ## Sin `alAceptarGrafico`, a propósito
 *
 * Aquí no hay lienzo, así que una propuesta de gráfico no se puede aplicar sobre
 * nada que se esté viendo. `AssistantChat` lo detecta —la prop no llega— y la
 * tarjeta enseña qué gráfico es y remite a Análisis, en vez de ofrecer un
 * «Aceptar» que escribiría en una pantalla invisible. Ver `AccionDelLienzo`.
 */
export function PraxScreen({
  projectId,
  proyectos,
  conversacionInicial,
  cuotaInicial,
  nombres,
  etiquetas,
  userName,
}: PraxScreenProps) {
  const router = useRouter();

  const elegirProyecto = useCallback(
    (siguiente: string, conversationId: string | null, slug?: string) => {
      /* Cadena vacía = «vuelve a preguntarme por cuál». Es lo que hace la
         insignia del proyecto de la cabecera: deja la pantalla como al entrar,
         con los proyectos como botones. Va sin `c`, así que empieza conversación
         nueva a propósito — arrastrar un hilo de un proyecto a otro mezclaría dos
         contextos en la ventana del modelo. */
      if (!siguiente) {
        /* ⚠️ `/assistant`, no `'/'`. Cuando esto era una zona con `basePath`,
           el router anteponía `/assistant` solo; fusionado, un `'/'` saca a la
           landing pública en vez de reiniciar la conversación. */
        router.push('/assistant');
        return;
      }

      /**
       * ⚠️ **El `slug` de fuera es para un proyecto que aún no está en la
       * lista.** `proyectos` lo sirvió el servidor al renderizar esta pantalla,
       * así que un proyecto **recién creado desde la conversación** no aparece
       * en él y esto se quedaba en un `return` silencioso: el botón de «seguir
       * aquí con este proyecto» no hacía nada.
       *
       * Navegar sí lo arregla del todo, porque la página vuelve a pedir la
       * lista en el servidor y esta vez el proyecto ya existe.
       */
      const proyecto = proyectos.find((candidato) => candidato.id === siguiente);
      const destino = proyecto?.slug ?? slug;
      if (!destino) return;

      const params = new URLSearchParams({ p: destino });
      /* El hilo se lleva en la URL para que sobreviva a la navegación. Sin esto,
         cambiar de proyecto empezaría conversación nueva y se perdería lo
         hablado — que es exactamente lo que el foco cambiable viene a evitar. */
      if (conversationId) params.set('c', conversationId);

      /* Sin el basePath: Next añade `/assistant`. `push` y no `replace` para que
         el botón atrás devuelva al proyecto anterior. Ver §16. */
      router.push(`/?${params.toString()}`);
    },
    [proyectos, router],
  );

  return (
    /* `min-h-0` en toda la cadena hasta el hilo: es lo que hace que el scroll se
       lo quede la conversación y no la página. Sin él, un flex hijo no encoge por
       debajo de su contenido y el compositor se va al fondo del documento. */
    <div className="flex min-h-0 flex-1 flex-col">
      <AssistantChat
        projectId={projectId}
        /* El proxy de esta zona: por ahí suben y bajan los adjuntos, que no
           pueden ir por una Server Action. Ver `AssistantChatProps`. */
        gatewayPath="/api/gateway"
        proyectos={proyectos.map((proyecto) => ({ id: proyecto.id, name: proyecto.name }))}
        onElegirProyecto={elegirProyecto}
        conversacionInicial={conversacionInicial}
        cuotaInicial={cuotaInicial}
        nombres={nombres}
        etiquetas={etiquetas}
        userName={userName}
        /* Aquí la conversación **es** la pantalla: sin tarjeta, ocupando el alto
           disponible y con el compositor abajo del todo. En Análisis el mismo
           organismo va en modo `cajon`. */
        variante="pantalla"
      />
    </div>
  );
}
