import { scopeCovers } from '@praxis/contracts';
import { type JsonSchema, MCP_TOOLS, methodOf } from './mcp-tools';
import { validar } from './mcp.service';

/**
 * Lo que no da error si se rompe (docs/PLAN-MCP.md, M4): un esquema que deja
 * elegir organización (I2), una herramienta de lectura que escribe (I5) y un
 * catálogo que algún cliente no acepta (trampa 2).
 */
describe('Catálogo del MCP', () => {
  const claves = (schema: JsonSchema): string[] => [
    ...Object.keys(schema.properties ?? {}),
    ...Object.values(schema.properties ?? {}).flatMap(claves),
    ...(schema.items ? claves(schema.items) : []),
  ];

  it('🔴 ningún esquema declara organizationId (I2)', () => {
    for (const tool of MCP_TOOLS) {
      expect({ tool: tool.name, claves: claves(tool.inputSchema) }).not.toEqual(
        expect.objectContaining({ claves: expect.arrayContaining(['organizationId']) }),
      );
    }
  });

  it('🔴 el método casa con el alcance (I5)', () => {
    for (const tool of MCP_TOOLS) {
      const metodo = methodOf(tool);
      if (tool.scope === 'read')
        expect({ tool: tool.name, metodo }).toEqual({ tool: tool.name, metodo: 'GET' });
      if (metodo === 'DELETE')
        expect({ tool: tool.name, scope: tool.scope }).toEqual({
          tool: tool.name,
          scope: 'delete',
        });
      if (metodo !== 'GET') expect(tool.scope).not.toBe('read');
    }
  });

  it('cada herramienta es una llamada o una de las personalizadas, nunca las dos', () => {
    for (const tool of MCP_TOOLS) {
      expect(Boolean(tool.call) !== Boolean(tool.custom)).toBe(true);
    }
  });

  it('los nombres son únicos y sin guiones ni espacios (trampa 2)', () => {
    const nombres = MCP_TOOLS.map((tool) => tool.name);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const nombre of nombres) expect(nombre).toMatch(/^[a-z][a-z_]*$/);
  });

  it('sin oneOf/anyOf y con objetos cerrados', () => {
    const texto = JSON.stringify(MCP_TOOLS.map((tool) => tool.inputSchema));
    expect(texto).not.toMatch(/"(oneOf|anyOf|allOf)"/);
    for (const tool of MCP_TOOLS) expect(tool.inputSchema.additionalProperties).toBe(false);
  });

  it('el ancla de cada herramienta está en su entrada y es obligatoria', () => {
    for (const tool of MCP_TOOLS) {
      if (tool.anchor === 'organization') continue;
      expect({ tool: tool.name, required: tool.inputSchema.required }).toEqual({
        tool: tool.name,
        required: expect.arrayContaining([tool.anchor]),
      });
    }
  });

  it('cada parámetro de ruta está en la entrada y es obligatorio', () => {
    for (const tool of MCP_TOOLS) {
      for (const [, param] of tool.call?.path.matchAll(/\{(\w+)\}/g) ?? []) {
        expect({ tool: tool.name, param, ok: tool.inputSchema.required?.includes(param) }).toEqual({
          tool: tool.name,
          param,
          ok: true,
        });
      }
    }
  });

  it('un token de lectura no ve nada que escriba o borre', () => {
    const visibles = MCP_TOOLS.filter((tool) => scopeCovers(['read'], tool.scope));
    expect(visibles.every((tool) => methodOf(tool) === 'GET')).toBe(true);
  });

  it('write incluye read, y delete va aparte', () => {
    expect(scopeCovers(['write'], 'read')).toBe(true);
    expect(scopeCovers(['write'], 'delete')).toBe(false);
    expect(scopeCovers(['delete'], 'write')).toBe(false);
    expect(scopeCovers(['delete'], 'read')).toBe(false);
  });
});

/** Una herramienta del catálogo, o la prueba falla diciendo cuál falta. */
function herramienta(nombre: string) {
  const tool = MCP_TOOLS.find((t) => t.name === nombre);
  if (!tool) throw new Error(`No existe la herramienta ${nombre}`);
  return tool;
}

