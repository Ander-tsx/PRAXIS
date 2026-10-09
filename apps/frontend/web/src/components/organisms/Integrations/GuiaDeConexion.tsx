'use client';

import { Button } from '@praxis/commons';
import {
  Check,
  Copy,
  KeyRound,
  LogIn,
  MessageCircle,
  MousePointerClick,
  Plug,
  Settings,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { type ComponentType, type ReactNode, useState } from 'react';

type Icono = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

interface Paso {
  icono: Icono;
  titulo: string;
  detalle?: ReactNode;
}

interface Cliente {
  id: string;
  nombre: string;
  icono: Icono;
  /** Una línea para quien duda de si es su caso. */
  para: string;
  pasos: (endpoint: string) => Paso[];
  nota?: ReactNode;
}

/**
 * Los iconos son genéricos a propósito: los logotipos de las marcas no son
 * nuestros, y una guía con un logo desactualizado confunde más que una sin él.
 *
 * ⚠️ **Los nombres de menú de ChatGPT y Claude cambian con el plan y el
 * idioma.** Los pasos dicen qué buscar, no una ruta exacta, y la nota de cada
 * pestaña avisa de dónde suele variar. Si una pantalla ya no dice así, esta es
 * la única fuente que hay que retocar.
 */
const CLIENTES: Cliente[] = [
  {
    id: 'claude',
    nombre: 'Claude',
    icono: Sparkles,
    para: 'La web claude.ai y la aplicación de escritorio.',
    pasos: (endpoint) => [
      {
        icono: Settings,
        titulo: 'Abre Configuración → Conectores',
        detalle: 'Está en el menú de tu perfil, abajo a la izquierda.',
      },
      {
        icono: Plug,
        titulo: 'Pulsa «Añadir conector personalizado»',
        detalle: (
          <>
            Ponle el nombre <b>Praxis</b> y pega la dirección de arriba:{' '}
            <code className="font-mono text-xs">{endpoint}</code>
          </>
        ),
      },
      {
        icono: LogIn,
        titulo: 'Pulsa «Conectar» y entra con tu cuenta de Kyloo',
        detalle:
          'Usa el mismo correo que en Praxis. Es la cuenta que Praxis usa para saber quién eres.',
      },
      {
        icono: MousePointerClick,
        titulo: 'Elige las organizaciones y los permisos, y pulsa «Permitir»',
        detalle: 'Lectura, escritura y borrado se conceden por separado. Empieza con lo mínimo.',
      },
    ],
    nota: 'En los planes de equipo, quien administra la cuenta de Claude puede tener que añadir el conector primero.',
  },
  {
    id: 'chatgpt',
    nombre: 'ChatGPT',
    icono: MessageCircle,
    para: 'chatgpt.com, en los planes que permiten conectores personalizados.',
    pasos: (endpoint) => [
      {
        icono: Settings,
        titulo: 'Abre Ajustes → Aplicaciones (o Conectores) → Configuración avanzada',
        detalle: 'Activa el «Modo desarrollador»: es lo que permite añadir un servidor MCP propio.',
      },
      {
        icono: Plug,
        titulo: 'Crea una aplicación nueva',
        detalle: (
          <>
            Nombre <b>Praxis</b>, dirección del servidor MCP{' '}
            <code className="font-mono text-xs">{endpoint}</code> y autenticación <b>OAuth</b>.
          </>
        ),
      },
      {
        icono: LogIn,
        titulo: 'Acepta el aviso y pulsa «Crear» y luego «Conectar»',
        detalle: 'Te llevará a Kyloo: entra con el mismo correo que usas en Praxis.',
      },
      {
        icono: MousePointerClick,
        titulo: 'Elige las organizaciones y los permisos, y pulsa «Permitir»',
        detalle:
          'En un chat nuevo, abre el menú «+» → Más → Modo desarrollador y marca Praxis para usarla.',
      },
    ],
    nota: 'ChatGPT puede avisar de que es un conector sin verificar: es lo normal con uno propio. Lo importante es que lo hayas creado tú.',
  },
  {
    id: 'claude-code',
    nombre: 'Claude Code',
    icono: Terminal,
    para: 'El agente de línea de comandos.',
    pasos: (endpoint) => [
      {
        icono: Terminal,
        titulo: 'Añade el servidor desde tu terminal',
        detalle: (
          <Bloque
            codigo={`claude mcp add --transport http praxis ${endpoint}`}
            etiqueta="Comando"
          />
        ),
      },
      {
        icono: LogIn,
        titulo: 'Dentro de Claude Code escribe /mcp, elige praxis y «Authenticate»',
        detalle: 'Se abre el navegador en Kyloo. Entra con el mismo correo que en Praxis.',
      },
      {
        icono: MousePointerClick,
        titulo: 'Elige las organizaciones y los permisos, y pulsa «Permitir»',
      },
    ],
  },
  {
    id: 'otros',
    nombre: 'Otros',
    icono: KeyRound,
    para: 'Cursor, scripts y cualquier cliente que no sepa iniciar sesión solo.',
    pasos: () => [
      {
        icono: KeyRound,
        titulo: 'Usa un token personal',
        detalle:
          'Si tu cliente no admite OAuth, crea un token en «Token personal», más abajo, y pégalo en su configuración. Vale para una sola organización.',
      },
    ],
  },
];

const EJEMPLOS = [
  'Lista mis proyectos y dime cuáles tienen tareas vencidas.',
  'Crea una tarea «Revisar presupuesto» en el tablero Sprint 1, prioridad alta, para el viernes.',
  'Resume lo que se movió esta semana en el proyecto Rediseño.',
  'Cambia a mi otra organización y muéstrame sus proyectos.',
];

/**
 * Cómo conectar Praxis al agente de IA que ya usas, paso a paso.
 *
 * Es la forma recomendada de entrar (por OAuth, sin copiar nada), así que va
 * primera y abierta. Cada cliente tiene su pestaña porque el recorrido cambia,
 * pero el final es el mismo: Kyloo, organizaciones, permisos.
 */
export function GuiaDeConexion({ endpoint }: { endpoint: string }) {
  const [activo, setActivo] = useState(CLIENTES[0].id);
  const cliente = CLIENTES.find((c) => c.id === activo) ?? CLIENTES[0];

  return (
    <section className="flex flex-col gap-5">
      <h3 className="font-sans text-base font-medium text-text-primary">Cómo conectarlo</h3>

      <div className="flex max-w-2xl flex-col gap-2">
        <span className="font-sans text-xs uppercase tracking-wide text-text-secondary">
          Dirección de Praxis
        </span>
        <Bloque codigo={endpoint} etiqueta="Dirección" />
      </div>

      <div role="tablist" aria-label="Agente de IA" className="flex flex-wrap gap-2">
        {CLIENTES.map((c) => {
          const Icono = c.icono;
          const seleccionado = c.id === activo;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={seleccionado}
              onClick={() => setActivo(c.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 font-sans text-sm transition-colors ${
                seleccionado
                  ? 'border-border-strong bg-surface-elevated text-text-primary'
                  : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
              }`}
            >
              <Icono className="h-4 w-4" aria-hidden />
              {c.nombre}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="flex flex-col gap-4">
        <p className="font-sans text-sm text-text-secondary">{cliente.para}</p>
        <ol className="flex max-w-2xl flex-col gap-4">
          {cliente.pasos(endpoint).map((paso, i) => {
            const Icono = paso.icono;
            return (
              <li key={paso.titulo} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-secondary">
                  <Icono className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-sans text-sm font-medium text-text-primary">
                    {i + 1}. {paso.titulo}
                  </span>
                  {paso.detalle && (
                    <span className="font-sans text-sm text-text-secondary">{paso.detalle}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {cliente.nota && (
          <p className="max-w-2xl border-l-2 border-border-strong py-1 pl-4 font-sans text-sm text-text-secondary">
            {cliente.nota}
          </p>
        )}
      </div>

      <div className="flex max-w-2xl flex-col gap-2">
        <h4 className="font-sans text-sm font-medium text-text-primary">Pruébalo con algo así</h4>
        <ul className="flex flex-col gap-1.5">
          {EJEMPLOS.map((ejemplo) => (
            <li
              key={ejemplo}
              className="rounded-lg border border-border px-3 py-2 font-sans text-sm italic text-text-secondary"
            >
              «{ejemplo}»
            </li>
          ))}
        </ul>
        <p className="font-sans text-xs text-text-secondary">
          El agente solo hace lo que concediste al conectar, y puedes revocarlo abajo en cualquier
          momento.
        </p>
      </div>
    </section>
  );
}

/** Un texto copiable con su botón; sirve para la dirección y para los comandos. */
function Bloque({ codigo, etiqueta }: { codigo: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated py-1.5 pl-3 pr-1.5">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-text-primary">
        {codigo}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Copiar ${etiqueta.toLowerCase()}`}
        onClick={() => {
          navigator.clipboard
            .writeText(codigo)
            .then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            })
            .catch(() => undefined);
        }}
      >
        {copiado ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}
