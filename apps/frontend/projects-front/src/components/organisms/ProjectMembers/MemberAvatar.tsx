'use client';

import { Avatar, usePresence } from '@praxis/commons';

export interface MemberAvatarProps {
  userId: string;
  label: string;
  /** Marca el círculo como propio: el rojo dice «eres tú» en todo el producto. */
  mine: boolean;
  src: string | null;
  /** La que trajo el perfil en el último render del servidor. */
  presence: string | null;
}

/**
 * El avatar de un miembro del equipo, con su esfera de estado **en vivo**.
 *
 * ## Por qué existe este archivo
 *
 * `ProjectMembers` es un componente de servidor, así que su esfera se quedaba
 * congelada con lo que trajo la última carga: alguien se ponía «No molestar» y
 * en la pestaña Equipo seguía en verde hasta recargar. Era la única superficie
 * con esferas que no escuchaba el flujo —el chat y la lista de conversaciones ya
 * lo hacían—, y esa incoherencia se nota: el mismo estado, dos respuestas
 * distintas según la pantalla.
 *
 * Se resuelve con la envoltura más pequeña posible en vez de convirtiendo la
 * pestaña entera en cliente: lo único que necesita reaccionar es el punto de
 * color, y `ProjectMembers` tiene dentro diálogos, desplegables y acciones de
 * servidor que no ganan nada bajando al navegador.
 *
 * ⚠️ **`presence` sigue haciendo falta aunque haya flujo.** Es lo que se pinta
 * en el primer render y mientras no llegue ningún evento para esa persona: sin
 * ella, todo el equipo aparecería sin estado hasta que alguien lo cambiara.
 */
export function MemberAvatar({ userId, label, mine, src, presence }: MemberAvatarProps) {
  return (
    <Avatar
      label={label}
      mine={mine}
      size="md"
      src={src}
      presence={usePresence(userId, presence)}
    />
  );
}
