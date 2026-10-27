/**
 * THE RESPONSIVE GRID — xiio.responsive-grid/v1
 *
 * ONE GRID, THREE LAYERS.
 *
 * The shell already had a grid. It did not have a DECLARATION of one. The
 * number that answers "what is a phone" was written in four places — 768 in
 * use-mobile, 1024 in use-desktop-width, 1023px in index.css, and 1024 again as
 * an inline check inside FluidGrid — and no two of them were compared to each
 * other because no file held all four. That is the same defect the coordinate
 * space exists to catch, one layer up: a fact carried where a declaration was
 * needed.
 *
 * ── WHY LAYERS, AND WHY THAT IS THE WHOLE POINT ─────────────────────────────
 *
 * A monitor is a FLAT PROJECTION. A person looking at this shell sees one
 * top-down reading of it, at one width, at one moment — and that is not a
 * limitation of the person, it is what a screen IS. So a layout defect that
 * only exists at 900px is invisible to anyone standing at 2552px, and the
 * layout looks perfect right up until somebody opens a laptop.
 *
 * Stacking the breakpoints as layers makes the same object readable from
 * outside the projection. Each layer is the grid at one device, drawn in z
 * above the one below it; where two layers put the same item in the same cell,
 * the cells coincide. Where they do not, the item has MOVED between layers —
 * and that movement is a fact about the layout that no single-width reading can
 * show, because from any one width it is just a different picture.
 *
 * The two readings are one object:
 *
 *   FLAT    what a person sees — the columns of one layer, top down
 *   LAYERS  the stack — every layer at once, in z
 *
 * Neither is the more true one. They are two projections of one declaration,
 * which is the only reason a conversation about them can close.
 *
 * ── WHAT THIS MAPS, AND WHAT IT DOES NOT ────────────────────────────────────
 *
 * It maps the DECLARATION. It computes where cells land at a given width, and
 * it compares placements between layers — arithmetic over declared numbers.
 *
 * It does NOT see rendered pixels. A browser that rounds a cell differently, a
 * font that reflows a row, a scrollbar that takes 15px off the viewport: none
 * of those are visible here, and a map that reported them as observed would be
 * the false green this estate refuses everywhere else. The render readback is
 * owed, and it is named as owed rather than implied by a green grid.
 */

import { DEVICE } from './chatSnap.mjs';

export const SCHEMA = 'xiio.responsive-grid/v1';

/* ── THE LATTICE ─────────────────────────────────────────────────────────────
 *
 * The panel texture is a 12px cell — index.css declares `--grid-cell: 12px` and
 * tiles it under every panel. It is the smallest thing the shell draws, so it
 * is the unit the grid is measured in: a gutter and a margin that are whole
 * multiples of it line up with the texture beneath them, and one that is not
 * puts a column edge half a cell off the lattice it is drawn on.
 *
 * 15px is the number the shell actually used in a dozen places. It is not a
 * multiple of 12, which is exactly the kind of drift a declared unit catches
 * and a hand-picked number never does.
 */
export const LATTICE_PX = 12;

const onLattice = (value) => Number.isInteger(value) && value > 0 && value % LATTICE_PX === 0;

/* ── THE BREAKPOINTS ─────────────────────────────────────────────────────────
 *
 * Declared ONCE, and they are the numbers the estate was already using — this
 * does not move a single existing layout. What changes is that the four copies
 * become one declaration, so the next reader compares rather than re-guesses.
 *
 * A breakpoint is INCLUSIVE at its own width: DESKTOP begins at 1024, which is
 * the same `min-width` use-desktop-width already publishes and the same `lg:`
 * Tailwind already resolves.
 */
export const BREAKPOINTS = Object.freeze([
  Object.freeze({ device: DEVICE.MOBILE, min_width: 0, columns: 4, gutter: 12, margin: 12 }),
  Object.freeze({ device: DEVICE.TABLET, min_width: 768, columns: 8, gutter: 12, margin: 12 }),
  Object.freeze({ device: DEVICE.DESKTOP, min_width: 1024, columns: 12, gutter: 12, margin: 12 }),
]);

