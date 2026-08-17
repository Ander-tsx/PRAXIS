/*
 * ⚠️ Aquí vivía también `ProjectChat`, un montaje completo de `ChatPanel` para
 * la pestaña «Chat» del proyecto. Se quedó sin usar cuando la conversación se
 * mudó al centro de mensajes —aquí solo quedó la muestra de cuatro líneas— y
 * nadie lo importaba desde entonces.
 *
 * Se ha borrado porque no era código inerte: duplicaba el cableado de acciones
 * del panel, así que **cada cambio en el contrato de `ChatPanel` obligaba a
 * actualizarlo** para que el proyecto siguiera compilando, sin que nada de eso
 * llegara a ninguna pantalla. Si vuelve a hacer falta un chat de proyecto
 * incrustado, el montaje de referencia es `ProjectConversation` en
 * dashboard-front.
 */
export * from './ProjectChatPreview';
