import {
  Activity,
  Anchor,
  Beaker,
  Bird,
  BookOpen,
  Boxes,
  Briefcase,
  Brush,
  Building2,
  Calendar,
  Camera,
  ClipboardList,
  Cloud,
  Code,
  Compass,
  Component,
  Cpu,
  Crown,
  Database,
  Feather,
  Film,
  Flag,
  Flame,
  FlaskConical,
  FolderKanban,
  Gem,
  GitBranch,
  Globe,
  GraduationCap,
  Layers,
  LayoutGrid,
  Leaf,
  Lightbulb,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Microscope,
  Moon,
  Mountain,
  Music,
  Package,
  Palette,
  PenTool,
  Puzzle,
  Rocket,
  Send,
  Server,
  Shapes,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Target,
  Terminal,
  TreePine,
  TrendingUp,
  Trophy,
  Waves,
  Zap,
} from 'lucide-react';

/**
 * La lista **curada** de iconos que se pueden elegir para un proyecto o una
 * organización, en su modal de configuración.
 *
 * ## Por qué es una lista a mano y no «todos los de lucide»
 *
 * `lucide-react` trae más de mil. La mayoría no dicen nada como identidad de un
 * equipo —hay tres tipos de enchufe y catorce flechas— y varios chocarían con
 * la iconografía que el producto ya usa para significar algo (la campana de
 * Avisos, la lupa de buscar, el engranaje de ajustes). Aquí van los que sirven
 * de «cara»: objetos reconocibles de un vistazo en una rejilla.
 *
 * ## El contrato con el backend
 *
 * Lo que se guarda es la **`key`** (kebab-case), no el componente. El backend
 * (`Organization.iconKey`, `Project.iconKey`) solo valida la forma del string;
 * esta lista es la única fuente de qué keys son válidas. Una `key` que ya no
 * esté aquí —porque se retiró un icono— resuelve a `undefined` en
 * `glyphByKey`, y quien pinta cae al monograma de letras. No revienta.
 *
 * ⚠️ **No renombrar una `key` a la ligera.** Es un valor persistido: cambiar
 * `rocket` por `cohete` deja a cada proyecto que lo eligió sin icono. Añadir
 * está siempre bien; quitar y renombrar degradan datos que ya existen.
 */
export interface GlyphDef {
  key: string;
  /** Cómo se anuncia al lector de pantalla y en el `title` del ratón. */
  label: string;
  Icon: LucideIcon;
}

