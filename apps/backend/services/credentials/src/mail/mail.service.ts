import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Envío de correo, contra la API HTTP de Resend.
 *
 * ## Por qué HTTP y no SMTP
 *
 * Las máquinas de Google Cloud **tienen el puerto 25 bloqueado de fábrica** y no
 * se puede abrir: es una medida antispam de la plataforma, no una regla de
 * cortafuegos nuestra. El 465 y el 587 sí salen, pero una petición HTTPS
 * atraviesa cualquier red sin negociar nada, no necesita librería y no deja
 * conexiones colgadas cuando el proceso se recicla.
 *
 * ## Qué pasa sin clave
 *
 * **No se rompe nada: se registra el enlace en el log y se sigue.** Es lo que
 * permite desarrollar en local sin cuenta de Resend, y también que un despliegue
 * al que se le olvidó la clave no deje a nadie sin poder registrarse. La
 * contrapartida está dicha en voz alta: en producción, un `MAIL_API_KEY`
 * ausente significa que los enlaces de verificación viajan a los logs, así que
 * el arranque lo avisa una vez y con claridad.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly remitente: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('MAIL_API_KEY') || undefined;
    this.remitente = this.config.get<string>('MAIL_FROM') || 'PRAXIS <no-reply@usepraxis.space>';

    if (!this.apiKey) {
      this.log.warn(
        'MAIL_API_KEY no está definida: los correos no se envían y sus enlaces se escriben en el log.',
      );
    }

    /**
     * ⚠️ Resend **solo entrega desde un dominio verificado por ti**.
     *
     * Con un `MAIL_FROM` de gmail —o de cualquier dominio ajeno— responde 403 y
     * no se manda nada. Es un fallo que solo se ve leyendo los logs, así que se
     * avisa al arrancar en vez de dejar que aparezca como «no me llega el
     * correo» media hora antes de una presentación.
     */
    if (this.apiKey && !/@[\w.-]*usepraxis\.space>?\s*$/i.test(this.remitente)) {
      this.log.warn(
        `MAIL_FROM (${this.remitente}) no está en un dominio verificado en Resend. ` +
          'Los envíos serán rechazados con 403: usa algo como no-reply@usepraxis.space.',
      );
    }
  }

  /**
   * Manda un correo.
   *
   * ⚠️ **Nunca lanza.** Quien llama está a mitad de un registro o de una
   * recuperación, y que el proveedor de correo esté caído no puede tumbar esas
   * operaciones: la cuenta se creó, el token existe y se puede reenviar. Se
   * devuelve si salió bien por si quien llama quiere decir algo distinto.
   */
  async enviar(para: string, asunto: string, html: string, texto: string): Promise<boolean> {
    if (!this.apiKey) {
      this.log.warn(`[correo simulado] Para: ${para} · ${asunto}\n${texto}`);
      return false;
    }

    try {
      const respuesta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.remitente,
          to: [para],
          subject: asunto,
          html,
          text: texto,
        }),
        /* Sin tiempo de espera, un proveedor lento deja colgada la respuesta del
           registro. 10 s es de sobra para una API que responde en decenas de ms. */
        signal: AbortSignal.timeout(10_000),
      });

      if (!respuesta.ok) {
        /* El cuerpo trae el motivo real —dominio sin verificar, clave revocada—
           y sin él el diagnóstico es adivinar. No lleva datos de la persona. */
        this.log.error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
        return false;
      }

      return true;
    } catch (error) {
      this.log.error(`No se pudo enviar el correo: ${(error as Error).message}`);
      return false;
    }
  }
}
