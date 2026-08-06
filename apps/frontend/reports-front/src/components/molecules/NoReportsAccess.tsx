/**
 * Lo que se ve cuando los reportes están cerrados para ti.
 *
 * Sale en dos sitios distintos y por eso vive aparte: al entrar a `/reports`
 * sin ningún proyecto que puedas mirar, y al escribir a mano la URL de uno
 * concreto que no puedes.
 *
 * **No es un 404 ni un rebote al panel.** La entrada «Reportes» de la barra
 * lateral es global —cruza las cuatro zonas privadas— mientras que el permiso
 * es por proyecto, así que no hay forma barata de esconderla y la pantalla
 * tiene que poder explicarse sola. Un 404 diría que la página no existe, que
 * es falso, y un rebote silencioso al panel se lee como un enlace roto.
 *
 * Dice **a quién pedírselo**, que es lo único accionable: el permiso lo reparte
 * quien administra el proyecto, desde sus roles.
 */
export function NoReportsAccess({ projectName }: { projectName?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <p className="font-display text-lg text-text-primary">
        {projectName
          ? `Los reportes de ${projectName} no están abiertos para ti`
          : 'Ningún proyecto tuyo tiene los reportes abiertos para ti'}
      </p>
      <p className="mx-auto mt-2 max-w-md font-sans text-sm text-text-secondary">
        Ver los reportes de un proyecto —y preguntarle al asistente sobre él— es un permiso que se
        concede por rol. Si lo necesitas, pídeselo a quien administre el proyecto: lo encontrará en
        Roles, como «Ver los reportes y usar el asistente».
      </p>
    </div>
  );
}
