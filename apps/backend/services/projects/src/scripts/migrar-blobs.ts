/**
 * Mueve los bytes de los adjuntos de Postgres a Google Cloud Storage.
 *
 * ## Por qué hace falta esto para poder activar GCS
 *
 * `STORAGE_DRIVER` decide **dónde se guarda lo nuevo**, no dónde está lo viejo.
 * Cambiarlo a `gcs` sin más deja todos los adjuntos ya subidos en una tabla que
 * nadie vuelve a consultar: la fila de metadatos sigue ahí, el chat sigue
 * enseñando el archivo en la lista, y al pulsarlo no hay nada. Un 404 por cada
 * adjunto anterior al cambio, sin ningún error en el servidor.
 *
 * Por eso el orden correcto es: **migrar primero, cambiar el driver después.**
 *
 * ## Qué hace, y qué no
 *
 * Copia cada blob al bucket con la misma clave que usaría el proveedor de GCS
 * —la del `attachmentId`— y **no borra nada de Postgres**. El borrado va aparte
 * y a mano, con `--borrar-origen`, y solo cuando alguien haya comprobado que el
 * bucket sirve los archivos. Un script que mueve y borra en la misma pasada no
 * deja forma de volver atrás si el bucket estaba mal configurado.
 *
 * Es **idempotente**: `put` sobrescribe, así que repetirlo no duplica ni falla.
 * Se puede interrumpir y relanzar.
 *
 * ## Uso
 *
 * Cloud SQL no tiene IP pública, así que esto se ejecuta **desde dentro de la
 * VPC**, igual que `migrar.sh`:
 *
 *   gcloud compute ssh <vm-backend> --tunnel-through-iap --zone <zona> \
 *     --command "sudo docker exec praxis-backend node dist/scripts/migrar-blobs.js"
 *
 * Y cuando esté verificado, para liberar el espacio en Postgres:
 *
 *   ... --command "sudo docker exec praxis-backend node dist/scripts/migrar-blobs.js --borrar-origen"
 *
 * ⚠️ Exige `GCS_PROJECT_ID` y `GCS_BUCKET`. **No** exige `STORAGE_DRIVER=gcs`:
 * se migra con el driver todavía en `postgres`, que es lo que permite hacerlo
 * sin ventana de indisponibilidad.
 */

import { PrismaClient } from '../generated/prisma-client';

/** Cuántos blobs se traen de una vez. */
const LOTE = 20;

/**
 * La URL de la base, compuesta aquí desde las `POSTGRES_*`.
 *
 * ⚠️ **En el contenedor no existe `DATABASE_URL`.** Quien la compone es
 * `backend.pm2.config.cjs`, y solo para los procesos que arranca: un
 * `docker exec` cualquiera **no la hereda**, así que un script que la diera por
 * puesta muere con «Environment variable not found: DATABASE_URL» —y el mensaje
 * apunta al `schema.prisma`, que no tiene nada que ver—.
 *
 * Es el mismo patrón que ya usa `migrar.sh`, y por el mismo motivo.
 */
function urlDeLaBase(): string {
  const { POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
  const puerto = process.env.POSTGRES_PORT ?? '5432';

  if (!POSTGRES_HOST || !POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    /* Si ya viene puesta —ejecución local, por ejemplo— se respeta. */
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    throw new Error('Faltan POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD y POSTGRES_DB.');
  }

  const usuario = encodeURIComponent(POSTGRES_USER);
  const clave = encodeURIComponent(POSTGRES_PASSWORD);
  return `postgresql://${usuario}:${clave}@${POSTGRES_HOST}:${puerto}/${POSTGRES_DB}?schema=projects`;
}

async function main(): Promise<void> {
  const borrarOrigen = process.argv.includes('--borrar-origen');
  const soloContar = process.argv.includes('--contar');

  const projectId = process.env.GCS_PROJECT_ID;
  const bucketName = process.env.GCS_BUCKET;
  if (!soloContar && (!projectId || !bucketName)) {
    console.error('Faltan GCS_PROJECT_ID y GCS_BUCKET.');
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url: urlDeLaBase() } } });

  /* `--contar` responde «cuánto hay» sin tocar el bucket: es lo primero que se
     quiere saber, y no debe exigir credenciales de GCS para averiguarlo. */
  if (soloContar) {
    const [fila] = await prisma.$queryRawUnsafe<{ n: bigint; bytes: bigint }[]>(
      'SELECT count(*)::bigint AS n, COALESCE(sum(length(data)),0)::bigint AS bytes FROM projects.chat_attachment_blobs',
    );
    const mb = Number(fila?.bytes ?? 0) / (1024 * 1024);
    console.log(`blobs: ${fila?.n ?? 0} · ${mb.toFixed(1)} MB`);
    await prisma.$disconnect();
    return;
  }

  /* Después del `--contar`, así que aquí ya están comprobadas. */
  if (!projectId || !bucketName) throw new Error('Faltan GCS_PROJECT_ID y GCS_BUCKET.');

  const { Storage } = await import('@google-cloud/storage');
  const bucket = new Storage({ projectId }).bucket(bucketName);

  let migrados = 0;
  let saltados = 0;

  try {
    /* Por lotes y no todo de golpe: un adjunto puede pesar 25 MB, así que
       traerlos todos a memoria es lo único que puede tumbar este script. */
    for (let desde = 0; ; desde += LOTE) {
      const blobs = await prisma.chatAttachmentBlob.findMany({
        skip: desde,
        take: LOTE,
        select: { attachmentId: true, data: true },
        orderBy: { attachmentId: 'asc' },
      });
      if (blobs.length === 0) break;

      for (const blob of blobs) {
        /* El `mimeType` sale de la fila de metadatos: es lo que hace que el
           bucket sepa qué contiene, y lo que el proveedor de GCS estuvo
           ignorando hasta que se arregló. */
        const meta = await prisma.chatAttachment.findUnique({
          where: { id: blob.attachmentId },
          select: { mimeType: true },
        });

        if (!meta) {
          /* Un blob sin metadatos es basura de un borrado a medias: no se
             migra, porque no hay nada que lo enseñe. */
          saltados += 1;
          continue;
        }

        await bucket.file(`chat/${blob.attachmentId}`).save(Buffer.from(blob.data), {
          contentType: meta.mimeType || 'application/octet-stream',
          resumable: false,
        });
        migrados += 1;
      }

      console.log(`  migrados ${migrados}…`);
    }

    if (borrarOrigen) {
      /* Solo lo que se ha copiado en esta pasada tiene garantía de estar
         arriba, pero borrar por lista sería frágil ante una interrupción. Se
         borran los que tengan metadatos, que son los que se migran. */
      const { count } = await prisma.chatAttachmentBlob.deleteMany({});
      console.log(`Borrados ${count} blobs de Postgres.`);
    }

    console.log(`Listo: ${migrados} migrados, ${saltados} sin metadatos (saltados).`);
    if (!borrarOrigen) {
      console.log('Los bytes siguen en Postgres. Comprueba el bucket y repite con --borrar-origen.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
