import type { AgentKind } from '../../api/domain';
import { Avatar, type AvatarSize } from '../Avatar';

/** Cómo se llama cada agente en pantalla. */
export const AGENT_LABELS: Record<AgentKind, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  ai: 'un agente de IA',
};

/** Los iconos ya están en `public/integrations` (los de Integraciones). */
const AGENT_IMAGES: Record<AgentKind, string | null> = {
  claude: '/integrations/claude.png',
  chatgpt: '/integrations/chatgpt.png',
  ai: null,
};

const SIZES = {
  xs: { box: 'h-5 w-5', glyph: 11 },
  sm: { box: 'h-6 w-6', glyph: 13 },
} as const;

export interface AgentAvatarProps {
  kind: AgentKind;
  size?: keyof typeof SIZES;
  /** Anillo del color del fondo, para solaparse con otra cara sin fundirse. */
  ring?: boolean;
  title?: string;
}

/**
 * El icono circular, tipo foto, de un agente de IA (Claude, ChatGPT…).
 *
 * Es la contraparte de `Avatar`: misma forma y mismos tamaños, para que las dos
 * caras se puedan poner juntas (`AuthorFaces`). Un agente sin icono propio
 * (Cursor, un nombre libre) lleva el destello genérico.
 */
export function AgentAvatar({ kind, size = 'sm', ring = false, title }: AgentAvatarProps) {
  const imagen = AGENT_IMAGES[kind];
  const { box, glyph } = SIZES[size];
  return (
    <span
      title={title ?? AGENT_LABELS[kind]}
      className={[
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3',
        box,
        ring ? 'ring-2 ring-background' : '',
      ].join(' ')}
    >
      {imagen ? (
        <img src={imagen} alt="" aria-hidden="true" className="h-full w-full object-cover" />
      ) : (
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-text-secondary"
          aria-hidden="true"
        >
          <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
        </svg>
      )}
    </span>
  );
}

export interface AuthorFacesProps {
  /** Nombre de la persona, de donde salen las iniciales si no hay foto. */
  label: string;
  src?: string | null;
  mine?: boolean;
  /** Si lo hizo un agente por el MCP, su cara va pegada a la de la persona. */
  via?: AgentKind | null;
  size?: Extract<AvatarSize, 'xs' | 'sm'>;
  /** «Marcado por», «Escrita por»…: el tooltip dice quién y con qué. */
  verb?: string;
}

/**
 * La cara de quien hizo algo: la persona sola, o **la persona + el agente** que
 * actuó a su nombre, solapados.
 */
export function AuthorFaces({ label, src, mine, via, size = 'sm', verb }: AuthorFacesProps) {
  const title = via
    ? `${verb ? `${verb} ` : ''}${label}, con ${AGENT_LABELS[via]}`
    : verb
      ? `${verb} ${label}`
      : label;
  return (
    <span className="inline-flex shrink-0 items-center" title={title}>
      {/* La persona va **encima** del agente: así sus iniciales no quedan tapadas por el
          icono, que es lo que se perdía al solaparlos al revés. */}
      <span className="relative z-10 inline-flex">
        <Avatar label={label} src={src} mine={mine} size={size} ring={!!via} title={title} />
      </span>
      {via && (
        <span className={size === 'xs' ? '-ml-1' : '-ml-1.5'}>
          <AgentAvatar kind={via} size={size} ring title={title} />
        </span>
      )}
    </span>
  );
}
