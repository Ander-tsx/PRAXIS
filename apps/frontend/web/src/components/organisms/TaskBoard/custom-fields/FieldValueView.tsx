'use client';

import {
  Avatar,
  type CustomField,
  type FieldInput,
  type UserProfile,
  alpha,
  avatarHref,
  colors,
  isEmptyFieldInput,
  personLabel,
} from '@praxis/commons';

/**
 * El valor de un campo, en pequeño y de solo lectura: una celda de la tabla o
 * una píldora de la tarjeta. Editar es cosa de `FieldEditor`.
 *
 * `dense` es la tarjeta: sin nombres de persona, solo caras, y las selecciones
 * múltiples resumidas. En la tabla sobra sitio para decirlo entero.
 */
export function FieldValueView({
  field,
  input,
  usersById,
  dense = false,
  linkAsText = false,
}: {
  field: CustomField;
  input: FieldInput;
  usersById: Map<string, UserProfile>;
  dense?: boolean;
  /**
   * El enlace como texto y no como `<a>`: para pintarlo dentro de algo que ya
   * es un botón —la tarjeta de la lista móvil—, donde un enlace dentro de un
   * botón no es HTML válido.
   */
  linkAsText?: boolean;
}) {
  if (isEmptyFieldInput(input)) {
    return <span className="text-text-disabled">—</span>;
  }

  switch (field.type) {
    case 'TEXT':
      return <span className="truncate">{String(input)}</span>;

    case 'NUMBER':
      return (
        <span className="tabular-nums">
          {Number(input).toLocaleString('es', { maximumFractionDigits: 6 })}
        </span>
      );

    case 'DATE':
      return <span className="tabular-nums">{formatFieldDate(String(input))}</span>;

    case 'CHECKBOX':
      return input ? (
        <span style={{ color: colors.success }} aria-label="Sí">
          ✓
        </span>
      ) : (
        <span className="text-text-secondary">No</span>
      );

    case 'URL':
      if (linkAsText) {
        return <span className="truncate text-info">{shortUrl(String(input))}</span>;
      }
      return (
        <a
          href={String(input)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          /* Que el clic abra el enlace y no la tarea de la fila o la tarjeta. */
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="truncate text-info underline decoration-dotted underline-offset-2 hover:decoration-solid"
          title={String(input)}
        >
          {shortUrl(String(input))}
        </a>
      );

    case 'SELECT': {
      const option = field.options.find((o) => o.id === input);
      return option ? <OptionPill name={option.name} color={colors[option.color]} /> : null;
    }

    case 'MULTI_SELECT': {
      const chosen = field.options.filter((o) => (input as string[]).includes(o.id));
      const visible = dense ? chosen.slice(0, 2) : chosen;
      return (
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {visible.map((o) => (
            <OptionPill key={o.id} name={o.name} color={colors[o.color]} />
          ))}
          {chosen.length > visible.length && (
            <span className="text-text-secondary">+{chosen.length - visible.length}</span>
          )}
        </span>
      );
    }

    case 'PERSON': {
      const people = (input as string[]).map((id) => ({ id, user: usersById.get(id) }));
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex shrink-0 -space-x-1">
            {people.slice(0, 4).map(({ id, user }) => (
              <Avatar
                key={id}
                size="sm"
                ring
                label={user ? personLabel(user) : 'Persona fuera del proyecto'}
                title={user ? personLabel(user) : undefined}
                src={avatarHref(user?.avatarUrl, '/api/gateway')}
              />
            ))}
          </span>
          {!dense && (
            <span className="truncate">
              {people
                .map(({ user }) => (user ? personLabel(user) : 'Alguien que ya no está'))
                .join(', ')}
            </span>
          )}
        </span>
      );
    }
  }
}

/** Una opción de selección: el mismo tinte que una etiqueta, para que se lea igual. */
export function OptionPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-block max-w-full truncate rounded px-1.5 py-0.5 font-sans text-[11px] font-medium"
      style={{ background: alpha(color, 18), color }}
    >
      {name}
    </span>
  );
}

/** `yyyy-mm-dd` → «7 oct 2026». Sin pasar por `Date` local, que cambiaría el día. */
export function formatFieldDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  const months = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

/** Sin protocolo ni `www.`: lo que sobra en una celda estrecha. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}