/* ── THE Z-STACK ─────────────────────────────────────────────────────────────
 *
 * The layers, narrowest at the bottom. `z` is the order a person would stack
 * them to read the whole set at once: the phone grid lies on the table, the
 * tablet grid on top of it, the desktop grid on top of that. Reading DOWN
 * through the stack is reading from widest to narrowest — which is the
 * direction a layout actually degrades.
 */
export function layers(breakpoints = BREAKPOINTS) {
  return [...breakpoints]
    .sort((a, b) => a.min_width - b.min_width)
    .map((bp, index) => ({ ...bp, z: index, label: `${bp.device} ≥${bp.min_width}` }));
}

/* Which layer a real width falls on. The widest breakpoint the width clears. */
export function layerFor(widthPx, breakpoints = BREAKPOINTS) {
  if (!Number.isFinite(widthPx) || widthPx < 0) {
    return { ok: false, first_red: 'WIDTH_NOT_A_READING' };
  }
  const cleared = breakpoints.filter((bp) => widthPx >= bp.min_width);
  if (cleared.length === 0) return { ok: false, first_red: 'BELOW_EVERY_BREAKPOINT' };
  const bp = cleared[cleared.length - 1];
  return { ok: true, device: bp.device, min_width: bp.min_width, columns: bp.columns };
}

/* ── CELLS ───────────────────────────────────────────────────────────────────
 *
 * The arithmetic, at a real width. Reported, never asserted: a cell that does
 * not land on the lattice is a READING about that width, not a failure of the
 * grid — at most widths it will not, and rounding is not drift.
 */
export function cells(device, widthPx, breakpoints = BREAKPOINTS) {
  const bp = breakpoints.find((b) => b.device === device);
  if (!bp) return { ok: false, first_red: 'UNDECLARED_DEVICE' };
  if (!Number.isFinite(widthPx) || widthPx <= 0) return { ok: false, first_red: 'WIDTH_NOT_A_READING' };

  const usable = widthPx - bp.margin * 2 - bp.gutter * (bp.columns - 1);
  if (usable <= 0) return { ok: false, first_red: 'NO_ROOM_FOR_COLUMNS', device, widthPx };

  const cellPx = usable / bp.columns;
  return {
    ok: true,
    device,
    widthPx,
    columns: bp.columns,
    cellPx,
    on_lattice: Number.isInteger(cellPx) && cellPx % LATTICE_PX === 0,
  };
}

/* ── PLACEMENT ───────────────────────────────────────────────────────────────
 *
 * Where one item sits on one layer: which columns it spans, as a set of cell
 * ordinals. Held as a SET rather than as start+span because the question this
 * module answers is "do these two layers put it in the same cells", and that is
 * a question about membership.
 */
export function place(item = {}, device) {
  const bp = BREAKPOINTS.find((b) => b.device === device);
  if (!bp) return { ok: false, first_red: 'UNDECLARED_DEVICE' };

  const span = item[device]?.span ?? null;
  const start = item[device]?.start ?? 1;

  if (span == null) return { ok: false, first_red: 'NO_PLACEMENT_ON_THIS_LAYER', device, item_ref: item.ref ?? null };
  if (!Number.isInteger(span) || span < 1) return { ok: false, first_red: 'SPAN_NOT_A_COUNT', device };
  if (!Number.isInteger(start) || start < 1) return { ok: false, first_red: 'START_NOT_A_COLUMN', device };
  if (start + span - 1 > bp.columns) {
    return {
      ok: false,
      first_red: 'PLACEMENT_OUT_OF_RANGE',
      device,
      inequality: `${start}+${span}-1 > ${bp.columns}`,
      why: 'the item runs past the last column on this layer, so it has no cell set to compare',
    };
  }

  return {
    ok: true,
    device,
    item_ref: item.ref ?? null,
    start,
    span,
    cells: Array.from({ length: span }, (_, i) => start + i),
  };
}

