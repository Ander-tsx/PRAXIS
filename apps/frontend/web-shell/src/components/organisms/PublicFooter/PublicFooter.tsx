import Link from 'next/link';

const LINKS: Record<string, { label: string; href: string }[]> = {
  Producto: [
    { label: 'Características', href: '#features' },
    { label: 'Cómo funciona', href: '#how-it-works' },
    { label: 'Roadmap', href: '#' },
  ],
  Equipo: [
    { label: 'Acerca de', href: '#' },
    { label: 'Metodología Shape Up', href: '#' },
    { label: 'UTEZ 9A', href: '#' },
  ],
  Legal: [
    { label: 'Privacidad', href: '#' },
    { label: 'Términos de uso', href: '#' },
  ],
};

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2.5 w-fit">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-white font-display text-base leading-none" aria-hidden="true">
                  P
                </span>
              </div>
              <span className="font-display text-lg text-text-primary">Praxis</span>
            </Link>
            <p className="font-sans text-sm text-text-disabled leading-relaxed max-w-xs">
              Plataforma de gestión de proyectos con permisos dinámicos, Kanban y reportes de
              desviación.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([category, links]) => (
            <div key={category} className="flex flex-col gap-4">
              <h4 className="font-sans text-xs font-semibold text-text-secondary tracking-widest uppercase">
                {category}
              </h4>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="font-sans text-sm text-text-disabled hover:text-text-primary transition-colors duration-150"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-sans text-xs text-text-disabled">
            © 2026 Praxis · Proyecto universitario UTEZ 9A · Cuatrimestre Enero–Junio
          </p>
          <p className="font-sans text-xs text-text-disabled">
            Construido con <span className="text-primary">Next.js</span> +{' '}
            <span className="text-accent">NestJS</span> + AWS
          </p>
        </div>
      </div>
    </footer>
  );
}
