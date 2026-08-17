/**
 * ⚠️ **Página provisional del andamiaje (E3.1).** La sustituye E3.3, que trae
 * aquí el directorio de conversaciones desde
 * `dashboard-front/src/app/(private)/chat/page.tsx`.
 *
 * Existe porque una zona sin ninguna ruta no arranca, y sin arrancar no se
 * puede comprobar lo único que E3.1 tiene que dejar demostrado: que el guard
 * protege la raíz, que el rewrite del shell llega, y que los estilos y las
 * fuentes resuelven con el basePath correcto.
 */
export default function MensajesProvisional() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="font-display text-3xl text-text-primary">Mensajes</h1>
        <p className="font-sans text-sm text-text-secondary">
          Zona en construcción: las pantallas llegan en E3.3.
        </p>
      </div>
    </main>
  );
}
