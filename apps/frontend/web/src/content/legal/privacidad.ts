import type { Articulo } from '@/content/ayuda/tipos';
import { ENTIDAD } from './entidad';

const { responsable, razonSocial, domicilio, marca, correoPrivacidad, pais, actualizado } = ENTIDAD;

/**
 * Aviso de privacidad integral de Praxis.
 *
 * Se escribe contra la **Ley Federal de Protección de Datos Personales en
 * Posesión de los Particulares** y lo que de ella se desprende, que es la que
 * aplica a un servicio operado desde México: identidad del responsable,
 * datos, finalidades primarias y secundarias, transferencias, derechos ARCO y
 * medios para ejercerlos. Describe **lo que el sistema hace de verdad**
 * (proveedores, cookies, retención), así que si cambia un proveedor o una
 * cookie, este texto cambia en el mismo commit.
 *
 * ⚠️ No nombra a la autoridad de protección de datos: ha cambiado de manos y un
 * nombre equivocado en un aviso legal es peor que decir «la autoridad
 * competente».
 */
export const PRIVACIDAD: Articulo = {
  slug: 'privacidad',
  titulo: 'Aviso de privacidad',
  resumen: `Qué datos tratamos, para qué, con quién los compartimos y cómo ejercer tus derechos. Última actualización: ${actualizado}.`,
  categoria: 'Legal',
  bloques: [
    {
      tipo: 'aviso',
      texto: `Este aviso explica cómo ${responsable} trata tus datos personales cuando usas ${marca}. Forma parte de los [términos y condiciones](/terminos). Si algo no te queda claro, escribe a ${correoPrivacidad}.`,
    },

    { tipo: 'h2', texto: '1. Quién es el responsable' },
    {
      tipo: 'p',
      texto: `${razonSocial ?? responsable} («${marca}», «nosotros») es el responsable del tratamiento de tus datos personales.${
        domicilio ? ` Domicilio: ${domicilio}.` : ''
      } Contacto para asuntos de privacidad: **${correoPrivacidad}**.`,
    },
    {
      tipo: 'p',
      texto:
        'Un matiz importante: cuando tu **organización** usa Praxis para guardar datos de otras personas (clientes, colaboradores, candidatos…), ella decide qué se guarda y para qué; nosotros lo alojamos y procesamos por su cuenta para prestarle el servicio.',
    },

    { tipo: 'h2', texto: '2. Qué datos recabamos' },
    {
      tipo: 'tabla',
      cabecera: ['Categoría', 'Ejemplos', 'De dónde salen'],
      filas: [
        [
          'Identificación y cuenta',
          'Nombre, apellidos, correo, foto de perfil, estado de presencia. La contraseña no la guarda Praxis: la custodia Kyloo Accounts',
          'Tú, al crear tu cuenta de Kyloo o editar tu perfil; Kyloo Accounts nos confirma tu identidad (nombre y correo verificado), y Google si entras con él',
        ],
        [
          'Contenido de trabajo',
          'Organizaciones, proyectos, tareas, descripciones, comentarios, etiquetas, checklists, documentos, imágenes y archivos adjuntos, mensajes de chat',
          'Lo que tú y tu equipo escriben o suben',
        ],
        [
          'Uso del asistente PRAX',
          'Tus mensajes, las respuestas, las propuestas que aceptas o descartas, adjuntos y consumo de tokens',
          'Tú, al conversar con PRAX',
        ],
        [
          'Facturación',
          'Organización, plan, asientos, estado de la suscripción, identificadores de cliente y pago de Stripe, últimos dígitos y marca de la tarjeta',
          'Tú y Stripe. **No recibimos ni guardamos el número completo de tu tarjeta**',
        ],
        [
          'Técnicos y de seguridad',
          'Dirección IP, tipo de dispositivo y navegador, fechas y horas de acceso, registros de errores, sesiones activas',
          'Tu navegador o aplicación, automáticamente',
        ],
        [
          'Integraciones',
          'Tokens personales de MCP (guardados con hash, no en claro), registro de uso de cada herramienta',
          'Tú, al crearlos y usarlos',
        ],
        ['Comunicaciones', 'Correos de soporte y su contenido', 'Tú, cuando nos escribes'],
      ],
    },

    { tipo: 'h2', texto: '3. Datos sensibles y menores' },
    {
      tipo: 'p',
      texto:
        'No solicitamos datos personales sensibles (salud, origen étnico, creencias, vida sexual, datos biométricos, afiliación sindical, etc.). Praxis tampoco está pensado para guardarlos: **si decides escribirlos o subirlos, lo haces bajo tu responsabilidad** y la de tu organización, y te pedimos no enviarlos a PRAX. Praxis no está dirigido a menores de 18 años y no recabamos sus datos a sabiendas.',
    },

    { tipo: 'h2', texto: '4. Para qué usamos tus datos' },
    { tipo: 'p', texto: '**Finalidades primarias** (necesarias para darte el servicio):' },
    {
      tipo: 'lista',
      items: [
        'Crear y administrar tu cuenta, verificar tu correo y autenticarte.',
        'Prestar las funciones del producto: proyectos, tareas, documentos en tiempo real, chat, avisos, reglas de automatización y exportaciones.',
        'Responder a lo que le pides a PRAX y mostrarte sus propuestas.',
        'Gestionar planes, asientos, cobros, facturas y cancelaciones.',
        'Enviar correos transaccionales: verificación de cuenta, restablecer contraseña, invitaciones, avisos de facturación.',
        'Mantener la seguridad: detectar accesos indebidos, abuso, límites de uso, y prevenir fraude.',
        'Atender soporte, aclaraciones y ejercicio de tus derechos.',
        'Cumplir obligaciones legales y atender requerimientos de autoridad.',
      ],
    },
    { tipo: 'p', texto: '**Finalidades secundarias** (no necesarias para el servicio):' },
    {
      tipo: 'lista',
      items: [
        'Medir y mejorar el producto con estadísticas de uso **agregadas y sin identificarte**.',
        'Enviarte novedades del producto o encuestas, que puedes dejar de recibir en cualquier momento.',
      ],
    },
    {
      tipo: 'p',
      texto: `Si **no** quieres que usemos tus datos para las finalidades secundarias, escríbenos a ${correoPrivacidad} y lo dejamos de hacer, sin que afecte a tu servicio. No vendemos tus datos ni los usamos para publicidad de terceros.`,
    },

    { tipo: 'h2', texto: '5. Inteligencia artificial (PRAX)' },
    {
      tipo: 'lista',
      items: [
        'Cuando conversas con PRAX enviamos a un proveedor de modelos de lenguaje: tu mensaje, el historial de esa conversación, **el contexto del proyecto que PRAX necesita para contestarte** (tareas, miembros, documentos, reglas que consulte), y los archivos que adjuntes.',
        'Los proveedores actuales son **Google (Gemini)** y, si eliges ese modelo en el compositor, un modelo abierto servido por **OpenRouter**. Podemos cambiarlos; este aviso se actualizará.',
        `${marca} **no entrena modelos propios con tu contenido**. Los proveedores procesan los datos para generar la respuesta y se rigen por sus propias condiciones y políticas de privacidad; consúltalas si tu caso lo requiere.`,
        'PRAX solo puede consultar lo que **tú** puedes ver, con tus permisos y en el proyecto u organización que tengas activos. **No ejecuta acciones**: te las propone y las aplicas tú.',
        'De los archivos que adjuntas a PRAX conservamos el texto extraído (de PDF, .md y .txt) para que la conversación no lo pierda; de una imagen no se guarda nada más que lo que PRAX contó de ella.',
      ],
    },

    { tipo: 'h2', texto: '6. Con quién compartimos tus datos' },
    {
      tipo: 'p',
      texto:
        'Compartimos datos con proveedores que nos ayudan a operar el servicio (**encargados**), solo lo necesario y bajo sus propios compromisos de confidencialidad y seguridad:',
    },
    {
      tipo: 'tabla',
      cabecera: ['Proveedor', 'Para qué', 'Qué recibe'],
      filas: [
        [
          'Railway',
          'Alojamiento de la aplicación, la base de datos y el caché',
          'Todos los datos del servicio, cifrados en tránsito',
        ],
        ['Google Cloud Storage', 'Almacenamiento de archivos e imágenes', 'Los archivos que subes'],
        [
          'Google (Sign-In y Gemini)',
          'Inicio de sesión con Google y modelo de IA de PRAX',
          'Nombre y correo al iniciar sesión; el contenido que envías a PRAX',
        ],
        [
          'OpenRouter y el proveedor del modelo abierto',
          'Modelo alternativo de PRAX, si lo eliges',
          'El contenido que envías a PRAX con ese modelo',
        ],
        [
          'Stripe',
          'Cobros y suscripciones',
          'Correo, organización, plan y datos de pago, que introduces directamente en Stripe',
        ],
        [
          'Resend',
          'Envío de correo transaccional',
          'Tu correo y el contenido del mensaje (enlace de verificación, invitación…)',
        ],
        [
          'Kyloo Accounts',
          'Tu cuenta de acceso: alta, inicio de sesión, verificación del correo, recuperación y cambio de contraseña, doble factor y conexión de agentes de IA (OAuth)',
          'Tu correo, tu nombre y tu contraseña (con hash irreversible, nunca en claro), y los datos técnicos de cada inicio de sesión',
        ],
      ],
    },
    {
      tipo: 'p',
      texto:
        'También podemos comunicar datos: (a) **dentro de tu organización**, a las personas que la administran y a tus compañeros según los permisos (sección 7); (b) a **autoridades** cuando lo exija la ley o una orden judicial; (c) a un **sucesor** si el servicio se fusiona o se vende, con el mismo nivel de protección; y (d) a **servicios que tú conectes** (integraciones, MCP) cuando uses un token, bajo tus alcances.',
    },
    {
      tipo: 'p',
      texto: `Algunos de estos proveedores están fuera de ${pais} (por ejemplo, en Estados Unidos o la Unión Europea), por lo que tus datos pueden **transferirse y procesarse internacionalmente**. Al usar el servicio consientes estas transferencias, que son necesarias para prestarlo, y nos aseguramos de que el receptor ofrezca garantías de protección adecuadas.`,
    },

    { tipo: 'h2', texto: '7. Quién ve tus datos dentro de Praxis' },
    {
      tipo: 'lista',
      items: [
        '**Tus compañeros de proyecto** ven lo que publicas en él (tareas, comentarios, documentos, chat) y tu nombre, foto y estado de presencia.',
        '**Quienes administran tu organización** ven y gestionan a sus miembros, roles, proyectos, plan y facturación.',
        '**Los chats privados** los ven solo sus participantes; aun así están alojados en nuestros servidores y pueden consultarse si una autoridad competente lo exige o para investigar un abuso grave.',
        '**El personal de la plataforma** con rol de administración puede suspender o reactivar proyectos y revisar cuentas para operar el servicio y la seguridad. El acceso es limitado a lo necesario y no leemos tu contenido sin causa justificada (soporte que pides, abuso, orden legal).',
        'Los **documentos compartidos por enlace** los ve cualquiera que tenga ese enlace, con el nivel que hayas elegido.',
      ],
    },

    { tipo: 'h2', texto: '8. Cookies y tecnologías similares' },
    {
      tipo: 'p',
      texto:
        'Usamos cookies y almacenamiento local **funcionales**, necesarios para que la aplicación funcione y recuerde tus preferencias. **No usamos cookies de publicidad ni herramientas de analítica o rastreo de terceros.**',
    },
    {
      tipo: 'tabla',
      cabecera: ['Cookie', 'Para qué', 'Duración'],
      filas: [
        [
          '`praxis_session`',
          'Mantener tu sesión iniciada (httpOnly: el JavaScript de la página no puede leerla)',
          'Corta; se renueva sola',
        ],
        [
          '`praxis_refresh`',
          'Renovar la sesión sin pedirte la contraseña (httpOnly)',
          'Larga, hasta cerrar sesión',
        ],
        ['`praxis_org`', 'Recordar tu organización activa', 'Persistente'],
        [
          '`praxis_prax_modelo`, `praxis_sidebar*`, `praxis_nav_compactados`, `praxis_ultimo_chat`, `praxis_hilos_*`, `praxis_theme`',
          'Preferencias de interfaz: modelo de PRAX, barra lateral, último chat, hilos vistos',
          'Persistente',
        ],
      ],
    },
    {
      tipo: 'p',
      texto:
        'La aplicación instalada (PWA) guarda en tu dispositivo una **copia de lo ya leído para consultarlo sin conexión**, por persona. Se borra al cerrar sesión. Puedes bloquear las cookies desde tu navegador, pero la sesión no funcionará sin las técnicas.',
    },

    { tipo: 'h2', texto: '9. Cuánto tiempo conservamos tus datos' },
    {
      tipo: 'lista',
      items: [
        '**Mientras tu cuenta exista**, conservamos los datos necesarios para el servicio.',
        '**Si eliminas tu cuenta**, se borran de inmediato tu perfil, tu correo y tus credenciales. El contenido que aportaste a espacios compartidos (tareas, comentarios, documentos) puede permanecer para que tu equipo no pierda su trabajo, **sin un perfil asociado**. Si quieres que se borre algo concreto, pídelo antes o escríbenos y lo eliminamos.',
        '**Datos de facturación**: los conservamos el tiempo que exigen las obligaciones fiscales y contables.',
        '**Registros técnicos y de seguridad**: se conservan por un periodo limitado y se eliminan o anonimizan después.',
        'Las **copias de seguridad** del sistema pueden retener datos eliminados durante un ciclo de rotación antes de desaparecer.',
        'Cuando un proyecto se elimina, se elimina su contenido; no se puede deshacer.',
      ],
    },

    {
      tipo: 'h2',
      texto: '10. Tus derechos: acceso, rectificación, cancelación y oposición (ARCO)',
    },
    {
      tipo: 'p',
      texto: 'Tienes derecho a:',
    },
    {
      tipo: 'lista',
      items: [
        '**Acceder** a los datos que tenemos sobre ti y a conocer cómo los tratamos.',
        '**Rectificarlos** si son inexactos o están incompletos (la mayoría puedes editarlos tú en tu perfil).',
        '**Cancelarlos** cuando ya no sean necesarios, y que dejemos de tratarlos. Puedes eliminar tu cuenta desde tu perfil.',
        '**Oponerte** al tratamiento para ciertas finalidades, en especial las secundarias.',
        '**Revocar tu consentimiento** y **limitar el uso o la divulgación** de tus datos.',
      ],
    },
    {
      tipo: 'pasos',
      items: [
        `Escribe a **${correoPrivacidad}** desde el correo de tu cuenta con el asunto «Derechos ARCO».`,
        'Indica tu nombre, qué derecho ejerces y sobre qué datos, y una forma de contactarte. Acredita tu identidad: el propio correo de la cuenta suele bastar, y podemos pedirte un dato más.',
        'Te responderemos en un plazo máximo de **20 días hábiles** y, si procede, lo haremos efectivo en los **15 días hábiles** siguientes. Puede haber excepciones legales; si es el caso, te lo explicaremos.',
      ],
    },
    {
      tipo: 'p',
      texto:
        'Si sientes que tu derecho no fue atendido, puedes acudir a la autoridad competente en materia de protección de datos personales. Si resides fuera de México, puedes tener derechos adicionales según tu ley local (portabilidad, limitación, queja ante tu autoridad); atenderemos esas solicitudes por el mismo canal.',
    },

    { tipo: 'h2', texto: '11. Cómo protegemos tus datos' },
    {
      tipo: 'lista',
      items: [
        'Las comunicaciones viajan cifradas (HTTPS/WSS).',
        'Tus credenciales de acceso las custodia **Kyloo Accounts**: las contraseñas se guardan solo con un hash irreversible, nunca en claro, y Praxis no las ve. Los tokens personales también se guardan solo como hash.',
        'La sesión vive en cookies httpOnly, nunca en el almacenamiento accesible por JavaScript.',
        'Permisos por organización, proyecto y rol; los límites de plan se aplican en el servidor.',
        'Límites de intentos de inicio de sesión y verificación del correo antes de entrar.',
        'Acceso interno restringido a quien lo necesita para operar el servicio.',
      ],
    },
    {
      tipo: 'aviso',
      texto:
        'Ningún sistema es infalible. Si ocurre una vulneración que afecte de forma significativa tus derechos, te lo comunicaremos sin dilación para que puedas tomar medidas.',
    },

    { tipo: 'h2', texto: '12. Cambios a este aviso' },
    {
      tipo: 'p',
      texto:
        'Podemos modificar este aviso por cambios legales, de proveedores o del producto. Publicaremos la versión nueva aquí, con su fecha, y si el cambio afecta de forma importante a tus datos te lo avisaremos dentro de la aplicación o por correo.',
    },

    { tipo: 'h2', texto: '13. Contacto' },
    {
      tipo: 'p',
      texto: `Privacidad y derechos ARCO: **${correoPrivacidad}**. Versión vigente: ${actualizado}.`,
    },
  ],
};
