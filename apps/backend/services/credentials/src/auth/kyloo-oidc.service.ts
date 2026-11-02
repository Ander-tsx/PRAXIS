import { type Kyloo, KylooError, type KylooOptions, createKyloo } from '@kyloo/auth';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';

/** Lo que Praxis lee de la identidad de Kyloo. El resto del id_token no se usa. */
export interface PerfilKyloo {
  sub: string;
  email: string;
  name: string;
}

interface Descubrimiento {
  issuer: string;
  token_endpoint: string;
}

/**
 * El cliente OIDC de Kyloo Accounts: canjea el `code` y verifica el id_token.
 *
 * Se hace **aquí y no en el servidor web** por una razón: el secreto del cliente
 * (`KYLOO_CLIENT_SECRET`) solo debe existir en el backend, y la verificación del
 * token es la parte que no puede salir mal en silencio.
 *
 * ## Qué se comprueba, y por qué cada cosa
 *
 * - **Firma** contra el JWKS de Accounts: sin ella el token no vale nada.
 * - **`iss`** igual al emisor configurado: un token de otro emisor con claves
 *   propias pasaría la firma de su propio JWKS.
 * - **`aud`** igual a nuestro `client_id`: es lo que impide que el id_token que
 *   Accounts emitió para otra aplicación (Oskel) sirva para entrar en Praxis.
 * - **`nonce`** igual al de nuestro intento: ata el token a esta petición y no
 *   a una anterior que alguien haya capturado.
 * - **`email_verified === true`**: la vinculación decide por el correo, y un
 *   correo sin confirmar no identifica a nadie.
 *
 * ## La verificación es del SDK
 *
 * `@kyloo/auth` (`verifyIdToken`) comprueba firma, emisor, destinatario (`aud`), caducidad y
 * `nonce`, y exige el correo verificado. El `id_token` ya trae `sub`, `email` y `name`: no hace
 * falta llamar a `userinfo`, que era un viaje de red más en cada entrada.
 */
/** Solo las pruebas sustituyen las claves de Kyloo con las suyas. */
export const KYLOO_CLIENT_OPTIONS = 'KYLOO_OIDC_CLIENT_OPTIONS';

@Injectable()
export class KylooOidcService {
  private readonly log = new Logger(KylooOidcService.name);
  private descubrimiento?: Promise<Descubrimiento>;
  private client?: Kyloo;

  constructor(
    private readonly config: ConfigService,
    /** Solo las pruebas sustituyen las claves de Kyloo. */
    @Optional()
    @Inject(KYLOO_CLIENT_OPTIONS)
    private readonly overrides?: Partial<KylooOptions>,
  ) {}

  private kyloo(issuer: string, clientId: string): Kyloo {
    this.client ??= createKyloo({ issuer, clientId, ...this.overrides });
    return this.client;
  }

  private requerir() {
    const issuer = this.config.get<string>('KYLOO_ISSUER');
    const clientId = this.config.get<string>('KYLOO_CLIENT_ID');
    const clientSecret = this.config.get<string>('KYLOO_CLIENT_SECRET');
    /* Como Google: sin configurar, el resto de la autenticación funciona y solo
       este camino responde 503 diciendo qué falta. */
    if (!issuer || !clientId || !clientSecret) {
      throw new RpcException({
        statusCode: 503,
        message: 'La entrada con Kyloo no está configurada en este entorno',
      });
    }
    return { issuer: issuer.replace(/\/$/, ''), clientId, clientSecret };
  }

  private descubrir(issuer: string): Promise<Descubrimiento> {
    this.descubrimiento ??= (async () => {
      const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`discovery ${res.status}`);
      const doc = (await res.json()) as Descubrimiento;
      /* El documento tiene que declararse del emisor que configuramos: si no,
         quien controle esa respuesta controla hacia dónde enviamos el secreto. */
      if (doc.issuer !== issuer) throw new Error('el emisor del documento no coincide');
      return doc;
    })().catch((e) => {
      this.descubrimiento = undefined; // un fallo no se queda cacheado
      throw e;
    });
    return this.descubrimiento;
  }

  async perfilDesdeCodigo(entrada: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
  }): Promise<PerfilKyloo> {
    const { issuer, clientId, clientSecret } = this.requerir();

    let doc: Descubrimiento;
    try {
      doc = await this.descubrir(issuer);
    } catch (e) {
      this.log.error(`No se pudo leer la configuración de Kyloo Accounts: ${String(e)}`);
      throw new RpcException({ statusCode: 502, message: 'Kyloo Accounts no responde' });
    }

    let cuerpo: { id_token?: string };
    try {
      const res = await fetch(doc.token_endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(
            `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`,
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: entrada.code,
          redirect_uri: entrada.redirectUri,
          code_verifier: entrada.codeVerifier,
        }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`token ${res.status}`);
      cuerpo = (await res.json()) as { id_token?: string };
    } catch (e) {
      /* Código caducado, ya usado, verificador distinto o redirect distinta:
         todo significa lo mismo hacia fuera. */
      this.log.warn(`Canje de código rechazado por Kyloo Accounts: ${String(e)}`);
      throw new RpcException({ statusCode: 401, message: 'Kyloo no aceptó el intento de entrada' });
    }
    if (!cuerpo.id_token) {
      throw new RpcException({ statusCode: 401, message: 'Kyloo no devolvió identidad' });
    }

    try {
      const identidad = await this.kyloo(issuer, clientId).verifyIdToken({
        idToken: cuerpo.id_token,
        nonce: entrada.nonce,
      });
      return { sub: identidad.sub, email: identidad.email, name: identidad.name ?? '' };
    } catch (e) {
      if (e instanceof KylooError && e.code === 'unavailable') {
        throw new RpcException({ statusCode: 502, message: 'Kyloo Accounts no responde' });
      }
      /* Firma, emisor, destinatario, caducidad, nonce y correo sin verificar significan lo mismo
         hacia fuera: esta identidad no vale. */
      this.log.warn(`id_token de Kyloo rechazado: ${String(e)}`);
      throw new RpcException({ statusCode: 401, message: 'La identidad de Kyloo no es válida' });
    }
  }
}
