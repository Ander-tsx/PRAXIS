import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma-client';

/**
 * Cuántas conexiones a Postgres abre **este** servicio.
 *
 * ## Por qué hay que decirlo, y por qué es un número pequeño
 *
 * `PrismaPg` envuelve un `pg.Pool`, y el `max` por defecto de `pg-pool` es
 * **10**. Nadie lo tocaba, así que cada uno de los seis servicios con Prisma
 * abría hasta diez conexiones: **sesenta por instancia del backend**. El grupo
 * escala hasta tres instancias, o sea hasta **ciento ochenta**.
 *
 * Al otro lado hay un Cloud SQL `db-f1-micro`, cuyo `max_connections` por
 * defecto es **25**, y de esas unas cuantas quedan reservadas para el
 * superusuario.
 *
 * Pasado ese techo, Postgres empieza a rechazar con «remaining connection slots
 * are reserved» y el pool de Prisma encola las consultas hasta agotar su propio
 * tiempo de espera. En la pantalla eso **no se ve como un error de base de
 * datos**: se ve como peticiones que tardan una eternidad, botones que se
 * quedan girando y conexiones que «se pierden». Es exactamente el síntoma de
 * «la aplicación se siente pesada y se traba».
 *
 * Cinco por servicio son treinta por instancia y noventa con el grupo al máximo
 * — todavía por encima de 25, así que `sql.tf` sube `max_connections` a 150. Las
 * dos mitades hacen falta: sin el tope de aquí, subir el límite de la base solo
 * retrasa el problema; sin el límite de allí, el tope de aquí no da margen para
 * escalar.
 *
 * Las consultas de este sistema son cortas —ninguna pantalla hace analítica— así
 * que cinco conexiones simultáneas por servicio dan de sobra: el cuello no es la
 * concurrencia, es tener conexiones abiertas sin usar.
 */
const POOL_MAX_POR_DEFECTO = 5;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      /* En el monolito todos los servicios comparten `process.env`, y un solo
         `DATABASE_URL` los mandaría a todos al mismo schema. Ver
         docs/PLAN-MONOLITO.md, M4. */
      connectionString:
        config.get<string>('PROJECTS_DATABASE_URL') ?? config.getOrThrow<string>('DATABASE_URL'),
      max: Number(config.get<string>('DATABASE_POOL_MAX') ?? POOL_MAX_POR_DEFECTO),
      /**
       * Una conexión que lleva 30 s sin usarse se devuelve.
       *
       * Sin esto, el pico de un momento deja el pool lleno **para siempre**: `pg`
       * no cierra las conexiones ociosas por su cuenta, así que una ráfaga de las
       * nueve de la mañana se quedaba ocupando plazas hasta reiniciar el proceso.
       */
      idleTimeoutMillis: 30_000,
      /**
       * Y si no hay ninguna libre, se espera 10 s y se falla.
       *
       * El valor por defecto de `pg` es **esperar indefinidamente**, que es lo
       * peor de los dos mundos: la petición no falla, se queda colgada, y con
       * ella el navegador que la pidió. Un error a los diez segundos es
       * recuperable —se reintenta, se avisa—; una espera infinita no.
       */
      connectionTimeoutMillis: 10_000,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
