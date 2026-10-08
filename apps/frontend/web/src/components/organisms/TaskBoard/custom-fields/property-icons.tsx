import type { CustomFieldType } from '@praxis/commons';

/**
 * Los iconos de las filas de propiedades del panel de tarea.
 *
 * Son lo que da a la columna de nombres algo que barrer con la vista: sin
 * ellos, «Prioridad», «Fecha límite» y «Reviewer» eran tres palabras grises
 * iguales una debajo de otra. Trazo fino, del color del texto secundario: guían,
 * no compiten con el valor.
 */
function Icon({ d, children }: { d?: string; children?: React.ReactNode }) {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const PriorityIcon = () => <Icon d="M5 21V4m0 0h11l-2 4 2 4H5" />;
export const CalendarIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);
export const EstimateIcon = () => (
  <Icon>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 18l4-5" />
  </Icon>
);
export const PeopleIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5M16 5a3 3 0 0 1 0 6M18 14c1.7.6 2.8 2.2 3 5" />
  </Icon>
);
export const TagIcon = () => (
  <Icon>
    <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8z" />
    <circle cx="8" cy="8" r="1.4" />
  </Icon>
);

const TextIcon = () => <Icon d="M5 6h14M12 6v13M9 19h6" />;
const NumberIcon = () => <Icon d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />;
const SelectIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
const MultiSelectIcon = () => <Icon d="M4 7l2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8" />;
const PersonIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6" />
  </Icon>
);
const CheckboxIcon = () => (
  <Icon>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Icon>
);
const LinkIcon = () => (
  <Icon d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
);

/** El icono de cada tipo de campo personalizado. */
export function FieldTypeIcon({ type }: { type: CustomFieldType }) {
  switch (type) {
    case 'TEXT':
      return <TextIcon />;
    case 'NUMBER':
      return <NumberIcon />;
    case 'DATE':
      return <CalendarIcon />;
    case 'SELECT':
      return <SelectIcon />;
    case 'MULTI_SELECT':
      return <MultiSelectIcon />;
    case 'PERSON':
      return <PersonIcon />;
    case 'CHECKBOX':
      return <CheckboxIcon />;
    case 'URL':
      return <LinkIcon />;
  }
}
