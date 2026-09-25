/**
 * Los dos correos que manda el sistema.
 *
 * En HTML plano con estilos en línea, sin plantillas ni dependencias: los
 * clientes de correo no aplican hojas de estilo externas ni entienden la mitad
 * de CSS moderno, así que cualquier abstracción acabaría generando esto mismo.
 *
 * Cada uno viaja además **en texto plano**. No es cortesía: un correo que solo
 * trae HTML puntúa peor en los filtros antispam, y algunos clientes lo enseñan
 * en crudo.
 *
 * ## La paleta es la del panel de acceso, no la de la app
 *
 * La aplicación es oscura y monocroma; estos correos son **claros**. Es la misma
 * decisión que `AuthPanel` (`commons/styles/landing-theme.css`, variante
 * `.landing-light.cold`): blanco de verdad, gris neutro y un negro casi puro
 * como único acento. Un correo transaccional oscuro se lee peor en la mayoría
 * de clientes y en modo claro del sistema, y el índigo que había antes
 * (`#6366F1`) era justo el tono azul-morado que se ha quitado del resto de la
 * marca. Sobrio, sin color de relleno.
 */

/* Los mismos valores que `.landing-light.cold`. Escritos a mano —no hay forma
   de importar un token de CSS en un string de correo— y en un solo sitio. */
const FONDO = '#f4f5f7';
const TARJETA = '#ffffff';
const BORDE = '#e5e7eb';
const TINTA = '#101114';
const TINTA_SUAVE = '#374151';
const TENUE = '#6b7280';

/** Envoltorio común: cabecera, cuerpo y pie. */
function marco(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:${FONDO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" style="max-width:480px;margin:0 auto;background:${TARJETA};border:1px solid ${BORDE};border-radius:12px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 28px;font-size:15px;font-weight:700;letter-spacing:1.5px;color:${TINTA};">PRAXIS</p>
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:600;color:${TINTA};">${titulo}</h1>
        ${cuerpo}
      </td></tr>
    </table>
    <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:${TENUE};text-align:center;">
      Si no esperabas este correo, puedes ignorarlo sin hacer nada.
    </p>
  </body>
</html>`;
}

/** El botón. Va también como enlace de texto: hay clientes que no pintan el botón. */
function boton(enlace: string, texto: string): string {
  return `
    <p style="margin:0 0 24px;">
      <a href="${enlace}" style="display:inline-block;padding:12px 24px;background:${TINTA};color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">${texto}</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${TENUE};">
      Si el botón no funciona, copia esta dirección en tu navegador:
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;color:${TINTA_SUAVE};">${enlace}</p>`;
}

export function correoDeVerificacion(enlace: string, horas: number) {
  return {
    asunto: 'Confirma tu correo en PRAXIS',
    html: marco(
      'Confirma tu correo',
      `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${TINTA_SUAVE};">
         Ya casi está. Pulsa el botón para confirmar esta dirección y poder entrar.
         El enlace caduca en ${horas} horas.
       </p>${boton(enlace, 'Confirmar mi correo')}`,
    ),
    texto: `Confirma tu correo en PRAXIS.\n\nAbre este enlace para confirmar tu dirección y poder entrar. Caduca en ${horas} horas.\n\n${enlace}\n\nSi no esperabas este correo, ignóralo.`,
  };
}

export function correoDeRecuperacion(enlace: string, minutos: number) {
  return {
    asunto: 'Recupera tu contraseña de PRAXIS',
    html: marco(
      'Recupera tu contraseña',
      `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${TINTA_SUAVE};">
         Alguien —esperamos que tú— ha pedido cambiar la contraseña de esta cuenta.
         El enlace caduca en ${minutos} minutos y solo sirve una vez.
       </p>${boton(enlace, 'Elegir una contraseña nueva')}
       <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${TENUE};">
         Si no has sido tú, no hace falta que hagas nada: tu contraseña actual sigue funcionando.
       </p>`,
    ),
    texto: `Recupera tu contraseña de PRAXIS.\n\nAbre este enlace para elegir una contraseña nueva. Caduca en ${minutos} minutos y solo sirve una vez.\n\n${enlace}\n\nSi no has sido tú, ignora este correo: tu contraseña actual sigue funcionando.`,
  };
}

/**
 * La invitación a una organización.
 *
 * ⚠️ **Dice quién invita y a qué**, y no solo «te han invitado». Un correo con
 * un enlace y sin nombre reconocible es indistinguible de un intento de engaño,
 * y va a parar a la papelera o —peor— se marca como no deseado, que estropea la
 * entrega de los siguientes.
 */
export function correoDeInvitacion(datos: {
  enlace: string;
  organizacion: string;
  invitaPor: string | null;
  horas: number;
}) {
  const quien = datos.invitaPor ? `${datos.invitaPor} te ha invitado` : 'Te han invitado';

  return {
    asunto: `${quien} a ${datos.organizacion} en PRAXIS`,
    html: marco(
      `Únete a ${datos.organizacion}`,
      `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${TINTA_SUAVE};">
         ${quien} a trabajar en <strong style="color:${TINTA};">${datos.organizacion}</strong>.
         Al entrar tendrás acceso a los proyectos del equipo en los que te añadan.
         El enlace caduca en ${datos.horas} horas.
       </p>${boton(datos.enlace, 'Aceptar la invitación')}
       <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${TENUE};">
         Si no tienes cuenta, el enlace te llevará a crearla primero. Usa esta misma
         dirección de correo: la invitación solo vale para ella.
       </p>`,
    ),
    texto: `${quien} a ${datos.organizacion} en PRAXIS.\n\nAbre este enlace para aceptar. Caduca en ${datos.horas} horas.\n\n${datos.enlace}\n\nSi no tienes cuenta, el enlace te llevará a crearla primero, y tienes que usar esta misma dirección de correo.\n\nSi no esperabas este correo, ignóralo.`,
  };
}

/** Lo que escribe una persona no entra en un correo sin escapar. */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Invitación a un documento (E8 de `docs/PLAN-DOCUMENTOS.md`). El título lo
 * escribió alguien, así que va escapado: en un correo HTML sería una puerta.
 */
export function correoDeDocumentoCompartido(datos: {
  enlace: string;
  titulo: string;
  invitaPor: string | null;
  puedeEditar: boolean;
}) {
  const quien = datos.invitaPor ? `${datos.invitaPor} ha compartido` : 'Han compartido';
  const titulo = datos.titulo || 'Sin título';
  const permiso = datos.puedeEditar ? 'Puedes leerlo y editarlo.' : 'Puedes leerlo.';

  return {
    asunto: `${quien} «${titulo}» contigo`,
    html: marco(
      escapar(titulo),
      `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${TINTA_SUAVE};">
         ${escapar(quien)} un documento contigo en PRAXIS. ${permiso}
       </p>${boton(datos.enlace, 'Abrir el documento')}
       <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${TENUE};">
         Entra con esta misma dirección de correo: la invitación solo vale para ella.
         Si no tienes cuenta, puedes crearla con este correo.
       </p>`,
    ),
    texto: `${quien} «${titulo}» contigo en PRAXIS. ${permiso}\n\n${datos.enlace}\n\nEntra con esta misma dirección de correo: la invitación solo vale para ella.`,
  };
}
