import { Fragment } from 'react';

/**
 * El texto del asistente, con sus negritas puestas.
 *
 * Gemini escribe markdown por su cuenta —sobre todo `**así**` para destacar las
 * cifras— y la burbuja lo pintaba tal cual: se leían los asteriscos en vez de
 * la negrita. Ocurre en los dos sitios donde el modelo escribe prosa, la
 * burbuja y el `porQue` de cada propuesta, y por eso vive aparte.
 *
 * ## Por qué no un motor de markdown
 *
 * Meter una librería para esto traería tablas, imágenes, enlaces y HTML en
 * bruto, y con ello la pregunta de qué se sanea — sobre un texto que **lo
 * escribe un modelo**, que es exactamente el contenido del que uno no se fía.
 * Aquí no hay nada que sanear porque no se interpreta HTML en ningún momento:
 * se parte la cadena y cada trozo se pinta como texto de React, que escapa por
 * definición. Nada de `dangerouslySetInnerHTML`.
 *
 * ## Qué reconoce, y qué no
 *
 * Solo `**negrita**`. Ni cursivas, ni listas, ni enlaces: son las que el modelo
 * usa de verdad, y cada patrón de más es otra forma de que un asterisco suelto
 * en mitad de una frase se coma media respuesta. Un `**` sin cerrar se queda
 * como está, que es lo correcto — era literal.
 */
export function ModelText({ texto }: { texto: string }) {
  /* `split` con grupo de captura devuelve alternando: fuera, dentro, fuera…
     así que los índices impares son lo que iba entre asteriscos. */
  const trozos = texto.split(/\*\*([\s\S]+?)\*\*/);

  return (
    <>
      {trozos.map((trozo, indice) =>
        indice % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: la posición ES la identidad de un trozo de texto
          <strong key={indice} className="font-semibold text-text-primary">
            {trozo}
          </strong>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: ídem
          <Fragment key={indice}>{trozo}</Fragment>
        ),
      )}
    </>
  );
}
