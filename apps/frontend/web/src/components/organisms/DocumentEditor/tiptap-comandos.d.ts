/**
 * Los comandos de TipTap (`toggleBold`, `insertTable`…) los declara cada
 * extensión ampliando `@tiptap/core`. Las extensiones del documento llegan por
 * `@praxis/editor-schema`, que no expone esos tipos, así que se traen aquí para
 * que el compilador los conozca. Solo tipos: no añade nada al paquete.
 */
import '@tiptap/starter-kit';
import '@tiptap/extension-list';
import '@tiptap/extension-table';
import '@tiptap/extension-highlight';
import '@tiptap/extension-image';