export const GLYPHS: readonly GlyphDef[] = [
  // Impulso
  { key: 'rocket', label: 'Cohete', Icon: Rocket },
  { key: 'sparkles', label: 'Destello', Icon: Sparkles },
  { key: 'zap', label: 'Rayo', Icon: Zap },
  { key: 'flame', label: 'Llama', Icon: Flame },
  { key: 'star', label: 'Estrella', Icon: Star },
  { key: 'trophy', label: 'Trofeo', Icon: Trophy },
  { key: 'target', label: 'Diana', Icon: Target },
  { key: 'flag', label: 'Bandera', Icon: Flag },
  { key: 'crown', label: 'Corona', Icon: Crown },
  { key: 'gem', label: 'Gema', Icon: Gem },
  // Trabajo
  { key: 'briefcase', label: 'Maletín', Icon: Briefcase },
  { key: 'folder-kanban', label: 'Tablero', Icon: FolderKanban },
  { key: 'clipboard-list', label: 'Lista', Icon: ClipboardList },
  { key: 'calendar', label: 'Calendario', Icon: Calendar },
  { key: 'layout-grid', label: 'Rejilla', Icon: LayoutGrid },
  { key: 'layers', label: 'Capas', Icon: Layers },
  { key: 'package', label: 'Paquete', Icon: Package },
  { key: 'boxes', label: 'Cajas', Icon: Boxes },
  { key: 'puzzle', label: 'Pieza', Icon: Puzzle },
  { key: 'component', label: 'Componente', Icon: Component },
  // Código
  { key: 'code', label: 'Código', Icon: Code },
  { key: 'terminal', label: 'Terminal', Icon: Terminal },
  { key: 'git-branch', label: 'Rama', Icon: GitBranch },
  { key: 'database', label: 'Base de datos', Icon: Database },
  { key: 'server', label: 'Servidor', Icon: Server },
  { key: 'cloud', label: 'Nube', Icon: Cloud },
  { key: 'cpu', label: 'Procesador', Icon: Cpu },
  // Diseño
  { key: 'pen-tool', label: 'Pluma', Icon: PenTool },
  { key: 'palette', label: 'Paleta', Icon: Palette },
  { key: 'brush', label: 'Pincel', Icon: Brush },
  { key: 'feather', label: 'Pluma ligera', Icon: Feather },
  { key: 'shapes', label: 'Formas', Icon: Shapes },
  { key: 'camera', label: 'Cámara', Icon: Camera },
  { key: 'film', label: 'Película', Icon: Film },
  { key: 'music', label: 'Música', Icon: Music },
  // Ideas y ciencia
  { key: 'lightbulb', label: 'Idea', Icon: Lightbulb },
  { key: 'compass', label: 'Brújula', Icon: Compass },
  { key: 'beaker', label: 'Vaso', Icon: Beaker },
  { key: 'flask-conical', label: 'Matraz', Icon: FlaskConical },
  { key: 'microscope', label: 'Microscopio', Icon: Microscope },
  { key: 'book-open', label: 'Libro', Icon: BookOpen },
  { key: 'graduation-cap', label: 'Birrete', Icon: GraduationCap },
  // Comunicación y crecimiento
  { key: 'message-circle', label: 'Mensaje', Icon: MessageCircle },
  { key: 'send', label: 'Enviar', Icon: Send },
  { key: 'megaphone', label: 'Megáfono', Icon: Megaphone },
  { key: 'trending-up', label: 'Tendencia', Icon: TrendingUp },
  { key: 'activity', label: 'Actividad', Icon: Activity },
  { key: 'globe', label: 'Globo', Icon: Globe },
  { key: 'building', label: 'Edificio', Icon: Building2 },
  // Naturaleza
  { key: 'leaf', label: 'Hoja', Icon: Leaf },
  { key: 'sprout', label: 'Brote', Icon: Sprout },
  { key: 'tree-pine', label: 'Pino', Icon: TreePine },
  { key: 'mountain', label: 'Montaña', Icon: Mountain },
  { key: 'anchor', label: 'Ancla', Icon: Anchor },
  { key: 'waves', label: 'Olas', Icon: Waves },
  { key: 'sun', label: 'Sol', Icon: Sun },
  { key: 'moon', label: 'Luna', Icon: Moon },
  { key: 'bird', label: 'Pájaro', Icon: Bird },
] as const;

const POR_KEY: ReadonlyMap<string, GlyphDef> = new Map(GLYPHS.map((g) => [g.key, g]));

/** El icono de una `key`, o `undefined` si no está en la lista curada. */
export function glyphByKey(key: string | null | undefined): GlyphDef | undefined {
  if (!key) return undefined;
  return POR_KEY.get(key);
}

/**
 * Los colores de acento que ofrece el selector.
 *
 * Son los seis de `serieColors` —revisados para daltonismo, mismos
 * hexadecimales en los dos temas: ver el bloque en `theme.css`— más el morado
 * de marca y un rosa, que amplían la paleta sin acercarse a ninguno de los seis.
 * Se guarda el `#rrggbb` literal, no la variable CSS: el backend persiste el
 * valor.
 */
export const GLYPH_COLORS: readonly string[] = [
  '#4a90d9',
  '#c07f22',
  '#0f9b76',
  '#a05fc4',
  '#c8543c',
  '#1b9ea6',
  '#6c63ff',
  '#d1477a',
] as const;

export const GLYPH_COLOR_DEFAULT = GLYPH_COLORS[6];
