import {Keys} from "core/dom"
import {UIEvent, GestureEvent, TapEvent, MoveEvent, KeyEvent} from "core/ui_events"
import * as p from "core/properties"
import {isArray} from "core/util/types"
import {MultiLine} from "../../glyphs/multi_line"
import {Patches} from "../../glyphs/patches"
import {GlyphRenderer} from "../../renderers/glyph_renderer"
import {EditTool, EditToolView, HasXYGlyph} from "./edit_tool"

export interface HasPolyGlyph {
  glyph: MultiLine | Patches
}

export class PolyDrawToolView extends EditToolView {
  model: PolyDrawTool
  _drawing: boolean = false

  _tap(ev: TapEvent): void {
    if (this._drawing) {
      this._draw(ev, 'add', true);
    } else
      this._select_event(ev, ev.shiftKey, this.model.renderers);
  }

  _snap_point(ev: UIEvent, x: number, y: number): [number, number] {
    if (this.model.vertex_renderer) {
      // If an existing vertex is hit snap to it
      const vertex_selected = this._select_event(ev, false, [this.model.vertex_renderer]);
      const point_ds = this.model.vertex_renderer.data_source;
      // Type once dataspecs are typed
      const point_glyph: any = this.model.vertex_renderer.glyph;
      const [pxkey, pykey] = [point_glyph.x.field, point_glyph.y.field];
      if (vertex_selected.length) {
        const index = point_ds.selected.indices[0];
        if (pxkey)
          x = point_ds.data[pxkey][index]
        if (pykey)
          y = point_ds.data[pykey][index]
        point_ds.selection_manager.clear()
      }
    }
    return [x, y]
  }

  _draw(ev: UIEvent, mode: string, emit: boolean = false): void {
    const renderer = this.model.renderers[0];
    const point = this._map_drag(ev.sx, ev.sy, renderer);
    if (point == null) {
      return;
    }

    let [x, y] = point;
    [x, y] = this._snap_point(ev, x, y)

    const cds = renderer.data_source;
    const glyph: any = renderer.glyph;
    const [xkey, ykey] = [glyph.xs.field, glyph.ys.field];
    if (mode == 'new') {
      this._pop_glyphs(cds, this.model.num_objects)
      if (xkey) cds.get_array(xkey).push([x, x])
      if (ykey) cds.get_array(ykey).push([y, y])
      this._pad_empty_columns(cds, [xkey, ykey]);
    } else if (mode == 'edit') {
      if (xkey) {
        const xs = cds.data[xkey][cds.data[xkey].length-1];
        xs[xs.length-1] = x;
      }
      if (ykey) {
        const ys = cds.data[ykey][cds.data[ykey].length-1];
        ys[ys.length-1] = y;
      }
    } else if (mode == 'add') {
      if (xkey) {
        const xidx = cds.data[xkey].length-1;
        let xs = cds.get_array<number[]>(xkey)[xidx]
        const nx = xs[xs.length-1];
        xs[xs.length-1] = x;
        if (!isArray(xs)) {
          xs = Array.from(xs)
          cds.data[xkey][xidx] = xs;
        }
        xs.push(nx);
      }
      if (ykey) {
        const yidx = cds.data[ykey].length-1;
        let ys = cds.get_array<number[]>(ykey)[yidx]
        const ny = ys[ys.length-1];
        ys[ys.length-1] = y;
        if (!isArray(ys)) {
          ys = Array.from(ys)
          cds.data[ykey][yidx] = ys;
        }
        ys.push(ny);
      }
    }
    this._emit_cds_changes(cds, true, false, emit)
  }

  _show_vertices(): void {
    const xs: number[] = []
    const ys: number[] = []
    for (let i=0; i<this.model.renderers.length; i++) {
      const renderer = this.model.renderers[i];
      const cds = renderer.data_source;
      const glyph: any = renderer.glyph;
      const [xkey, ykey] = [glyph.xs.field, glyph.ys.field];
      for (const array of cds.get_array(xkey))
        Array.prototype.push.apply(xs, array);
      for (const array of cds.get_array(ykey))
        Array.prototype.push.apply(ys, array);
      if (this._drawing && (i==(this.model.renderers.length-1))) {
        // Skip currently drawn vertex
        xs.splice(xs.length-1, 1)
        ys.splice(ys.length-1, 1)
      }
    }
    const point_glyph: any = this.model.vertex_renderer.glyph;
    const point_cds = this.model.vertex_renderer.data_source;
    const [pxkey, pykey] = [point_glyph.x.field, point_glyph.y.field];
    point_cds.data[pxkey] = xs
    point_cds.data[pykey] = ys
    this._emit_cds_changes(point_cds, true, true, false)
  }

