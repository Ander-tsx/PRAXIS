'use client';

import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { MenuDeBloques, type MenuDeBloquesRef } from './MenuDeBloques';
import { type Bloque, filtrarBloques } from './bloques';

/**
 * «/» abre el menú de bloques (E1 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * El menú se pinta con `ReactRenderer` en un nodo propio colgado del `body`,
 * posicionado a mano bajo el cursor: no hace falta una librería de
 * posicionamiento para un rectángulo que sale siempre debajo de una línea.
 */
export function crearBarra(bloques: () => Bloque[]) {
  return Extension.create({
    name: 'menuDeBloques',

    addProseMirrorPlugins() {
      return [
        Suggestion<Bloque, Bloque>({
          editor: this.editor,
          char: '/',
          allowSpaces: false,
          /* Al principio del bloque o tras un espacio: «a/b» no es un comando. */
          allowedPrefixes: [' '],
          items: ({ query }) => filtrarBloques(bloques(), query),
          command: ({ editor, range, props }) => props.ejecutar(editor, range),
          render: () => {
            let vista: ReactRenderer<MenuDeBloquesRef> | null = null;
            let contenedor: HTMLDivElement | null = null;

            function colocar(props: SuggestionProps<Bloque, Bloque>) {
              const caja = props.clientRect?.();
              if (!caja || !contenedor) return;
              const alto = contenedor.offsetHeight || 320;
              const cabeAbajo = caja.bottom + 8 + alto < window.innerHeight;
              contenedor.style.left = `${Math.min(caja.left, window.innerWidth - 300)}px`;
              contenedor.style.top = cabeAbajo
                ? `${caja.bottom + 8}px`
                : `${caja.top - alto - 8}px`;
            }

            return {
              onStart(props) {
                vista = new ReactRenderer(MenuDeBloques, {
                  editor: props.editor,
                  props: { ...props, bloques: props.items, command: props.command },
                });
                contenedor = document.createElement('div');
                contenedor.setAttribute('data-tone', 'dark');
                contenedor.style.position = 'fixed';
                contenedor.style.zIndex = '70';
                contenedor.appendChild(vista.element);
                document.body.appendChild(contenedor);
                requestAnimationFrame(() => colocar(props));
              },
              onUpdate(props) {
                vista?.updateProps({ ...props, bloques: props.items, command: props.command });
                colocar(props);
              },
              onKeyDown({ event }) {
                if (event.key === 'Escape') {
                  contenedor?.remove();
                  return true;
                }
                return vista?.ref?.onKeyDown(event) ?? false;
              },
              onExit() {
                contenedor?.remove();
                vista?.destroy();
                contenedor = null;
                vista = null;
              },
            };
          },
        }),
      ];
    },
  });
}
