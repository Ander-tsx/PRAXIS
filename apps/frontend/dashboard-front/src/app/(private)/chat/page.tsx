/**
 * Chat sin conversación elegida.
 *
 * No redirige a la primera de la lista **a propósito**: con la lista vacía no
 * habría a dónde redirigir, y con ella llena abrir una conversación que nadie
 * pidió marca sus mensajes como leídos sin que nadie los haya visto.
 */
export default function ChatVacioPage() {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8">
      <p className="max-w-sm text-center font-sans text-sm text-text-secondary">
        Elige a alguien de la izquierda para empezar a hablar. Aquí sale quien comparte algún
        proyecto contigo.
      </p>
    </div>
  );
}
