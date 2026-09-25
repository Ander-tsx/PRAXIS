/**
 * Los servicios que un enlace nombra por sí solo (E7 de
 * `docs/PLAN-DOCUMENTOS.md`).
 *
 * Se reconocen **por la URL, sin pedir nada**: así la tarjeta de un documento
 * de Google sale con su icono y su nombre aunque sea privado —y un documento
 * privado de Google no deja leer su título sin la sesión de quien lo abre—.
 *
 * `embed` es la URL que se puede meter en un `<iframe>` para verlo dentro del
 * documento, o `null` si ese servicio no lo permite.
 */
export interface Proveedor {
  id: string;
  nombre: string;
  /** Lo que es: «Documento», «Hoja de cálculo», «Reunión»… */
  tipo: string;
  embed: string | null;
}

function docsDeGoogle(url: URL, ruta: string, tipo: string, id: string): Proveedor | null {
  const m = url.pathname.match(new RegExp(`/${ruta}/d/([\\w-]+)`));
  if (!m) return null;
  return {
    id,
    nombre: 'Google',
    tipo,
    embed: `https://docs.google.com/${ruta}/d/${m[1]}/preview`,
  };
}

export function reconocerProveedor(texto: string): Proveedor | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'docs.google.com') {
    return (
      docsDeGoogle(url, 'document', 'Documento de Google', 'google-docs') ??
      docsDeGoogle(url, 'spreadsheets', 'Hoja de cálculo de Google', 'google-sheets') ??
      docsDeGoogle(url, 'presentation', 'Presentación de Google', 'google-slides') ??
      docsDeGoogle(url, 'forms', 'Formulario de Google', 'google-forms') ?? {
        id: 'google-docs',
        nombre: 'Google',
        tipo: 'Archivo de Google',
        embed: null,
      }
    );
  }
  if (host === 'drive.google.com') {
    const m = url.pathname.match(/\/file\/d\/([\w-]+)/);
    return {
      id: 'google-drive',
      nombre: 'Google Drive',
      tipo: 'Archivo de Drive',
      embed: m ? `https://drive.google.com/file/d/${m[1]}/preview` : null,
    };
  }
  if (host === 'meet.google.com') {
    return { id: 'google-meet', nombre: 'Google Meet', tipo: 'Reunión', embed: null };
  }
  if (host === 'calendar.google.com') {
    return { id: 'google-calendar', nombre: 'Google Calendar', tipo: 'Calendario', embed: null };
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const id =
      host === 'youtu.be'
        ? url.pathname.slice(1)
        : (url.searchParams.get('v') ?? url.pathname.match(/\/(?:shorts|embed)\/([\w-]+)/)?.[1]);
    return {
      id: 'youtube',
      nombre: 'YouTube',
      tipo: 'Vídeo',
      embed: id ? `https://www.youtube-nocookie.com/embed/${id}` : null,
    };
  }
  if (host === 'loom.com') {
    const id = url.pathname.match(/\/share\/([\w-]+)/)?.[1];
    return {
      id: 'loom',
      nombre: 'Loom',
      tipo: 'Vídeo',
      embed: id ? `https://www.loom.com/embed/${id}` : null,
    };
  }
  if (host === 'vimeo.com') {
    const id = url.pathname.match(/\/(\d+)/)?.[1];
    return {
      id: 'vimeo',
      nombre: 'Vimeo',
      tipo: 'Vídeo',
      embed: id ? `https://player.vimeo.com/video/${id}` : null,
    };
  }
  if (host === 'figma.com') {
    return {
      id: 'figma',
      nombre: 'Figma',
      tipo: 'Diseño',
      embed: `https://www.figma.com/embed?embed_host=praxis&url=${encodeURIComponent(url.toString())}`,
    };
  }
  if (host === 'miro.com') {
    const id = url.pathname.match(/\/board\/([\w=-]+)/)?.[1];
    return {
      id: 'miro',
      nombre: 'Miro',
      tipo: 'Pizarra',
      embed: id ? `https://miro.com/app/live-embed/${id}/` : null,
    };
  }
  if (host === 'github.com') {
    return { id: 'github', nombre: 'GitHub', tipo: 'Repositorio', embed: null };
  }
  if (host.endsWith('notion.so') || host.endsWith('notion.site')) {
    return { id: 'notion', nombre: 'Notion', tipo: 'Página', embed: null };
  }
  if (host === 'zoom.us' || host.endsWith('.zoom.us')) {
    return { id: 'zoom', nombre: 'Zoom', tipo: 'Reunión', embed: null };
  }
  if (host === 'teams.microsoft.com') {
    return { id: 'teams', nombre: 'Microsoft Teams', tipo: 'Reunión', embed: null };
  }
  return null;
}
