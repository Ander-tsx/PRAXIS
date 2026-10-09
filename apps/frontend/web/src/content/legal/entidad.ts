/**
 * Quién firma los textos legales. **Un solo sitio**: los términos y el aviso de
 * privacidad leen de aquí, y cambiar un correo o un domicilio no obliga a
 * buscarlo en cuarenta párrafos.
 *
 * ⚠️ `razonSocial` y `domicilio` tienen que rellenarse con los datos reales de
 * quien opera el servicio antes de publicar: el aviso de privacidad mexicano
 * exige el domicilio del responsable. Mientras `domicilio` esté vacío, el
 * aviso omite esa frase en vez de inventarla.
 */
export const ENTIDAD = {
  marca: 'Praxis',
  /** Quien opera el servicio y responde de los datos. */
  responsable: 'Kyloo',
  /** TODO(legal): razón social o nombre completo, tal como figura en el RFC. */
  razonSocial: undefined as string | undefined,
  /** TODO(legal): domicilio para oír y recibir notificaciones. */
  domicilio: undefined as string | undefined,
  sitio: 'https://usepraxis.space',
  correoPrivacidad: 'privacidad@usepraxis.space',
  correoSoporte: 'soporte@usepraxis.space',
  /** La ley que rige y donde se resuelven las disputas. */
  pais: 'México',
  /** Última revisión de ambos textos. Cambia al editar cualquiera de los dos. */
  actualizado: '9 de octubre de 2026',
} as const;
