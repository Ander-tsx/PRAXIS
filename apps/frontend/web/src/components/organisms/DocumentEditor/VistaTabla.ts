import { TableView } from '@tiptap/extension-table';
import type { Node as NodoPM } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import {
  CellSelection,
  TableMap,
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  deleteTable,
} from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';

/** Los controles son parte de la vista, nunca del documento compartido o exportado. */
export class VistaTabla extends TableView {
  private view: EditorView;
  private surface: HTMLDivElement;
  private handles = document.createElement('div');
  private menu = document.createElement('div');
  private menuTrigger: HTMLButtonElement | null = null;
  private observer: ResizeObserver;
  private frame = 0;
  private dimensions = '';

  constructor(
    node: NodoPM,
    cellMinWidth: number,
    view: EditorView,
    atributos: Record<string, string>,
  ) {
    super(node, cellMinWidth, view, atributos);
    this.view = view;
    this.dom.classList.add('tabla-con-controles');
    this.actualizarAncho();
    const superficie = document.createElement('div');
    superficie.className = 'tabla-superficie';
    this.surface = superficie;
    superficie.append(this.table);
    this.dom.append(superficie);

    for (const tipo of ['columna', 'fila'] as const) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.contentEditable = 'false';
      boton.className = `tabla-agregar tabla-agregar-${tipo}`;
      boton.setAttribute('aria-label', `Agregar ${tipo}`);
      boton.title = `Agregar ${tipo}`;
      boton.textContent = '+';
      boton.addEventListener('mousedown', (evento) => evento.preventDefault());
      boton.addEventListener('click', () => {
        if (!view.editable) return;
        // Se resuelve al pulsar: otro colaborador puede haber cambiado la tabla.
        // La última celda hace que el nuevo contenido se añada siempre al final.
        const celda = this.contentDOM.lastElementChild?.lastElementChild;
        if (!celda) return;
        const posicion = view.posAtDOM(celda, 0);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(posicion))),
        );
        const agregar = tipo === 'columna' ? addColumnAfter : addRowAfter;
        agregar(view.state, view.dispatch);
        view.focus();
      });
      superficie.append(boton);
    }

    this.handles.className = 'tabla-controles';
    this.handles.contentEditable = 'false';
    superficie.append(this.handles);
    // El popover vive en la capa superior: el scroll de la tabla no recorta el menú.
    this.menu.className = 'tabla-menu';
    this.menu.contentEditable = 'false';
    this.menu.popover = 'auto';
    this.menu.setAttribute('role', 'menu');
    this.menu.addEventListener('toggle', () => {
      this.menuTrigger?.setAttribute('aria-expanded', String(this.menu.matches(':popover-open')));
    });
    this.menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        this.closeMenu();
        this.menuTrigger?.focus();
      }
    });
    this.dom.append(this.menu);
    this.dom.addEventListener('scroll', this.positionMenu);
    this.observer = new ResizeObserver(this.scheduleHandles);
    this.observer.observe(this.table);
    this.observer.observe(this.surface);
    this.scheduleHandles();
  }

  update(node: NodoPM) {
    const changed = node !== this.node;
    if (!super.update(node)) return false;
    // Una edición remota puede desplazar la fila/columna: se cierra el menú anterior.
    if (changed) this.closeMenu();
    this.actualizarAncho();
    this.scheduleHandles();
    return true;
  }

  private closeMenu = () => {
    if (this.menu.matches(':popover-open')) this.menu.hidePopover();
    this.menuTrigger?.setAttribute('aria-expanded', 'false');
  };

  private scheduleHandles = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.renderHandles());
  };

  private selectTarget(kind: 'tabla' | 'fila' | 'columna', index: number) {
    if (!this.view.editable || !this.dom.isConnected) return false;
    const firstCell = this.contentDOM.querySelector('td, th');
    if (!firstCell) return false;
    const $cell = this.view.state.doc.resolve(this.view.posAtDOM(firstCell, 0));
    let depth = $cell.depth;
    while (depth > 0 && $cell.node(depth).type.spec.tableRole !== 'table') depth--;
    if (!depth) return false;
    const start = $cell.start(depth);
    const map = TableMap.get($cell.node(depth));
    let selection;
    if (kind === 'columna') {
      if (index >= map.width) return false;
      selection = CellSelection.colSelection(
        this.view.state.doc.resolve(start + map.map[index]),
        this.view.state.doc.resolve(start + map.map[(map.height - 1) * map.width + index]),
      );
    } else if (kind === 'fila') {
      if (index >= map.height) return false;
      selection = CellSelection.rowSelection(
        this.view.state.doc.resolve(start + map.map[index * map.width]),
        this.view.state.doc.resolve(start + map.map[(index + 1) * map.width - 1]),
      );
    } else {
      selection = new CellSelection(
        this.view.state.doc.resolve(start + map.map[0]),
        this.view.state.doc.resolve(start + map.map[map.map.length - 1]),
      );
    }
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    return true;
  }

  private openMenu(trigger: HTMLButtonElement, kind: 'tabla' | 'fila' | 'columna', index: number) {
    const wasOpen = this.menu.matches(':popover-open') && this.menuTrigger === trigger;
    this.closeMenu();
    if (wasOpen || !this.selectTarget(kind, index)) return;
    this.menuTrigger = trigger;
    const action = document.createElement('button');
    action.type = 'button';
    action.setAttribute('role', 'menuitem');
    action.textContent = `Eliminar ${kind}`;
    action.addEventListener('click', () => {
      this.closeMenu();
      if (!this.selectTarget(kind, index)) return;
      const map = TableMap.get(this.node);
      // ProseMirror no admite tablas sin celdas: al quitar la última se borra el bloque.
      const wholeTable =
        kind === 'tabla' ||
        (kind === 'fila' && map.height === 1) ||
        (kind === 'columna' && map.width === 1);
      const remove = wholeTable ? deleteTable : kind === 'fila' ? deleteRow : deleteColumn;
      remove(this.view.state, this.view.dispatch);
      this.view.focus();
    });
    this.menu.replaceChildren(action);
    this.menu.setAttribute('aria-label', `Opciones de ${kind}`);
    this.menu.showPopover();
    trigger.setAttribute('aria-expanded', 'true');
    this.positionMenu();
    action.focus({ preventScroll: true });
  }

  private positionMenu = () => {
    if (!this.menu.matches(':popover-open') || !this.menuTrigger) return;
    const rect = this.menuTrigger.getBoundingClientRect();
    this.menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - this.menu.offsetWidth - 8))}px`;
    this.menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - this.menu.offsetHeight - 8))}px`;
  };

  private renderHandles() {
    if (!this.dom.isConnected) return;
    // No se reemplaza el botón enfocado al cambiar solamente la selección.
    const map = TableMap.get(this.node);
    const dimensions = `${map.width}:${map.height}`;
    if (this.dimensions !== dimensions) {
      this.dimensions = dimensions;
      this.closeMenu();
      this.handles.replaceChildren();
      for (const kind of ['tabla', 'columna', 'fila'] as const) {
        const total = kind === 'tabla' ? 1 : kind === 'columna' ? map.width : map.height;
        for (let index = 0; index < total; index++) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `tabla-asa tabla-asa-${kind}`;
          button.textContent = kind === 'tabla' ? '⋮⋮' : kind === 'columna' ? '⋯' : '⋮';
          const label = `Opciones de ${kind}${kind === 'tabla' ? '' : ` ${index + 1}`}`;
          button.setAttribute('aria-label', label);
          button.setAttribute('aria-haspopup', 'menu');
          button.setAttribute('aria-expanded', 'false');
          button.title = label;
          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', () => this.openMenu(button, kind, index));
          this.handles.append(button);
        }
      }
    }
    const origin = this.surface.getBoundingClientRect();
    const table = this.table.getBoundingClientRect();
    const buttons = Array.from(this.handles.children) as HTMLButtonElement[];
    buttons[0].style.left = '3px';
    buttons[0].style.top = '3px';
    // Las columnas de una tabla con celdas combinadas conservan su posición lógica.
    let column = 0;
    for (const cell of Array.from(this.table.rows[0]?.cells ?? [])) {
      const rect = cell.getBoundingClientRect();
      for (let span = 0; span < cell.colSpan; span++, column++) {
        const button = buttons[1 + column];
        if (!button) continue;
        button.style.left = `${rect.left - origin.left + (rect.width * (span + 0.5)) / cell.colSpan - 12}px`;
        button.style.top = `${table.top - origin.top - 25}px`;
      }
    }
    Array.from(this.table.rows).forEach((row, index) => {
      const rect = row.getBoundingClientRect();
      const button = buttons[1 + map.width + index];
      button.style.left = `${table.left - origin.left - 25}px`;
      button.style.top = `${rect.top - origin.top + rect.height / 2 - 12}px`;
    });
    this.positionMenu();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.closeMenu();
    this.dom.removeEventListener('scroll', this.positionMenu);
  }

  private actualizarAncho() {
    this.dom.style.setProperty(
      '--tabla-ancho-minimo',
      `${TableMap.get(this.node).width * this.cellMinWidth}px`,
    );
  }

  stopEvent(evento: Event) {
    return (
      evento.target instanceof Element &&
      !!evento.target.closest('.tabla-agregar, .tabla-controles, .tabla-menu')
    );
  }
}
