'use client';

import { AuthPanel } from '@/components/organisms/AuthPanel';
import { Button, Checkbox } from '@praxis/commons/atoms';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useRef, useState } from 'react';

interface OrganizationOption {
  id: string;
  name: string | null;
  personal: boolean;
  available: boolean;
  /** Por qué no se puede elegir (plan sin integraciones, MCP apagado…). */
  reason?: string;
}

interface ConnectData {
  clientName: string;
  organizations: OrganizationOption[];
  /** Lo que esa persona ya tenía con este cliente, para partir de ahí al reconectar. */
  current: { allowedOrgIds: string[]; activeOrgId: string } | null;
}

interface Failure {
  code?: string;
  message?: string;
}

const LOAD_ERROR = 'No se pudieron cargar tus organizaciones de Praxis.';
const SAVE_ERROR = 'No se pudo guardar la elección. Inténtalo de nuevo.';

/**
 * Llama a las rutas internas del gateway. El gateway envuelve lo bueno en `{ success, data }` y lo
 * malo en `{ error: { code, message } }`, o en el objeto de la excepción a secas.
 */
async function post<T>(route: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/internal/kyloo/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw (payload?.error ?? payload) as Failure;
  return (payload?.data ?? payload) as T;
}

function organizationName(organization: OrganizationOption) {
  return organization.name ?? (organization.personal ? 'Espacio personal' : 'Organización');
}

/**
 * Paso de conexión de un cliente de IA (ChatGPT, Claude…) con Praxis: con qué organizaciones va a
 * trabajar. Kyloo Accounts manda aquí a la persona con un token de 5 minutos, de un solo uso y
 * firmado por Kyloo (docs/PLAN-OAUTH-KYLOO.md); al terminar, la devuelve a Kyloo para que la
 * autorización continúe.
 *
 * ⚠️ La identidad sale del token, nunca de esta pantalla: aquí solo se elige entre lo que esa
 * persona ya puede ver, y el gateway lo vuelve a comprobar al guardar.
 */
export default function KylooConnectPage() {
  return (
    <AuthPanel>
      <Suspense fallback={<p className="font-sans text-sm text-text-secondary">Cargando…</p>}>
        <Connect />
      </Suspense>
    </AuthPanel>
  );
}

function Connect() {
  const token = useSearchParams().get('token') ?? '';
  const [data, setData] = useState<ConnectData | null>(null);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [active, setActive] = useState('');
  const [saving, setSaving] = useState(false);
  /* En desarrollo React monta el efecto dos veces; la segunda carga no aporta nada. */
  const loaded = useRef(false);

  useEffect(() => {
    if (!token || loaded.current) return;
    loaded.current = true;

    post<ConnectData>('organizations', { token })
      .then((loadedData) => {
        setData(loadedData);
        const free = loadedData.organizations.filter((organization) => organization.available);
        /* Reconectar parte de lo que ya había; si no, todas las disponibles y la personal activa. */
        const previous = loadedData.current?.allowedOrgIds.filter((id) =>
          free.some((organization) => organization.id === id),
        );
        const initial = previous?.length ? previous : free.map((organization) => organization.id);
        setChosen(new Set(initial));
        setActive(
          loadedData.current && initial.includes(loadedData.current.activeOrgId)
            ? loadedData.current.activeOrgId
            : (free.find(
                (organization) => organization.personal && initial.includes(organization.id),
              )?.id ??
                initial[0] ??
                ''),
        );
      })
      .catch((failure: Failure) => {
        if (failure.code === 'NO_PRAXIS_ACCOUNT') return setNoAccount(true);
        setError(failure.message ?? LOAD_ERROR);
      });
  }, [token]);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (!next.has(active)) setActive([...next][0] ?? '');
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (chosen.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const { returnUrl } = await post<{ returnUrl: string }>('connections', {
        token,
        orgIds: [...chosen],
        activeOrgId: active,
      });
      window.location.assign(returnUrl);
    } catch (failure) {
      setSaving(false);
      setError((failure as Failure).message ?? SAVE_ERROR);
    }
  }

  if (!token) {
    return (
      <Message title="Este enlace no vale">
        Esta pantalla se abre desde la conexión de un cliente de IA. Vuelve a esa aplicación e
        inténtalo de nuevo.
      </Message>
    );
  }

  if (noAccount) {
    return (
      <Message title="Aún no tienes cuenta en Praxis">
        Para conectar un cliente de IA primero tienes que entrar en Praxis con tu cuenta de Kyloo, y
        así se crea. Después vuelve al cliente de IA y conéctalo de nuevo.
        <Link href="/auth/login" className="mt-6 block">
          <Button fullWidth>Entrar en Praxis</Button>
        </Link>
      </Message>
    );
  }

  if (!data) {
    return error ? (
      <Message title="No se pudo continuar">
        {error} Vuelve al cliente de IA e inténtalo de nuevo.
      </Message>
    ) : (
      <p className="font-sans text-sm text-text-secondary">Cargando…</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md">
      <h1 className="mb-2 font-display text-3xl text-text-primary">
        ¿Con qué organizaciones trabajará {data.clientName}?
      </h1>
      <p className="mb-6 font-sans text-sm leading-relaxed text-text-secondary">
        Solo verá lo que tú puedes ver en las que marques. Después podrás cambiar cuál usa, o añadir
        otra, desde Integraciones, sin volver a conectar.
      </p>

      {error && (
        <p role="alert" className="mb-4 font-sans text-sm text-error">
          {error}
        </p>
      )}

      <ul className="mb-6 grid gap-2">
        {data.organizations.map((organization) => (
          <li key={organization.id} className="grid gap-1">
            <Checkbox
              id={`org-${organization.id}`}
              label={organizationName(organization)}
              hint={organization.available ? undefined : organization.reason}
              checked={chosen.has(organization.id)}
              disabled={!organization.available || saving}
              onChange={() => toggle(organization.id)}
            />
            {organization.available && (
              <label className="flex items-center gap-2 pl-3 font-sans text-xs text-text-secondary">
                <input
                  type="radio"
                  name="active-organization"
                  checked={active === organization.id}
                  disabled={!chosen.has(organization.id) || saving}
                  onChange={() => setActive(organization.id)}
                  aria-label={`Empezar en ${organizationName(organization)}`}
                />
                empieza aquí
              </label>
            )}
          </li>
        ))}
      </ul>

      <Button type="submit" fullWidth disabled={saving || chosen.size === 0}>
        {saving ? 'Continuando…' : 'Continuar'}
      </Button>
    </form>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md">
      <h1 className="mb-2 font-display text-3xl text-text-primary">{title}</h1>
      <div className="font-sans text-sm leading-relaxed text-text-secondary">{children}</div>
    </div>
  );
}
