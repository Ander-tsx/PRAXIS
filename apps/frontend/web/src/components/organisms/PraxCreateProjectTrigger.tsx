'use client';

import { createProjectAction } from '@/app/(privado)/projects/root-actions';
import {
  FloatingLabelInput,
  FloatingLabelTextarea,
  GLYPH_COLOR_DEFAULT,
  Glyph,
  GlyphPicker,
  type GlyphSelection,
  ImagePicker,
  glyphByKey,
  usePrax,
  useSidebarPlegada,
} from '@praxis/commons';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PraxCreateProjectTriggerProps {
  triggerVariant?: 'boton' | 'tarjeta' | 'fila' | 'icono';
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
  const plegada = useSidebarPlegada();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Identidad opcional: icono y color, y una imagen que gana al icono. Todo se
     manda con el formulario y se aplica justo después de crear el proyecto. */
  const [seleccion, setSeleccion] = useState<GlyphSelection>({
    iconKey: null,
    color: GLYPH_COLOR_DEFAULT,
  });
  const [imagen, setImagen] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);

  useEffect(() => {
    if (!imagen) return setVista(null);
    const url = URL.createObjectURL(imagen);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [imagen]);

  /* El panel entra y sale deslizándose: `montado` es si existe en el árbol y
     `dentro` si está en su sitio. Al abrir se monta y **un instante después**
     se pone dentro (si no, nace ya en destino y no hay transición); al cerrar se
     saca primero y se desmonta cuando termina — espejo de `duration-300`. */
  const [montado, setMontado] = useState(false);
  const [dentro, setDentro] = useState(false);
  useEffect(() => {
    if (modalOpen) {
      setMontado(true);
      /* `setTimeout` y no `requestAnimationFrame`: en una pestaña en segundo plano los
         fotogramas se pausan y el panel se quedaba montado pero fuera de pantalla. */
      const t = window.setTimeout(() => setDentro(true), 30);
      return () => window.clearTimeout(t);
    }
    setDentro(false);
    const t = window.setTimeout(() => setMontado(false), 300);
    return () => window.clearTimeout(t);
  }, [modalOpen]);

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
    if (seleccion.iconKey) {
      formData.set('iconKey', seleccion.iconKey);
      formData.set('color', seleccion.color ?? GLYPH_COLOR_DEFAULT);
    }
    if (imagen) formData.set('image', imagen);
    const res = await createProjectAction(
      { error: null, createdName: null, cuota: null },
      formData,
    );
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else if (res.createdName) {
      setModalOpen(false);
      setSeleccion({ iconKey: null, color: GLYPH_COLOR_DEFAULT });
      setImagen(null);
    }
  }

  /* Una función que se **llama**, no un componente (`<Modal />`): como componente
     definido aquí dentro se remontaba en cada render y vaciaba lo escrito al
     elegir un icono o al salir un error. */
  const renderModal = () => {
    if (!montado) return null;
    /* Por portal: dentro del cajón móvil —que se mueve con `transform`— un `fixed`
       queda atrapado en el cajón en vez de cubrir la pantalla. */
    return createPortal(
      <div
        className={`fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none ${
          dentro ? 'opacity-100' : 'opacity-0'
        }`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setModalOpen(false);
        }}
      >
        <div
          role="dialog"
          aria-label="Nuevo proyecto"
          className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-white/[0.08] bg-[#0c0c0b] shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            dentro ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold text-white">Nuevo proyecto</h2>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg p-1 text-white hover:bg-white/[0.04] hover:text-white transition-colors"
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

            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-white">Imagen e icono (opcional)</span>
              <div className="flex items-center gap-4">
                {vista ? (
                  <span
                    role="img"
                    aria-label="Vista previa"
                    className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-cover bg-center"
                    style={{ backgroundImage: `url(${vista})` }}
                  />
                ) : glyphByKey(seleccion.iconKey) ? (
                  <Glyph
                    iconKey={seleccion.iconKey}
                    color={seleccion.color}
                    size="md"
                    shape="square"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base font-semibold text-white"
                  >
                    P
                  </span>
                )}
                <ImagePicker
                  tieneImagen={imagen !== null}
                  onUpload={async (file) => {
                    setImagen(file);
                    return null;
                  }}
                  onRemove={async () => {
                    setImagen(null);
                    return null;
                  }}
                  disabled={loading}
                />
              </div>
              <GlyphPicker value={seleccion} onChange={setSeleccion} disabled={loading} />
            </div>

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
                  className="rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white/[0.04] hover:text-white"
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
      </div>,
      document.body,
    );
  };

  /* Un «+» pequeño para el encabezado de «Proyectos» de la barra lateral. */
  if (triggerVariant === 'icono') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          title="Nuevo proyecto"
          aria-label="Nuevo proyecto"
          className="rounded p-0.5 text-text-secondary/50 transition-colors hover:text-white"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        {renderModal()}
      </>
    );
  }

  /* La fila del menú lateral: mismo aspecto que las entradas de `NavList`. */
  if (triggerVariant === 'fila') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          title={plegada ? 'Nuevo proyecto' : undefined}
          className={`flex w-full items-center rounded-full font-sans text-[13px] font-medium text-white transition-colors duration-150 hover:bg-white/5 ${
            plegada ? 'justify-center px-0 py-2.5' : 'gap-3 px-4 py-2.5 text-left'
          }`}
        >
          <svg
            className="h-5 w-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className={plegada ? 'sr-only' : undefined}>Nuevo proyecto</span>
        </button>
        {renderModal()}
      </>
    );
  }

  if (triggerVariant === 'tarjeta') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="group relative flex h-full min-h-[184px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-white/[0.15] bg-transparent p-5 transition-all hover:border-white/30 hover:bg-white/[0.04]"
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white transition-colors group-hover:bg-white/[0.08] group-hover:text-white"
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
            <span className="font-sans text-sm font-medium text-white group-hover:text-white transition-colors">
              Nuevo Proyecto
            </span>
          </div>
        </button>
        {renderModal()}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3.5 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
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
      {renderModal()}
    </>
  );
}
