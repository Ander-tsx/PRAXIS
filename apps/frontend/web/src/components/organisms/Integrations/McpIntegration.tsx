'use client';

import {
  crearTokenAction,
  permitirMcpAction,
  revocarTokenAction,
} from '@/app/(privado)/main/integrations/actions';
import { CREAR_TOKEN_INITIAL_STATE, NOTIFICATION_INITIAL_STATE } from '@/lib/main/action-state';
import { type PersonalTokenView, tokenVivo } from '@/lib/main/integrations';
import {
  Button,
  Checkbox,
  FloatingLabelInput,
  FloatingLabelSelect,
  useAccion,
} from '@praxis/commons';
import { type FormEvent, type ReactNode, useState } from 'react';

/**
 * El MCP de Praxis: lo que ve cada persona al desplegar la integración
 * (docs/PLAN-MCP.md, M5, M13 y M14).
 *
 * Tres pasos numerados, en el orden en que se hacen: crear el token, conectar
 * el agente y gestionar los tokens. Encima, solo para quien administra la
 * organización, su permiso.
 *
 * 🔴 **El código de conexión sale ya con el token dentro**, recién creado: lo
 * pidió el dueño — copiar y pegar, sin sustituir nada. Por eso el estado de la
 * creación vive aquí arriba y lo comparten los pasos 1 y 2.
 *
 * ⚠️ **El token en claro se enseña una sola vez.** No se guarda en ningún
 * estado que sobreviva a la pantalla: al recargar, el código vuelve a salir
 * con `TU_TOKEN` y, si se perdió, se revoca y se crea otro.
 */
export function McpIntegration({
  organizationId,
  organizationName,
  mcpAllowed,
  canManageOrganization,
  tokens,
  endpoint,
}: {
  organizationId: string;
  organizationName: string;
  mcpAllowed: boolean;
  canManageOrganization: boolean;
  /** Los de la persona en **esta** organización. */
  tokens: PersonalTokenView[];
  /** `https://<dominio>/api/mcp`, ya resuelto en el servidor. */
  endpoint: string;
}) {
  const [creado, crear, creando] = useAccion(crearTokenAction, CREAR_TOKEN_INITIAL_STATE);

  return (
    <div className="flex flex-col gap-10">
      {canManageOrganization && (
        <OrgSwitch organizationId={organizationId} mcpAllowed={mcpAllowed} />
      )}

      {mcpAllowed ? (
        <>
          <Paso numero={1} titulo="Crea tu token">
            <p className="max-w-2xl font-sans text-sm text-text-secondary">
              El token es la llave que le das a tu agente para que trabaje en Praxis como tú, solo
              dentro de {organizationName}. Nadie más lo ve.
            </p>
            <CrearToken
              organizationId={organizationId}
              enviar={crear}
              pending={creando}
              error={creado.error}
            />
          </Paso>

          <Paso numero={2} titulo="Conecta tu agente">
            {creado.token ? (
              <Aviso>
                Tu token ya va dentro del código: copia el de tu agente y pégalo.{' '}
                <strong className="font-semibold">Solo se enseña ahora</strong>; si recargas la
                página, el código volverá a salir sin él.
              </Aviso>
            ) : (
              <p className="max-w-2xl font-sans text-sm text-text-secondary">
                Crea un token en el paso 1 y el código de abajo saldrá ya con él, listo para copiar
                y pegar.
              </p>
            )}
            <Agentes endpoint={endpoint} token={creado.token} />
          </Paso>

          <Paso numero={3} titulo="Tus tokens">
            <p className="max-w-2xl font-sans text-sm text-text-secondary">
              Revocar un token lo deja sin acceso al instante, esté donde esté. Para cambiarlo por
              otro con más o menos permisos, crea el nuevo, cámbialo en tu agente (mira «Cambiar o
              quitar» en tu agente, arriba) y revoca el viejo.
            </p>
            <ListaDeTokens tokens={tokens} />
          </Paso>
        </>
      ) : (
        <p className="max-w-2xl font-sans text-sm text-text-secondary">
          {organizationName} no permite conectar agentes por MCP.
          {canManageOrganization
            ? ' Actívalo arriba para que cada miembro pueda crear su token.'
            : ' Lo decide quien la administra.'}
        </p>
      )}
    </div>
  );
}

/* ─── Piezas de maquetación ────────────────────────────────────────────── */

