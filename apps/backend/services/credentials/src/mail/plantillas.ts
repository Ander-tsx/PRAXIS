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
 */

/** Envoltorio común: cabecera, cuerpo y pie. */
function marco(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#0F131C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" style="max-width:480px;margin:0 auto;background:#171D2A;border-radius:16px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 24px;font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#6366F1;">PRAXIS</p>
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#F1F3F9;">${titulo}</h1>
        ${cuerpo}
      </td></tr>
    </table>
    <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#9AA0B4;text-align:center;">
      Si no esperabas este correo, puedes ignorarlo sin hacer nada.
    </p>
  </body>
</html>`;
}

/** El botón. Va también como enlace de texto: hay clientes que no pintan el botón. */
function boton(enlace: string, texto: string): string {
  return `
    <p style="margin:0 0 24px;">
      <a href="${enlace}" style="display:inline-block;padding:12px 24px;background:#6366F1;color:#FFFFFF;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">${texto}</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#9AA0B4;">
      Si el botón no funciona, copia esta dirección en tu navegador:
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;color:#6366F1;">${enlace}</p>`;
}

export function correoDeVerificacion(enlace: string, horas: number) {
  return {
    asunto: 'Confirma tu correo en PRAXIS',
    html: marco(
      'Confirma tu correo',
      `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#C7CCDB;">
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
      `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#C7CCDB;">
         Alguien —esperamos que tú— ha pedido cambiar la contraseña de esta cuenta.
         El enlace caduca en ${minutos} minutos y solo sirve una vez.
       </p>${boton(enlace, 'Elegir una contraseña nueva')}
       <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#9AA0B4;">
         Si no has sido tú, no hace falta que hagas nada: tu contraseña actual sigue funcionando.
       </p>`,
    ),
    texto: `Recupera tu contraseña de PRAXIS.\n\nAbre este enlace para elegir una contraseña nueva. Caduca en ${minutos} minutos y solo sirve una vez.\n\n${enlace}\n\nSi no has sido tú, ignora este correo: tu contraseña actual sigue funcionando.`,
  };
}
