import {
  borradorDePlantillaAction,
  crearProyectoDesdePlantillaAction,
  createProjectAction,
} from '@/app/(privado)/projects/root-actions';
import { PraxCreateProjectTrigger } from '@/components/organisms/PraxCreateProjectTrigger';
import {
  AppHeader,
  type Paginated,
  Pagination,
  type Project,
  ProjectMonogram,
  type UserProfile,
  projectHref,
} from '@praxis/commons';
import { createServerApiClient, loadPrivateChrome } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProyectosPageClient } from './ProyectosPageClient';

export const metadata: Metadata = {
  title: 'Proyectos',
};

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; vista?: string }>;
}

const POR_PAGINA = 24;

export default async function ProjectsPage({ searchParams }: PageProps) {
  const { q, page: pageParam, vista } = await searchParams;
  /* El listado va acotado a la organización activa, y no es un permiso: el
     backend ya filtra por «dueño o miembro» y `organizationId` se **suma** a ese
     filtro (I1 de PLAN-ORGANIZACION-ACTIVA). Escribir la organización de otro en
     la cookie devuelve cero proyectos, no los suyos.

     ⚠️ Aquí hubo un comentario que decía lo contrario —«NO filtramos por
     organizationId»— sobrevivido de antes del túnel, cuando existía «Todas tus
     organizaciones». Ya no existe: siempre hay una activa y todo cuelga de
     ella. */
  const { userId, organizacionActivaId } = await loadPrivateChrome();
  const api = createServerApiClient();

  const search = q?.trim() ?? '';
  const pagina = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const vistaActual: 'lista' | 'grilla' = vista === 'grilla' ? 'grilla' : 'lista';

  const params = new URLSearchParams({
    page: String(pagina),
    limit: String(POR_PAGINA),
  });
  if (search) params.set('search', search);
  if (organizacionActivaId) params.set('organizationId', organizacionActivaId);

  const page = await api.get<Paginated<Project>>(`/projects?${params}`);

  const idsDePersonas = [
    ...new Set([
      ...page.items.flatMap((project) => project.members?.map((m) => m.userId) ?? []),
      ...page.items.map((project) => project.ownerId),
    ]),
  ];

  const directorio = idsDePersonas.length
    ? await api
        .get<Paginated<UserProfile>>(`/users?ids=${idsDePersonas.join(',')}`)
        .catch(() => null)
    : null;

  const personasPorId = new Map((directorio?.items ?? []).map((user) => [user.id, user]));

  const equiposPorProyecto = new Map<string, UserProfile[] | null>(
    page.items.map((project) => {
      if (!project.members) return [project.id, null];
      const ids = [...new Set([...project.members.map((m) => m.userId), project.ownerId])];
      const perfiles = ids
        .map((id) => personasPorId.get(id))
        .filter((u): u is UserProfile => u !== undefined);
      if (perfiles.length === 0) return [project.id, null];
      return [
        project.id,
        [...perfiles].sort((a, b) => Number(b.id === userId) - Number(a.id === userId)),
      ];
    }),
  );

  // Serializar para el cliente
  const equiposSerialized = Object.fromEntries(
    [...equiposPorProyecto.entries()].map(([k, v]) => [k, v]),
  );

  return (
    <>
      <AppHeader title="Proyectos">
        {/* PRAX ya no se monta aquí: vive en el armazón (`PraxProvider`), con su
            lanzador en la cabecera, disponible en todas las pantallas. */}
        <ProyectosPageClient
          projects={page.items}
          total={page.total}
          pagina={pagina}
          porPagina={POR_PAGINA}
          search={search}
          vistaActual={vistaActual}
          currentUserId={userId}
          equiposPorProyecto={equiposSerialized}
          crearTrigger={
            <PraxCreateProjectTrigger
              triggerVariant="boton"
              organizationId={organizacionActivaId}
            />
          }
        />
      </AppHeader>
    </>
  );
}
