/**
 * Organismos compartidos.
 *
 * Un organismo sube aquí cuando lo consumen ≥2 zonas. El armazón del área
 * privada cumple por construcción: en multi-zones cada zona es una app Next
 * independiente y renderiza el suyo, así que todas lo necesitan.
 */

export * from './AppLayout';
export * from './AssistantChat';
export * from './LiveNotices';
export * from './ChatPanel';
export * from './CreateProjectSlideOver';
export * from './LogoutButton';
export * from './NotFound';
export * from './ProjectCard';
