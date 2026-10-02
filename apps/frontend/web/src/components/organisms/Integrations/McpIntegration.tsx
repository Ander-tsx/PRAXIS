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
import { type FormEvent, useState } from 'react';

/**
 * El MCP de Praxis: lo que ve cada persona al desplegar la integración
 * (docs/PLAN-MCP.md, M5, M13 y M14).
 *
 * Tres bloques, en el orden en que se usan: el permiso de la organización
 * (solo para quien la administra), los tokens propios y cómo conectarlos.
 *
 * ⚠️ **El token en claro se enseña una sola vez**, en la respuesta a crearlo.
 * No se guarda en ningún estado que sobreviva a la pantalla: si se pierde, se
 * revoca y se crea otro.
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
  return (
    <>
      {canManageOrganization && (
        <OrgSwitch organizationId={organizationId} mcpAllowed={mcpAllowed} />
      )}

      {mcpAllowed ? (
        <>
          <Tokens
            organizationId={organizationId}
            organizationName={organizationName}
            tokens={tokens}
          />
          <ConnectGuide endpoint={endpoint} />
        </>
      ) : (
        <p className="max-w-2xl font-sans text-sm text-text-secondary">
          {organizationName} no permite conectar agentes por MCP.
          {canManageOrganization
            ? ' Actívalo arriba para que cada miembro pueda crear su token.'
            : ' Lo decide quien la administra.'}
        </p>
      )}
    </>
  );
}

/* ─── El permiso de la organización ────────────────────────────────────── */

function OrgSwitch({
  organizationId,
  mcpAllowed,
}: { organizationId: string; mcpAllowed: boolean }) {
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
    <form onSubmit={cambiar} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-sans text-sm font-medium text-text-primary">
            Permitir a los miembros conectar su agente
          </h3>
          <p className="max-w-xl font-sans text-sm text-text-secondary">
            {mcpAllowed
              ? 'Cada miembro puede crear su propio token. Apagarlo deja de aceptar los que ya existen, sin borrarlos.'
              : 'Apagado: ningún token de esta organización funciona, y no se pueden crear.'}
          </p>
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

/* ─── Los tokens propios ───────────────────────────────────────────────── */

const CADUCIDADES = [
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
  { value: '0', label: 'Sin caducidad' },
];

function Tokens({
  organizationId,
  organizationName,
  tokens,
}: {
  organizationId: string;
  organizationName: string;
  tokens: PersonalTokenView[];
}) {
  const [state, formAction, pending] = useAccion(crearTokenAction, CREAR_TOKEN_INITIAL_STATE);
  const vivos = tokens.filter((t) => tokenVivo(t));
  const muertos = tokens.filter((t) => !tokenVivo(t));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="font-sans text-sm font-medium text-text-primary">Tus tokens</h3>
        <p className="max-w-2xl font-sans text-sm text-text-secondary">
          Un token es la llave que le das a tu agente (Claude, Cursor…) para que trabaje en Praxis
          como tú, solo dentro de {organizationName}. Nadie más los ve.
        </p>
      </div>

      {state.token && <TokenCreado token={state.token} />}

      {/* `action` a propósito: es un alta, y que el formulario se vacíe al
          crear es justo lo que se quiere. */}
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <FloatingLabelInput
            label="Nombre (p. ej. Claude del portátil)"
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
          Lo que tu agente haga con este token queda a tu nombre, como si lo hubieras hecho tú. Si
          lee un documento con instrucciones escondidas, podría seguirlas: da solo el permiso que
          necesites.
        </p>

        {state.error && <p className="font-sans text-sm text-error">{state.error}</p>}
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Creando…' : 'Crear token'}
          </Button>
        </div>
      </form>

      {vivos.length > 0 && (
        <ul className="flex flex-col">
          {vivos.map((token) => (
            <TokenFila key={token.id} token={token} />
          ))}
        </ul>
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

function TokenCreado({ token }: { token: string }) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-primary bg-primary-muted py-3 pl-4 pr-4">
      <p className="font-sans text-sm text-text-primary">
        Cópialo ahora: <strong className="font-semibold">no se volverá a enseñar.</strong>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="break-all font-mono text-sm text-text-primary">{token}</code>
        <Copiar texto={token} />
      </div>
    </div>
  );
}

const PERMISO: Record<string, string> = { read: 'leer', write: 'editar', delete: 'borrar' };

function fecha(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
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

/* ─── Cómo conectarlo ──────────────────────────────────────────────────── */

function ConnectGuide({ endpoint }: { endpoint: string }) {
  const claudeCode = `claude mcp add --transport http praxis ${endpoint} --header "Authorization: Bearer TU_TOKEN"`;
  const cursor = JSON.stringify(
    { mcpServers: { praxis: { url: endpoint, headers: { Authorization: 'Bearer TU_TOKEN' } } } },
    null,
    2,
  );
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        praxis: {
          command: 'npx',
          args: ['-y', 'mcp-remote', endpoint, '--header', 'Authorization:Bearer TU_TOKEN'],
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-sans text-sm font-medium text-text-primary">Conectarlo</h3>
        <p className="max-w-2xl font-sans text-sm text-text-secondary">
          La dirección del servidor es{' '}
          <code className="font-mono text-text-primary">{endpoint}</code>. Sustituye{' '}
          <code className="font-mono">TU_TOKEN</code> por el que acabas de crear.
        </p>
      </div>
      <Fragmento titulo="Claude Code" texto={claudeCode} />
      <Fragmento titulo="Cursor (.cursor/mcp.json)" texto={cursor} />
      <Fragmento titulo="Claude Desktop (claude_desktop_config.json)" texto={claudeDesktop} />
    </div>
  );
}

function Fragmento({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-4">
        <span className="font-sans text-xs text-text-secondary">{titulo}</span>
        <Copiar texto={texto} />
      </div>
      <pre className="overflow-x-auto rounded-md bg-surface p-3 font-mono text-xs text-text-primary">
        {texto}
      </pre>
    </div>
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
