import type { Articulo } from '@/content/ayuda/tipos';
import { ENTIDAD } from './entidad';

const { responsable, marca, correoSoporte, correoPrivacidad, pais, actualizado } = ENTIDAD;

/**
 * Términos y condiciones de uso de Praxis.
 *
 * Escritos **sobre lo que el producto hace de verdad** —organizaciones con
 * asientos, planes que valen dentro de su organización, PRAX que propone pero
 * no ejecuta, documentos compartibles por enlace, tokens de MCP—, no sobre un
 * formulario genérico. Si el producto cambia en algo que aquí se promete o se
 * excluye, se cambia el texto en el mismo commit.
 */
export const TERMINOS: Articulo = {
  slug: 'terminos',
  titulo: 'Términos y condiciones',
  resumen: `Las reglas de uso de ${marca}. Última actualización: ${actualizado}.`,
  categoria: 'Legal',
  bloques: [
    {
      tipo: 'aviso',
      texto: `Lee esto con calma. Al crear una cuenta, iniciar sesión o usar ${marca} aceptas estos términos y el [aviso de privacidad](/privacidad). Si no estás de acuerdo, no uses el servicio.`,
    },

    { tipo: 'h2', texto: '1. Quiénes somos y qué es Praxis' },
    {
      tipo: 'p',
      texto: `${marca} es un servicio web de gestión de proyectos para equipos: organizaciones, proyectos, espacios, tableros, tareas, documentos colaborativos, chat, reglas de automatización y un asistente de inteligencia artificial llamado PRAX. Lo opera ${responsable} («${marca}», «nosotros»).`,
    },
    {
      tipo: 'p',
      texto:
        'Estos términos son el contrato entre tú y nosotros. Si usas Praxis en nombre de una empresa o equipo, declaras que tienes autoridad para obligarlos, y «tú» incluye a esa organización.',
    },

    { tipo: 'h2', texto: '2. Quién puede usarlo' },
    {
      tipo: 'lista',
      items: [
        'Debes tener **18 años cumplidos** o la mayoría de edad en tu país, y capacidad legal para contratar. Praxis no está dirigido a menores: si descubrimos una cuenta de un menor, la cerramos.',
        'No puedes usar el servicio si una autoridad competente te lo ha prohibido, ni para actividades ilícitas.',
        'Debes darnos datos verdaderos y mantenerlos al día, en especial un **correo que controles**: sin confirmarlo no se puede iniciar sesión.',
      ],
    },

    { tipo: 'h2', texto: '3. Tu cuenta y su seguridad' },
    {
      tipo: 'lista',
      items: [
        'Puedes entrar con correo y contraseña, con tu cuenta de Google o con tu cuenta de Kyloo. Vincular una cuenta externa no nos da acceso a nada más que tu identidad básica: nombre y correo verificado.',
        'Eres responsable de lo que ocurra con tu sesión, tu contraseña y tus **tokens personales** de integración. No los compartas; si sospechas que alguien los tiene, cambia la contraseña y revoca los tokens desde Integraciones.',
        'Una persona, una cuenta. No vendas, prestes ni transfieras tu cuenta.',
        'Hay un tope de **tres organizaciones propias por persona**, la personal incluida.',
        `Avísanos de inmediato a ${correoSoporte} si detectas un uso no autorizado. No respondemos por pérdidas causadas por no haber protegido tus credenciales.`,
      ],
    },

    { tipo: 'h2', texto: '4. Organizaciones, proyectos, roles y asientos' },
    {
      tipo: 'p',
      texto:
        'Todo en Praxis cuelga de una **organización**. Cada proyecto pertenece a una organización y quien entra en él necesita un **asiento** en ella. Quien la administra decide quién entra, con qué rol y qué puede hacer cada rol.',
    },
    {
      tipo: 'lista',
      items: [
        '**El contenido de un proyecto lo ven y lo editan sus miembros, según su rol.** Las personas que administran la organización pueden gestionar sus miembros, roles, proyectos, plan y facturación. Al unirte a una organización aceptas que quien la administra pueda hacerlo.',
        '**Lo que publicas en un espacio compartido —tareas, comentarios, chat, documentos, archivos— es visible para quienes tengan acceso a ese espacio.** Antes de escribir algo, piensa en quién lo va a leer.',
        'Si una organización baja de plan o pierde asientos, quienes sobran quedan **congelados en solo lectura**, por antigüedad; nada se borra y se descongelan al recuperar los asientos. No es una sanción, es el límite de lo contratado.',
        'Los chats privados son entre las personas que comparten organización. Siguen siendo contenido alojado en nuestros servidores: ver el aviso de privacidad.',
      ],
    },

    { tipo: 'h2', texto: '5. Planes, precios y pagos' },
    {
      tipo: 'lista',
      items: [
        `${marca} tiene un plan gratuito y planes de pago. Qué incluye cada uno (proyectos, asientos, automatizaciones, almacenamiento, uso de IA) está en la página de planes y **vale solo dentro de la organización que lo paga**, no para el resto de tus organizaciones.`,
        'Los pagos los procesa **Stripe**. No vemos ni guardamos el número completo de tu tarjeta.',
        'Las suscripciones **se renuevan automáticamente** cada periodo hasta que las canceles. Cancelas cuando quieras desde el portal de facturación: conservas el plan hasta el final del periodo ya pagado.',
        'Cuando un plan ofrezca un **mes de prueba**, es uno por persona y por organización. Si no cancelas antes de que termine, se cobra el primer periodo.',
        'Los precios pueden incluir o no impuestos según tu país, y se muestran antes de pagar. Si los cambiamos, te avisaremos con anticipación razonable y el cambio aplica a partir de tu siguiente renovación.',
        '**Los pagos no son reembolsables**, salvo que la ley aplicable lo exija o que hayamos cobrado por error. Si crees que hubo un error de cobro, escríbenos en un plazo de 30 días.',
        'Si un cobro falla, podemos limitar las funciones de pago o pasar la organización al plan gratuito hasta que se regularice. No borramos tus datos por eso.',
      ],
    },

    { tipo: 'h2', texto: '6. Cuotas y uso razonable' },
    {
      tipo: 'p',
      texto:
        'Cada plan fija topes: proyectos, asientos, automatizaciones activas, almacenamiento y mensajes de IA al mes por persona. Pasarse de un tope impide **añadir** más, no borra lo que ya existe. Nos reservamos el derecho a limitar usos que, aunque quepan en el plan, dañen el servicio para los demás: carga automatizada abusiva, extracción masiva de datos o evasión de los límites.',
    },

    { tipo: 'h2', texto: '7. Tu contenido' },
    {
      tipo: 'lista',
      items: [
        '**Es tuyo.** Praxis no reclama la propiedad de nada de lo que subes o escribes.',
        'Nos das una licencia limitada, mundial y no exclusiva para **alojar, copiar, procesar y mostrar** tu contenido solo lo necesario para prestarte el servicio: guardarlo, hacer copias de seguridad, sincronizarlo en tiempo real, enviarlo al asistente cuando lo pides y mostrarlo a quienes tú o tu organización autorizan.',
        'Garantizas que tienes derecho a subirlo y que no infringe derechos de nadie ni la ley.',
        'Eres responsable de conservar tus propias copias. Hacemos copias de seguridad del sistema, pero no garantizamos recuperar un elemento concreto que se borró.',
      ],
    },

    { tipo: 'h2', texto: '8. Uso aceptable' },
    { tipo: 'p', texto: 'No puedes usar Praxis para:' },
    {
      tipo: 'lista',
      items: [
        'Subir o difundir contenido ilegal, que infrinja derechos de autor o de privacidad, difamatorio, que incite al odio o a la violencia, o que explote a menores.',
        'Enviar spam, malware o contenido engañoso (phishing), ni acosar a otras personas.',
        'Intentar acceder a cuentas, proyectos u organizaciones ajenos, saltarte permisos, cuotas o controles de seguridad, o probar vulnerabilidades sin nuestra autorización por escrito.',
        'Hacer ingeniería inversa del servicio, o interferir con su funcionamiento (ataques de denegación de servicio, scraping masivo).',
        'Revender el acceso o usar el servicio para construir un producto que compita con él.',
        'Usar las integraciones o la API para eludir los límites de tu plan.',
      ],
    },
    {
      tipo: 'p',
      texto:
        'Si lo incumples podemos retirar el contenido, suspender el proyecto o la cuenta, y notificar a las autoridades cuando corresponda.',
    },

    { tipo: 'h2', texto: '9. PRAX, el asistente de inteligencia artificial' },
    {
      tipo: 'lista',
      items: [
        '**PRAX propone; nunca ejecuta.** Puede consultar datos de tus proyectos para contestarte y proponerte acciones (crear tareas, mover, borrar…), pero cada una la aplicas tú, una a una, con tu sesión y tus permisos. Si aceptas una propuesta, la acción es tuya.',
        '**Puede equivocarse.** Las respuestas de un modelo de IA pueden ser incorrectas, incompletas o desactualizadas. Verifica antes de actuar. PRAX no ofrece asesoría legal, financiera, médica ni de ningún otro tipo profesional.',
        'Para responder, enviamos tu mensaje, el contexto del proyecto que PRAX necesite y los archivos que adjuntes a **proveedores de modelos de lenguaje** (hoy, Google Gemini y, si lo eliges, un modelo abierto servido por OpenRouter). Detalle en el aviso de privacidad.',
        'No escribas en PRAX —ni subas— datos que no quieras que se procesen así: contraseñas, claves, datos de tarjetas, datos de salud u otros datos sensibles.',
        'El uso de PRAX está sujeto a la cuota mensual de tu plan. En cada organización, cada miembro tiene su propia cuota.',
        'No te garantizamos que PRAX esté disponible siempre ni que un modelo concreto se mantenga: podemos cambiar de proveedor o de modelo.',
        'Si mencionas a PRAX en un chat de proyecto, su respuesta aparece firmada con tu nombre y la ve todo el que lea ese chat.',
      ],
    },

    { tipo: 'h2', texto: '10. Automatizaciones' },
    {
      tipo: 'p',
      texto:
        'Las reglas reaccionan a eventos (una tarea se mueve, vence una fecha…) y ejecutan acciones **sin que nadie las pulse**. Quien las crea o activa es responsable de que hagan lo que pretende, de revisarlas cuando cambie el proyecto y de lo que ocurra por una regla mal configurada, incluidos avisos enviados a otras personas. Las reglas cuentan contra la cuota de tu plan mientras están activas.',
    },

    { tipo: 'h2', texto: '11. Documentos, enlaces compartidos y chat' },
    {
      tipo: 'lista',
      items: [
        'Un documento puede compartirse «como Google Docs»: **quien tenga el enlace puede acceder** con el nivel que hayas elegido. Compártelo solo con quien debas y revisa los permisos con regularidad; desactivar el enlace corta el acceso futuro, pero no deshace lo que alguien ya copió.',
        'Los documentos se editan en tiempo real y guardan versiones. Quienes editan pueden ver quién más está dentro.',
        'Las imágenes y archivos que subas se almacenan en nuestra infraestructura y cuentan contra el almacenamiento de la organización.',
      ],
    },

    { tipo: 'h2', texto: '12. Integraciones, MCP y servicios de terceros' },
    {
      tipo: 'lista',
      items: [
        'Praxis puede conectarse a servicios externos (por ejemplo, un cliente de IA mediante el protocolo MCP). Un **token personal** actúa **con tus permisos**: lo que haga el agente que lo usa queda a tu nombre, incluidas escrituras y borrados según los alcances que le concedas.',
        'La organización puede desactivar las integraciones; si lo hace, los tokens dejan de funcionar.',
        'Los servicios de terceros se rigen por sus propios términos. No respondemos por su disponibilidad, por lo que hagan con los datos que les envíes ni por los cambios que introduzcan.',
      ],
    },

    { tipo: 'h2', texto: '13. Propiedad intelectual de Praxis' },
    {
      tipo: 'p',
      texto: `El servicio, su diseño, su nombre y sus marcas (${marca}, Kyloo y sus logotipos) son de ${responsable} o de sus licenciantes. Te damos una licencia personal, limitada, revocable e intransferible para usarlo según estos términos. Los componentes de código abierto que incluye se rigen por sus propias licencias. Si nos mandas ideas o sugerencias, podemos usarlas sin obligación hacia ti.`,
    },

    { tipo: 'h2', texto: '14. Disponibilidad y cambios del servicio' },
    {
      tipo: 'p',
      texto:
        'Trabajamos para que el servicio esté disponible, pero **no prometemos disponibilidad ininterrumpida**: puede haber mantenimientos, fallos o interrupciones de proveedores de infraestructura. Podemos añadir, cambiar o retirar funciones; si retiramos algo esencial de un plan de pago te avisaremos con tiempo razonable. Algunas funciones pueden estar en fase beta y funcionar con menos garantías.',
    },

    { tipo: 'h2', texto: '15. Suspensión y terminación' },
    {
      tipo: 'lista',
      items: [
        '**Tú** puedes dejar de usar Praxis y **eliminar tu cuenta** cuando quieras desde tu perfil. Es una acción definitiva y no se puede deshacer; antes revisa que no seas la única persona dueña de organizaciones o proyectos que otros necesitan.',
        '**Nosotros** podemos suspender o cerrar una cuenta, un proyecto o una organización si incumples estos términos, si hay un riesgo para la seguridad o para otras personas, si lo exige una autoridad o por falta de pago persistente.',
        'Un proyecto **suspendido** se puede ver pero no modificar hasta que la plataforma lo reactive. Cuando sea posible, te diremos el motivo.',
        'Al terminar, tu derecho de uso acaba. Conservamos o borramos los datos como explica el aviso de privacidad. Las cláusulas que por su naturaleza deban sobrevivir (propiedad, límites de responsabilidad, ley aplicable) seguirán vigentes.',
      ],
    },

    { tipo: 'h2', texto: '16. Sin garantías' },
    {
      tipo: 'p',
      texto:
        'En la máxima medida que permita la ley, el servicio se ofrece **«tal cual» y «según disponibilidad»**, sin garantías de ningún tipo, expresas o implícitas: idoneidad para un fin concreto, ausencia de errores, resultados esperados o compatibilidad con tus procesos. Esto no limita derechos irrenunciables que la ley te dé como consumidor.',
    },

    { tipo: 'h2', texto: '17. Limitación de responsabilidad' },
    {
      tipo: 'lista',
      items: [
        `En la máxima medida que permita la ley, ${responsable} no responde de daños indirectos, incidentales, especiales o consecuentes: pérdida de beneficios, de oportunidades, de reputación o de datos, ni de interrupciones del negocio.`,
        '**Nuestra responsabilidad total** frente a ti por cualquier reclamación relacionada con el servicio se limita a lo mayor entre (a) lo que hayas pagado a Praxis en los **12 meses anteriores** al hecho y (b) 1.000 pesos mexicanos.',
        'Nada de esto excluye la responsabilidad que no pueda excluirse por ley (dolo, o la que corresponda por normas de protección al consumidor).',
        'No respondemos de lo que decidan o hagan otros miembros de tu organización, de lo que apliques a partir de una propuesta de PRAX, ni de contenidos de terceros.',
      ],
    },

    { tipo: 'h2', texto: '18. Indemnización' },
    {
      tipo: 'p',
      texto: `Te comprometes a mantener indemne a ${responsable} frente a reclamaciones, daños y gastos razonables (incluidos honorarios de abogados) derivados de tu contenido, de tu uso del servicio en contra de estos términos o de la violación de derechos de terceros.`,
    },

    { tipo: 'h2', texto: '19. Datos personales' },
    {
      tipo: 'p',
      texto:
        'Cómo tratamos los datos personales está en el [aviso de privacidad](/privacidad), que forma parte de estos términos. Si tu organización trata datos personales de terceros en Praxis (clientes, empleados), ella es responsable de contar con las bases legales y avisos necesarios; nosotros los tratamos por cuenta suya para prestarle el servicio.',
    },

    { tipo: 'h2', texto: '20. Cambios a estos términos' },
    {
      tipo: 'p',
      texto:
        'Podemos actualizarlos. Si el cambio es importante te avisaremos dentro de la aplicación o por correo **antes** de que entre en vigor. Seguir usando el servicio después significa que lo aceptas; si no estás de acuerdo, puedes cancelar y eliminar tu cuenta. La fecha de la última revisión está al inicio.',
    },

    { tipo: 'h2', texto: '21. Ley aplicable y jurisdicción' },
    {
      tipo: 'p',
      texto: `Estos términos se rigen por las leyes de ${pais}. Para cualquier controversia, las partes se someten a los tribunales competentes de ${pais}, renunciando a cualquier otro fuero que pudiera corresponderles por su domicilio presente o futuro, salvo que la ley de protección al consumidor te otorgue el derecho de acudir a la autoridad de tu domicilio. Antes de litigar, escríbenos: casi todo se resuelve hablando.`,
    },

    { tipo: 'h2', texto: '22. Disposiciones generales' },
    {
      tipo: 'lista',
      items: [
        '**Acuerdo completo.** Estos términos y el aviso de privacidad son todo lo acordado sobre el servicio y sustituyen acuerdos previos.',
        '**Divisibilidad.** Si una cláusula resulta inválida, el resto sigue vigente.',
        '**No renuncia.** No ejercer un derecho no es renunciar a él.',
        '**Cesión.** No puedes ceder tus derechos sin nuestro permiso; nosotros podemos hacerlo en una fusión, adquisición o venta del servicio.',
        '**Fuerza mayor.** No respondemos de incumplimientos causados por hechos fuera de nuestro control razonable: fallos de proveedores de nube o de red, desastres naturales, actos de autoridad.',
        '**Comunicaciones.** Podemos notificarte por correo o dentro de la aplicación. Mantén tu correo al día.',
      ],
    },

    { tipo: 'h2', texto: '23. Contacto' },
    {
      tipo: 'p',
      texto: `Dudas sobre estos términos: ${correoSoporte}. Asuntos de datos personales: ${correoPrivacidad}.`,
    },
  ],
};