/* ── THE OVERLAP ─────────────────────────────────────────────────────────────
 *
 * The question the layers exist to answer: do two layers put this item in the
 * same cells?
 *
 *   SAME      identical sets — the item does not move between these layers
 *   NARROWER  this layer is a strict subset — it shrinks going down
 *   WIDER     strict superset — it grows
 *   DRIFTED   they share cells but neither contains the other, so the item has
 *             slid sideways as well as changed width
 *   DISJOINT  no shared cell at all
 *
 * DRIFTED is the one worth having. SAME and the two size changes are all
 * legible from a single width if you happen to look at the right one; a
 * placement that slides sideways while staying the same width is invisible from
 * every width, because at each one it looks deliberate.
 */
export function overlap(a, b) {
  if (!a?.ok || !b?.ok) {
    return { state: 'UNOBSERVED', shared: [], first_red: a?.first_red ?? b?.first_red ?? 'NO_PLACEMENTS' };
  }

  const setA = new Set(a.cells);
  const setB = new Set(b.cells);
  const shared = a.cells.filter((c) => setB.has(c));
  const aInB = shared.length === setA.size;
  const bInA = shared.length === setB.size;

  let state;
  if (shared.length === 0) state = 'DISJOINT';
  else if (aInB && bInA) state = 'SAME';
  else if (aInB) state = 'NARROWER';
  else if (bInA) state = 'WIDER';
  else state = 'DRIFTED';

  return {
    state,
    from: a.device,
    to: b.device,
    shared,
    shared_count: shared.length,
    moved: state !== 'SAME',
    first_red: state === 'DRIFTED' ? 'PLACEMENT_SLID_SIDEWAYS' : null,
  };
}

/* ── THE MAP ─────────────────────────────────────────────────────────────────
 *
 * The whole thing, in both readings at once.
 *
 * `flat` is what a person sees: the columns of one layer at one width, top
 * down. `layers` is the stack, every layer at once, in z. They are computed
 * from the same declaration in the same call, so they cannot describe two
 * different grids — which is the only reason the conversation between them can
 * close.
 */
export function mapGrid({ items = [], widthPx = 2552 } = {}) {
  const stack = layers();
  const flat = layerFor(widthPx);
  const readings = stack.map((layer) => ({
    ...layer,
    cells: cells(layer.device, widthPx),
  }));

  const placed = items.map((item) => {
    const perLayer = {};
    for (const layer of stack) perLayer[layer.device] = place(item, layer.device);

    /* Adjacent-layer movement only. Comparing every pair would report the
       desktop→mobile jump twice — once directly and once through the tablet —
       and a map that counts one movement twice is a map that overstates drift. */
    const movements = [];
    for (let i = 0; i < stack.length - 1; i += 1) {
      const from = perLayer[stack[i].device];
      const to = perLayer[stack[i + 1].device];
      if (!from.ok || !to.ok) continue;
      const o = overlap(from, to);
      if (o.moved) movements.push(o);
    }

    return {
      item_ref: item.ref ?? null,
      per_layer: perLayer,
      movements,
      /* An item placed on ONE layer and nowhere else has not drifted — it has
         not been declared on the others, which is a gap and not a movement. */
      undeclared_layers: stack.filter((l) => !perLayer[l.device].ok).map((l) => l.device),
      stable: movements.length === 0 && stack.every((l) => perLayer[l.device].ok),
    };
  });

  /* Two different facts, and they were one word until the map said so.
   *
   * CHANGED is the grid working: an item that spans twelve columns on desktop
   * and four on a phone occupies different cells on each layer, and that is the
   * whole point of having layers. Calling it unstable would have marked every
   * correctly responsive item as a defect and buried the one that matters.
   *
   * DRIFTED is the defect: cells differ WITHOUT either set containing the
   * other, so the item slid sideways as well as resized. */
  const drifted = placed.filter((p) => p.movements.some((m) => m.state === 'DRIFTED'));
  const changed = placed.filter((p) => p.movements.length > 0);

  return {
    schema: SCHEMA,
    widthPx,
    flat: flat.ok ? { device: flat.device, columns: flat.columns } : { first_red: flat.first_red },
    layers: readings,
    items: placed,
    drifted: drifted.map((p) => p.item_ref),
    changed: changed.length,
    /* What this map is, stated on the map. Arithmetic over the declaration —
       not a render readback, which is owed. */
    reading: 'DECLARATION_ONLY',
    render_readback: 'OWED',
    result: drifted.length ? 'DRIFTED' : changed.length ? 'CHANGED' : 'STABLE',
    first_red: drifted[0]?.movements.find((m) => m.state === 'DRIFTED')?.first_red ?? null,
  };
}

