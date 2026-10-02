import { projectHref } from '@praxis/commons';
import Link from 'next/link';

export interface ProjectSettingsButtonProps {
  project: { slug: string };
  canEdit: boolean;
  canDelete: boolean;
  /** Estás en la pestaña de ajustes. */
  activo?: boolean;
  compacto?: boolean;
}

/**
 * El engranaje de la cabecera. **Ya no abre un modal**: lleva a la pestaña
 * `?tab=ajustes` del proyecto, donde viven la identidad y la zona de peligro.
 */
export function ProjectSettingsButton({
  project,
  canEdit,
  canDelete,
  activo = false,
  compacto = false,
}: ProjectSettingsButtonProps) {
  if (!canEdit && !canDelete) return null;

  return (
    <Link
      href={projectHref(project, { tab: 'ajustes' })}
      title="Ajustes del proyecto"
      aria-label="Ajustes del proyecto"
      aria-current={activo ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg font-sans text-sm transition-colors hover:bg-white/10 hover:text-white ${
        activo ? 'bg-white/10 text-white' : 'text-text-primary'
      } ${compacto ? 'h-7 w-7 justify-center' : 'px-3 py-1.5'}`}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {!compacto && 'Ajustes'}
    </Link>
  );
}
