'use client';

import { createProjectAction } from '@/app/actions';
import { FloatingLabelInput, FloatingLabelTextarea, usePrax } from '@praxis/commons';
import { useCallback, useEffect, useState } from 'react';

interface PraxCreateProjectTriggerProps {
  triggerVariant?: 'boton' | 'tarjeta';
  /**
   * En qué organización se crea. Es la **activa**, resuelta en el servidor
   * (`loadPrivateChrome` → `resolverOrganizacionActiva`), no la cookie en crudo.
   *
   * ⚠️ Sin esto el proyecto caía SIEMPRE en tu organización personal —`POST
   * /projects` sin `organizationId` usa la personal— aunque el selector
   * estuviera en otra: se creaba donde no lo ibas a ver, y su cuota de 3
   * (plan FREE) daba un «ya tienes 3» sobre una organización distinta de la que
   * mirabas. El gateway valida la pertenencia y `canCreateProject` antes de
   * contar, así que mandarlo en el cuerpo es la vía correcta.
   */
  organizationId?: string | null;
}

export function PraxCreateProjectTrigger({
  triggerVariant = 'boton',
  organizationId,
}: PraxCreateProjectTriggerProps) {
  const prax = usePrax();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cierra con ESC
  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setModalOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen]);

  const onPraxClick = useCallback(() => {
    setModalOpen(false);
    if (window.innerWidth < 768 || !prax) {
      window.location.assign('/assistant');
      return;
    }
    /* Abre PRAX (en el modo que tenga) y deja la frase puesta, sin enviarla.
       Antes iba por `dock.abrir()` + un `CustomEvent`, y se rompió al pasar
       PRAX al armazón: el cajón se abría vacío. Ahora es una llamada directa. */
    prax.sugerir('Necesito ayuda en la creación de un proyecto, se trata de ');
  }, [prax]);

  async function handleManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res = await createProjectAction(
      { error: null, createdName: null, cuota: null },
      formData,
    );
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else if (res.createdName) {
      setModalOpen(false);
    }
  }

  const Modal = () => {
    if (!modalOpen) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setModalOpen(false);
        }}
      >
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0b] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-sm font-semibold text-white/90">Nuevo Proyecto</h2>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg p-1 text-white/70 hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form
            onSubmit={handleManualSubmit}
            autoComplete="off"
            className="p-5 flex flex-col gap-6"
          >
            {/* La organización activa: el proyecto se crea aquí, no en la personal. */}
            {organizationId && <input type="hidden" name="organizationId" value={organizationId} />}
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            <FloatingLabelInput
              id="name"
              name="name"
              label="Nombre del proyecto"
              required
              maxLength={50}
              autoComplete="off"
              autoFocus
            />

            <FloatingLabelTextarea
              id="description"
              name="description"
              label="Descripción (Opcional)"
              rows={3}
              maxLength={200}
              autoComplete="off"
            />

            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={onPraxClick}
                className="group flex items-center gap-1.5 text-xs font-medium text-primary transition-opacity hover:opacity-80"
              >
                <svg
                  className="h-4 w-4 transition-transform group-hover:scale-110"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                  />
                </svg>
                Crear con PRAX
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-white/75 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-white px-4 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Creando...' : 'Crear proyecto'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (triggerVariant === 'tarjeta') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="group relative flex h-full min-h-[184px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-white/[0.15] bg-transparent p-5 transition-all hover:border-white/30 hover:bg-white/[0.04]"
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/70 transition-colors group-hover:bg-white/[0.08] group-hover:text-white"
            aria-hidden="true"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </span>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="font-sans text-sm font-medium text-white/80 group-hover:text-white/90 transition-colors">
              Nuevo Proyecto
            </span>
          </div>
        </button>
        <Modal />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3.5 text-sm font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Nuevo proyecto
      </button>
      <Modal />
    </>
  );
}