/* ── ADMISSION ───────────────────────────────────────────────────────────────
 *
 * Fail-closed, on the declaration itself. These are the things that make the
 * map meaningless rather than wrong, so they are refused before it is drawn.
 */
export function admitGrid(breakpoints = BREAKPOINTS) {
  const refusals = [];

  const devices = breakpoints.map((b) => b.device);
  const widths = breakpoints.map((b) => b.min_width);
  if (new Set(devices).size !== devices.length) {
    refusals.push({ code: 'DEVICE_DECLARED_TWICE', why: 'two breakpoints answer for one device, so a width has two answers' });
  }
  if (new Set(widths).size !== widths.length) {
    refusals.push({ code: 'TWO_BREAKPOINTS_AT_ONE_WIDTH', why: 'two layers begin at the same width, so the stack has no order there' });
  }
  if (widths.some((w, i) => i > 0 && w <= widths[i - 1])) {
    refusals.push({ code: 'STACK_NOT_ORDERED', why: 'the breakpoints do not increase, so the layers cannot be stacked' });
  }
  if (!breakpoints.some((b) => b.min_width === 0)) {
    refusals.push({ code: 'NO_FLOOR_LAYER', why: 'no breakpoint starts at 0, so a narrow width falls off the stack entirely' });
  }

  /* The lattice. A gutter or margin that is not a whole cell puts a column edge
     off the texture the panel is drawn on. */
  for (const bp of breakpoints) {
    if (!onLattice(bp.gutter)) refusals.push({ code: 'GUTTER_OFF_THE_LATTICE', device: bp.device, value: bp.gutter, why: `${bp.gutter} is not a whole ${LATTICE_PX}px cell` });
    if (!onLattice(bp.margin)) refusals.push({ code: 'MARGIN_OFF_THE_LATTICE', device: bp.device, value: bp.margin, why: `${bp.margin} is not a whole ${LATTICE_PX}px cell` });
    if (!Number.isInteger(bp.columns) || bp.columns < 1) {
      refusals.push({ code: 'COLUMNS_NOT_A_COUNT', device: bp.device, why: 'a grid with no columns has nothing to place into' });
    }
  }

  /* The grid must DEGRADE: 4 columns where there is no room, more as there is.
   *
   * So the refusal is a WIDER layer carrying FEWER columns than a narrower one
   * — a desktop handed a phone's grid. The comparison is the easy thing in this
   * file to get backwards, and it was: written as `>` it fired on a perfectly
   * degrading 4→8→12 grid, refusing the very layout it exists to admit. A check
   * that rejects the correct case is worse than no check, because it is the one
   * a reader learns to route around. */
  const ordered = [...breakpoints].sort((a, b) => a.min_width - b.min_width);
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].columns < ordered[i - 1].columns) {
      refusals.push({
        code: 'WIDER_LAYER_NARROWER_GRID',
        device: ordered[i].device,
        inequality: `${ordered[i - 1].columns} > ${ordered[i].columns}`,
        why: 'a wider layer carries fewer columns than a narrower one, so the grid does not open up as there is room',
      });
    }
  }

  const admitted = refusals.length === 0;
  return {
    schema: SCHEMA,
    admitted,
    layers: ordered.length,
    lattice_px: LATTICE_PX,
    refusals,
    first_red: refusals[0]?.code ?? null,
  };
}