function Paso({
  numero,
  titulo,
  children,
}: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="flex items-center gap-3 font-sans text-base font-medium text-text-primary">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong font-sans text-xs text-text-secondary">
          {numero}
        </span>
        {titulo}
      </h3>
      <div className="flex flex-col gap-4 pl-9">{children}</div>
    </section>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-2xl border-l-2 border-primary bg-primary-muted py-3 pl-4 pr-4 font-sans text-sm text-text-primary">
      {children}
    </p>
  );
}

/* ─── El permiso de la organización ────────────────────────────────────── */

function OrgSwitch({
  organizationId,
  mcpAllowed,
}: {
  organizationId: string;
  mcpAllowed: boolean;
}) {
  const [state, enviar, pending] = useAccion(permitirMcpAction, NOTIFICATION_INITIAL_STATE);

  /* `onSubmit` y no `action`: es un formulario de edición, y React 19 resetea
     los de `action` al terminar (CLAUDE.md). */
  function cambiar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('organizationId', organizationId);
    datos.set('mcpAllowed', String(!mcpAllowed));
    enviar(datos);
  }

  return (
    <form
      onSubmit={cambiar}
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-sans text-xs uppercase tracking-wider text-text-secondary">
            Ajuste de la organización · solo lo ve quien la administra
          </span>
          <span className="font-sans text-sm font-medium text-text-primary">
            {mcpAllowed
              ? 'Los miembros pueden conectar su agente'
              : 'Los miembros no pueden conectar su agente'}
          </span>
          <span className="max-w-xl font-sans text-xs text-text-secondary">
            {mcpAllowed
              ? 'Desactivarlo deja sin acceso a todos los tokens de esta organización, sin borrarlos.'
              : 'Ningún token de esta organización funciona ni se puede crear.'}
          </span>
        </div>
        <Button
          type="submit"
          variant={mcpAllowed ? 'secondary' : 'primary'}
          size="sm"
          disabled={pending}
        >
          {pending ? 'Guardando…' : mcpAllowed ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
      {state.error && <p className="font-sans text-sm text-error">{state.error}</p>}
    </form>
  );
}

/* ─── Paso 1: crear el token ───────────────────────────────────────────── */

const CADUCIDADES = [
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
  { value: '0', label: 'Sin caducidad' },
];

function CrearToken({
  organizationId,
  enviar,
  pending,
  error,
}: {
  organizationId: string;
  enviar: (datos: FormData) => void;
  pending: boolean;
  error: string | null;
}) {
  /* `action` a propósito: es un alta, y que el formulario se vacíe al crear es
     justo lo que se quiere. */
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <FloatingLabelInput
          label="Nombre (p. ej. Claude Code del portátil)"
          name="name"
          maxLength={60}
          required
        />
        <FloatingLabelSelect
          label="Caduca en"
          name="expiresInDays"
          options={CADUCIDADES}
          defaultValue="90"
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-sans text-sm text-text-primary">
          Qué puede hacer tu agente
        </legend>
        <Checkbox
          label="Leer"
          hint="Proyectos, tableros, tareas, documentos. Siempre incluido."
          checked
          disabled
          readOnly
        />
        <Checkbox
          name="scopes"
          value="write"
          label="Crear y editar"
          hint="Crear tareas, moverlas, comentar, crear proyectos y tableros…"
        />
        <Checkbox
          name="scopes"
          value="delete"
          label="Borrar"
          hint="Tareas, columnas, tableros, documentos y proyectos. No se puede deshacer."
        />
      </fieldset>

      <p className="max-w-2xl font-sans text-xs text-text-secondary">
        Lo que tu agente haga con este token queda a tu nombre, como si lo hubieras hecho tú. Si lee
        un documento con instrucciones escondidas, podría seguirlas: da solo el permiso que
        necesites.
      </p>

      {error && <p className="font-sans text-sm text-error">{error}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Creando…' : 'Crear token'}
        </Button>
      </div>
    </form>
  );
}

/* ─── Paso 2: conectar el agente ───────────────────────────────────────── */

interface Agente {
  id: string;
  nombre: string;
  /** Dónde se hace, en una frase. */
  donde: ReactNode;
  /** Lo que se copia. */
  codigo: string;
  /** Cómo saber que funcionó. */
  comprobar: ReactNode;
  /** Cómo cambiar el token o quitar Praxis. */
  quitar: ReactNode;
}

const Mono = ({ children }: { children: ReactNode }) => (
  <code className="font-mono text-text-primary">{children}</code>
);

