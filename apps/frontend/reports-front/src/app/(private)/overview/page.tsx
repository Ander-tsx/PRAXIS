import { PortfolioTable } from '@/components/organisms/PortfolioTable';
import type { PortfolioRow } from '@/lib/reports';
import { AppHeader } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Cartera' };

/**
 * La cartera: todos tus proyectos en una tabla.
 *
 * ## ⚠️ La URL dice `overview` y la pantalla dice «Cartera»
 *
 * No es un descuido: es la convención del repo —URL en inglés, pantalla en
 * español— y ya se aplicó igual en «Tu cuenta», que vive en `/profile` (§37).
 *
 * Y `overview` en vez de `portfolio`, que sería la traducción directa:
 * «portfolio» arrastra el sentido financiero —una cartera de inversión— y en una
 * herramienta que también habla de facturación eso es una pista falsa. Lo que
 * hace esta pantalla es dar una vista general de lo que llevas, y eso es lo que
 * dice `overview`. El tipo del backend sigue llamándose `ReportPortfolioRow`
 * porque allí no hay ambigüedad posible.
 *
 * ## Para qué existe
 *
 * Quien lleva cinco proyectos tenía que entrar a los cinco para saber en cuál
 * arde algo. Esta pantalla contesta esa pregunta y **solo** esa: no es un
 * resumen de cada proyecto —para eso está su pantalla— sino las señales que
 * hacen entrar. Todo lo que no responda a «¿tengo que mirar este hoy?» se queda
 * fuera aunque sea barato de calcular, porque una tabla de quince columnas no se
 * lee de un vistazo y esto existe para leerse de un vistazo.
 *
 * ## Una petición, no una por proyecto
 *
 * `GET /me/reports/portfolio` agrega en el servidor: el gateway resuelve los
 * proyectos con `canViewReports` y tasks-service los cuenta **todos en dos
 * consultas agrupadas**, cuesten uno o cincuenta. Pedir el informe de cada
 * proyecto desde aquí habrían sido N peticiones, N resoluciones de permisos y N
 * travesías del proxy — el mismo cálculo que llevó a agrupar los siete informes
 * en R4.2, multiplicado por cuántos proyectos lleve cada cual.
 *
 * ## ⚠️ Esta ruta puede chocar con el slug de un proyecto
 *
 * `/reports/overview` es una ruta estática hermana de `[[...id]]`, que es la que
 * resuelve `/reports/<slug>`. Next da prioridad a la estática, así que un
 * proyecto cuyo slug fuera exactamente `overview` **quedaría oculto**: su enlace
 * abriría esta tabla. Los slugs son únicos globales y nada los reserva.
 *
 * Se acepta porque es el patrón que ya usa `projects-front` con `tablero` y
 * `tarea`, y cambiarlo aquí solo movería el problema de palabra. El arreglo de
 * verdad es una lista de slugs reservados en projects-service, y está anotado en
 * PENDIENTES-BACKEND.
 */
export default async function CarteraPage() {
  const api = createServerApiClient();

  /**
   * ⚠️ **No se atrapa el fallo, y es a propósito.**
   *
   * Una tabla vacía aquí se lee como «no tienes ningún proyecto con análisis
   * abierto», que con el gateway caído es una afirmación falsa y manda a pedir
   * un permiso que ya se tiene. Que lance y lo recoja `error.tsx`, que dice que
   * fue un corte y ofrece reintentar. Mismo criterio que la puerta de Análisis.
   */
  const filas = await api.get<PortfolioRow[]>('/me/reports/portfolio');

  return (
    <AppHeader title="Cartera">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-3xl text-text-primary">Todos tus proyectos</h2>
          <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
            Lo que pide entrar, primero. Toca un proyecto para ver su análisis entero.
          </p>
          {/* Dentro de la zona, así que `next/link` y sin el `/reports` delante:
              lo añade Next (invariante 5). */}
          <Link
            href="/"
            className="font-sans text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            ← Volver al análisis de un proyecto
          </Link>
        </div>

        {filas.length === 0 ? (
          /* Dos motivos distintos y no se pueden distinguir desde aquí: no estar
             en ningún proyecto, o estar sin `canViewReports`. Se dice el segundo
             porque el primero se resuelve solo al entrar en uno. */
          <p className="font-sans text-sm text-text-secondary">
            No tienes ningún proyecto con el análisis abierto. Pídeselo a quien administre el
            proyecto.
          </p>
        ) : (
          <PortfolioTable filas={filas} />
        )}
      </div>
    </AppHeader>
  );
}