  _doubletap(ev: TapEvent): void {
    if (!this.model.active) { return; }
    if (this._drawing) {
      this._drawing = false;
      this._draw(ev, 'edit', true);
    } else {
      this._drawing = true;
      this._draw(ev, 'new', true);
    }
  }

  _move(ev: MoveEvent): void {
    if (this._drawing) {
      this._draw(ev, 'edit');
    }
  }

  _remove(): void {
    const renderer = this.model.renderers[0];
    const cds = renderer.data_source;
    const glyph: any = renderer.glyph;
    const [xkey, ykey] = [glyph.xs.field, glyph.ys.field];
    if (xkey) {
      const xidx = cds.data[xkey].length-1;
      const xs = cds.get_array<number[]>(xkey)[xidx]
      xs.splice(xs.length-1, 1)
    }
    if (ykey) {
      const yidx = cds.data[ykey].length-1;
      const ys = cds.get_array<number[]>(ykey)[yidx];
      ys.splice(ys.length-1, 1)
    }
    this._emit_cds_changes(cds)
  }

  _keyup(ev: KeyEvent): void {
    if (!this.model.active || !this._mouse_in_frame) { return; }
    for (const renderer of this.model.renderers) {
      if (ev.keyCode === Keys.Backspace) {
        this._delete_selected(renderer);
      } else if (ev.keyCode == Keys.Esc) {
        if (this._drawing) {
          this._remove();
          this._drawing = false;
        }
        renderer.data_source.selection_manager.clear();
      }
    }
  }

  _pan_start(ev: GestureEvent): void {
    if (!this.model.drag) { return; }
    this._select_event(ev, true, this.model.renderers);
    this._basepoint = [ev.sx, ev.sy];
  }

  _pan(ev: GestureEvent): void {
    if (this._basepoint == null || !this.model.drag) { return; }
    const [bx, by] = this._basepoint;
    // Process polygon/line dragging
    for (const renderer of this.model.renderers) {
      const basepoint = this._map_drag(bx, by, renderer);
      const point = this._map_drag(ev.sx, ev.sy, renderer);
      if (point == null || basepoint == null) {
        continue;
      }

      const cds = renderer.data_source;
      // Type once dataspecs are typed
      const glyph: any = renderer.glyph;
      const [xkey, ykey] = [glyph.xs.field, glyph.ys.field];
      if (!xkey && !ykey) { continue; }
      const [x, y] = point;
      const [px, py] = basepoint;
      const [dx, dy] = [x-px, y-py];
      for (const index of cds.selected.indices) {
        let length, xs, ys;
        if (xkey) xs = cds.data[xkey][index]
        if (ykey) {
          ys = cds.data[ykey][index];
          length = ys.length;
        } else {
          length = xs.length;
        }
        for (let i = 0; i < length; i++) {
          if (xs) { xs[i] += dx; }
          if (ys) { ys[i] += dy; }
        }
      }
      cds.change.emit();
    }
    this._basepoint = [ev.sx, ev.sy];
  }

  _pan_end(ev: GestureEvent): void {
    if (!this.model.drag) { return; }
    this._pan(ev);
    for (const renderer of this.model.renderers)
      this._emit_cds_changes(renderer.data_source)
    this._basepoint = null;
  }

  activate(): void {
    if (!this.model.vertex_renderer) { return }
    this._show_vertices()
    for (const renderer of this.model.renderers) {
      const cds = renderer.data_source;
      cds.connect(cds.properties.data.change, () => this._show_vertices())
    }
  }

  deactivate(): void {
    if (this._drawing) {
      this._remove();
      this._drawing = false;
    }
  }
}

export namespace PolyDrawTool {
  export interface Attrs extends EditTool.Attrs {
    drag: boolean
    renderers: (GlyphRenderer & HasPolyGlyph)[]
    num_objects: number
    vertex_renderer: (GlyphRenderer & HasXYGlyph)
  }

  export interface Props extends EditTool.Props {}

}

export interface PolyDrawTool extends PolyDrawTool.Attrs {}

export class PolyDrawTool extends EditTool {

  properties: PolyDrawTool.Props

  renderers: (GlyphRenderer & HasPolyGlyph)[]

  constructor(attrs?: Partial<PolyDrawTool.Attrs>) {
    super(attrs)
  }

  static initClass(): void {
    this.prototype.type = "PolyDrawTool"
    this.prototype.default_view = PolyDrawToolView

    this.define({
      drag: [ p.Bool, true ],
      num_objects: [ p.Int, 0 ],
      vertex_renderer: [ p.Instance ],
    })
  }

  tool_name = "Polygon Draw Tool"
  icon = "bk-tool-icon-poly-draw"
  event_type = ["pan" as "pan", "tap" as "tap", "move" as "move"]
  default_order = 3
}
PolyDrawTool.initClass()