function agentes(endpoint: string, token: string): Agente[] {
  const cabecera = `Authorization: Bearer ${token}`;
  return [
    {
      id: 'claude-code',
      nombre: 'Claude Code',
      donde: (
        <>
          En tu terminal, en cualquier carpeta. Con <Mono>--scope user</Mono> queda disponible en
          todos tus proyectos.
        </>
      ),
      codigo: `claude mcp add --scope user --transport http praxis ${endpoint} --header "${cabecera}"`,
      comprobar: (
        <>
          Abre Claude Code y escribe <Mono>/mcp</Mono>: «praxis» tiene que salir conectado. Luego
          pídele, por ejemplo, «lista mis proyectos de Praxis».
        </>
      ),
      quitar: (
        <>
          Claude Code no deja añadir otro servidor con el mismo nombre: primero quita el que hay con{' '}
          <Mono>claude mcp remove praxis --scope user</Mono> y después vuelve a pegar el comando de
          arriba con el token nuevo. Si lo añadiste sin <Mono>--scope user</Mono>, quítalo desde la
          misma carpeta con <Mono>claude mcp remove praxis</Mono>.
        </>
      ),
    },
    {
      id: 'codex',
      nombre: 'Codex',
      donde: (
        <>
          En el archivo <Mono>~/.codex/config.toml</Mono> (créalo si no existe) y pega esto al
          final. Lo comparten el CLI de Codex, su extensión para el editor y la app de escritorio.
        </>
      ),
      codigo: `[mcp_servers.praxis]\nurl = "${endpoint}"\nhttp_headers = { "Authorization" = "Bearer ${token}" }`,
      comprobar: (
        <>
          Reinicia Codex y ejecuta <Mono>codex mcp list</Mono>: «praxis» tiene que aparecer. En una
          sesión, <Mono>/mcp</Mono> enseña sus herramientas.
        </>
      ),
      quitar: (
        <>
          Para cambiar el token, edita la línea <Mono>http_headers</Mono> de{' '}
          <Mono>~/.codex/config.toml</Mono>. Para quitar Praxis, ejecuta{' '}
          <Mono>codex mcp remove praxis</Mono> (o borra el bloque <Mono>[mcp_servers.praxis]</Mono>
          ). Reinicia Codex.
        </>
      ),
    },
    {
      id: 'cursor',
      nombre: 'Cursor',
      donde: (
        <>
          En <Mono>~/.cursor/mcp.json</Mono> para todos tus proyectos, o en{' '}
          <Mono>.cursor/mcp.json</Mono> dentro de un proyecto. Si el archivo ya tiene otros
          servidores, añade solo el bloque <Mono>{'"praxis"'}</Mono> dentro de{' '}
          <Mono>mcpServers</Mono>.
        </>
      ),
      codigo: JSON.stringify(
        {
          mcpServers: { praxis: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } },
        },
        null,
        2,
      ),
      comprobar: (
        <>
          En Cursor, <Mono>Settings → MCP</Mono>: «praxis» tiene que salir en verde con sus
          herramientas.
        </>
      ),
      quitar: (
        <>
          Cambia el token en el mismo archivo, o borra el bloque <Mono>{'"praxis"'}</Mono> para
          quitarlo. Cursor lo recarga solo.
        </>
      ),
    },
    {
      id: 'claude-desktop',
      nombre: 'Claude Desktop',
      donde: (
        <>
          En Claude Desktop, <Mono>Configuración → Desarrollador → Editar configuración</Mono>.
          Necesita Node.js instalado. Si ya hay otros servidores, añade solo el bloque{' '}
          <Mono>{'"praxis"'}</Mono>.
        </>
      ),
      codigo: JSON.stringify(
        {
          mcpServers: {
            praxis: {
              command: 'npx',
              args: ['-y', 'mcp-remote', endpoint, '--header', `Authorization:Bearer ${token}`],
            },
          },
        },
        null,
        2,
      ),
      comprobar: (
        <>Cierra Claude Desktop del todo y vuelve a abrirlo: Praxis sale entre tus conectores.</>
      ),
      quitar: (
        <>
          Edita la misma configuración: cambia el token o borra el bloque <Mono>{'"praxis"'}</Mono>,
          y reinicia la app.
        </>
      ),
    },
  ];
}