describe('validar', () => {
  const crear = herramienta('create_tasks').inputSchema;
  const uuid = '3f0f5a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

  it('🔴 rechaza un organizationId colado aunque la ruta lo aceptara (I2)', () => {
    const listar = herramienta('list_projects').inputSchema;
    expect(validar(listar, { organizationId: uuid })).toMatch(/organizationId no existe/);
  });

  it('acepta un lote bien formado', () => {
    expect(validar(crear, { boardId: uuid, tasks: [{ columnId: uuid, title: 'Una' }] })).toBeNull();
  });

  it('señala el elemento del lote que falla', () => {
    expect(
      validar(crear, {
        boardId: uuid,
        tasks: [{ columnId: uuid, title: 'Una' }, { title: 'Dos' }],
      }),
    ).toBe('Falta arguments.tasks[1].columnId.');
  });

  it('no deja pasar ids que no son ids (ni rutas)', () => {
    expect(validar(crear, { boardId: '../projects', tasks: [] })).toMatch(/no es un id válido/);
  });

  it('respeta el tope del lote', () => {
    const tareas = Array.from({ length: 51 }, () => ({ columnId: uuid, title: 't' }));
    expect(validar(crear, { boardId: uuid, tasks: tareas })).toMatch(/como mucho 50/);
  });

  it('comprueba los enumerados', () => {
    const tarea = herramienta('update_task').inputSchema;
    expect(validar(tarea, { taskId: uuid, priority: 'ALTA' })).toMatch(/uno de: LOW/);
  });
});

describe('Las rutas del catálogo existen', () => {
  /**
   * 🔴 Una ruta mal escrita no da error de compilación: el agente recibe un
   * 404 «Cannot GET». Pasó en el primer spike con el detalle de un tablero,
   * que vive en `/boards/:boardId` y no anidado en su espacio. Se leen los
   * decoradores de los controladores reales y se compara.
   */
  const { readFileSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');

  const controladores = (dir: string): string[] =>
    readdirSync(dir).flatMap((nombre) => {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) return controladores(ruta);
      return nombre.endsWith('.controller.ts') ? [ruta] : [];
    });

  const normalizar = (ruta: string) =>
    `/${ruta}`
      .replace(/\/+/g, '/')
      .replace(/\/$/, '')
      .replace(/[:{]\w+}?/g, ':p');

  const rutas = new Set<string>();
  for (const archivo of controladores(join(__dirname, '..'))) {
    const fuente = readFileSync(archivo, 'utf8');
    let base = '';
    for (const linea of fuente.split('\n')) {
      const controlador = linea.match(/@Controller\((?:'([^']*)')?\)/);
      if (controlador) base = controlador[1] ?? '';
      const metodo = linea.match(/@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/);
      if (metodo)
        rutas.add(`${metodo[1].toUpperCase()} ${normalizar(`${base}/${metodo[2] ?? ''}`)}`);
    }
  }

  it.each(MCP_TOOLS.flatMap((tool) => (tool.call ? [[tool.name, tool.call] as const] : [])))(
    '%s',
    (_nombre, call) => {
      expect(rutas).toContain(`${call.method} ${normalizar(call.path)}`);
    },
  );

  /* Las personalizadas montan su ruta en `mcp.service.ts`; la del valor de un
     campo es la única con `PUT`, y una errata aquí también sería un 404. */
  it('set_task_field (PUT del valor de un campo)', () => {
    expect(rutas).toContain(`PUT ${normalizar('/tasks/{taskId}/fields/{fieldId}')}`);
  });
});

describe('Campos personalizados en el MCP', () => {
  const tool = (nombre: string) => {
    const encontrada = MCP_TOOLS.find((t) => t.name === nombre);
    if (!encontrada) throw new Error(`Falta ${nombre}`);
    return encontrada;
  };

  it('los enlaces de una tarea: añadir escribe, quitar borra', () => {
    expect(tool('add_task_link').scope).toBe('write');
    expect(tool('delete_task_link').scope).toBe('delete');
    expect(tool('add_task_link').inputSchema.required).toEqual(['taskId', 'url']);
  });

  it('están las cinco herramientas, con su alcance', () => {
    expect(tool('list_custom_fields').scope).toBe('read');
    expect(tool('create_custom_field').scope).toBe('write');
    expect(tool('update_custom_field').scope).toBe('write');
    expect(tool('set_task_field').scope).toBe('write');
    expect(tool('delete_custom_field').scope).toBe('delete');
  });

  it('el valor acepta un número con decimales, no un texto en su lugar', () => {
    const schema = tool('set_task_field').inputSchema;
    expect(validar(schema, { taskId: 'task0001', fieldId: 'campo-1', number: 3.5 })).toBeNull();
    expect(validar(schema, { taskId: 'task0001', fieldId: 'campo-1', number: '3' })).toMatch(
      /número/,
    );
  });

  it('las opciones de un campo son objetos cerrados con color del vocabulario', () => {
    const schema = tool('create_custom_field').inputSchema;
    expect(
      validar(schema, {
        projectId: 'p1',
        name: 'Entorno',
        type: 'SELECT',
        options: [{ name: 'Prod', color: 'error' }],
      }),
    ).toBeNull();
    expect(
      validar(schema, {
        projectId: 'p1',
        name: 'Entorno',
        type: 'SELECT',
        options: [{ name: 'Prod', color: 'fucsia' }],
      }),
    ).toMatch(/color/);
    expect(validar(schema, { projectId: 'p1', name: 'X', type: 'FECHA' })).toMatch(/type/);
  });
});
