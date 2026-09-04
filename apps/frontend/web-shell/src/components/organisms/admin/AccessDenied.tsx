/**
 * Lo que se ve al llegar a `/admin` sin ser administrador.
 *
 * **No es un 404 ni un rebote al panel**, por lo mismo que `NoReportsAccess` en
 * Análisis (ESTADO-ACTUAL §29.3): un 404 diría que la página no existe, que es
 * falso, y un rebote silencioso se lee como un enlace roto. Aquí se llega
 * escribiendo la URL o siguiendo un enlace que alguien compartió, y las dos
 * cosas merecen una explicación en vez de un salto.
 *
 * No dice **quién** administra la plataforma, y es a propósito: el rol global es
 * privado —no se expone en el directorio de usuarios ni en la lista de miembros
 * de un proyecto— así que esta pantalla tampoco puede ser la rendija por la que
 * se averigua.
 */
export function AccessDenied() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <svg
        className="h-8 w-8 text-white"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>

      <p className="font-display text-lg text-text-primary">
        Esta zona es solo para administración
      </p>
      <p className="font-sans text-sm text-white">
        Tu cuenta no administra la plataforma, así que no hay nada que puedas hacer aquí. Si crees
        que debería, pídeselo a quien te dio acceso a Praxis.
      </p>
    </div>
  );
}