function Agentes({ endpoint, token }: { endpoint: string; token: string | null }) {
  const lista = agentes(endpoint, token ?? 'TU_TOKEN');
  const [activo, setActivo] = useState(lista[0].id);
  const agente = lista.find((a) => a.id === activo) ?? lista[0];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Agente"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {lista.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === activo}
            onClick={() => setActivo(a.id)}
            className={`-mb-px border-b-2 px-3 py-2 font-sans text-sm transition-colors ${
              a.id === activo
                ? 'border-primary text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {a.nombre}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-4">
        <Bloque titulo="Dónde">{agente.donde}</Bloque>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <span className="font-sans text-xs uppercase tracking-wider text-text-secondary">
              Copia y pega
            </span>
            <Copiar texto={agente.codigo} />
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface p-3 font-mono text-xs text-text-primary">
            {agente.codigo}
          </pre>
        </div>
        <Bloque titulo="Comprueba que funciona">{agente.comprobar}</Bloque>
        <Bloque titulo="Cambiar o quitar">{agente.quitar}</Bloque>
      </div>

      <p className="max-w-2xl font-sans text-xs text-text-secondary">
        ¿ChatGPT o Claude en la web? Sus conectores piden iniciar sesión con OAuth, que Praxis
        todavía no ofrece. De momento, los agentes de arriba.
      </p>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-sans text-xs uppercase tracking-wider text-text-secondary">
        {titulo}
      </span>
      <p className="max-w-2xl font-sans text-sm text-text-secondary">{children}</p>
    </div>
  );
}

/* ─── Paso 3: la lista ─────────────────────────────────────────────────── */

function ListaDeTokens({ tokens }: { tokens: PersonalTokenView[] }) {
  const vivos = tokens.filter((t) => tokenVivo(t));
  const muertos = tokens.filter((t) => !tokenVivo(t));

  return (
    <div className="flex flex-col gap-3">
      {vivos.length > 0 ? (
        <ul className="flex flex-col">
          {vivos.map((token) => (
            <TokenFila key={token.id} token={token} />
          ))}
        </ul>
      ) : (
        <p className="font-sans text-sm text-text-secondary">Todavía no tienes ninguno activo.</p>
      )}
      {muertos.length > 0 && (
        <details className="font-sans text-sm text-text-secondary">
          <summary className="cursor-pointer">Revocados o caducados ({muertos.length})</summary>
          <ul className="mt-2 flex flex-col">
            {muertos.map((token) => (
              <TokenFila key={token.id} token={token} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const PERMISO: Record<string, string> = { read: 'leer', write: 'editar', delete: 'borrar' };

function fecha(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
}

function TokenFila({ token }: { token: PersonalTokenView }) {
  const [state, enviar, pending] = useAccion(revocarTokenAction, NOTIFICATION_INITIAL_STATE);
  const [confirmando, setConfirmando] = useState(false);
  const vivo = tokenVivo(token);

  function revocar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData();
    datos.set('id', token.id);
    enviar(datos);
  }

  const usado = fecha(token.lastUsedAt);
  const caduca = fecha(token.expiresAt);

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-sans text-sm text-text-primary">
          {token.name}{' '}
          <code className="font-mono text-xs text-text-secondary">{token.prefix}…</code>
        </span>
        <span className="font-sans text-xs text-text-secondary">
          Puede {token.scopes.map((s) => PERMISO[s] ?? s).join(', ')}
          {' · '}
          {usado ? `usado el ${usado}` : 'sin usar'}
          {' · '}
          {token.revokedAt
            ? `revocado el ${fecha(token.revokedAt)}`
            : caduca
              ? `${vivo ? 'caduca' : 'caducó'} el ${caduca}`
              : 'no caduca'}
        </span>
        {state.error && <span className="font-sans text-xs text-error">{state.error}</span>}
      </div>

      {vivo && (
        <form onSubmit={revocar} className="flex items-center gap-2">
          {confirmando ? (
            <>
              <span className="font-sans text-xs text-text-secondary">
                Deja de funcionar al instante.
              </span>
              <Button type="submit" variant="danger" size="sm" disabled={pending}>
                {pending ? 'Revocando…' : 'Revocar'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
              Revocar
            </Button>
          )}
        </form>
      )}
    </li>
  );
}

function Copiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        navigator.clipboard
          .writeText(texto)
          .then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          })
          .catch(() => undefined);
      }}
    >
      {copiado ? 'Copiado' : 'Copiar'}
    </Button>
  );
}
