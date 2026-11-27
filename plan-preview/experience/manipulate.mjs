// ESS direct manipulation: grab a point on an engineering diagram and move it; the model reruns as you move.
// Reusable for suspension pickups, ballast/CG placement, traction-circle demand, aero geometry and similar.
//
// Principles (owner direction 25 Nov)
//  - Every handle is a real <button> laid over the diagram (SVG or canvas): focusable, labelled, 44 px target.
//  - Pointer input (mouse, trackpad, pen, touch) uses pointer capture on the handle only. Only handles set
//    touch-action: none, so touching anywhere else on the diagram still scrolls the page on a phone.
//  - Keyboard: arrow keys move by the unit-appropriate step; Shift = ×10, Alt = fine (×0.1); Home resets this
//    point; Escape during a drag cancels it. No hover-only behaviour.
//  - Handles never hold state: they call onMove(id, point) with model coordinates; the page updates its single
//    model state and calls refresh(). Sliders and number fields use the same state, so all inputs agree.

/**
 * attachHandles(layer, opts) → { refresh(), destroy() }
 *  layer: element positioned over the diagram (position:absolute; inset:0) that will hold the buttons.
 *  opts.handles(): [{ id, point:[x, y], label, axes: 'xy'|'x'|'y', step:[dx, dy] (model units), describe(point) }]
 *  opts.toScreen([x, y]) → [px, py] in layer pixels; opts.toModel([px, py]) → [x, y]
 *  opts.clamp(id, point) → point (limits, constraints); opts.onMove(id, point, phase) phase: 'move'|'end'|'cancel'
 *  opts.onReset(id); opts.announce(text) (optional live-region callback)
 */
export function attachHandles(layer, opts) {
  let active = null; // { id, start, pointerId, frame, pending }
  const byId = new Map();

  function place() {
    const list = opts.handles();
    const keep = new Set(list.map(h => h.id));
    for (const [id, el] of byId) if (!keep.has(id)) { el.remove(); byId.delete(id); }
    for (const h of list) {
      let el = byId.get(h.id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'dm-handle';
        el.dataset.dm = h.id;
        el.innerHTML = '<span aria-hidden="true"></span>';
        layer.append(el);
        byId.set(h.id, el);
      }
      const [px, py] = opts.toScreen(h.point);
      el.style.left = px + 'px';
      el.style.top = py + 'px';
      el.dataset.axes = h.axes ?? 'xy';
      el.classList.toggle('dm-selected', Boolean(h.selected));
      el.setAttribute('aria-label', `${h.label}: ${h.describe ? h.describe(h.point) : ''}. Drag, or use arrow keys${h.axes === 'y' ? ' up and down' : h.axes === 'x' ? ' left and right' : ''}; Home resets.`);
      el.title = h.label;
    }
  }

  const handleOf = id => opts.handles().find(h => h.id === id);
  const local = event => {
    const r = layer.getBoundingClientRect();
    return [event.clientX - r.left, event.clientY - r.top];
  };
  const constrain = (h, p) => {
    const q = [h.axes === 'y' ? h.point[0] : p[0], h.axes === 'x' ? h.point[1] : p[1]];
    return opts.clamp ? opts.clamp(h.id, q) : q;
  };
  function emit(id, point, phase) {
    opts.onMove(id, point, phase);
    place();
  }

  function down(event) {
    const el = event.target.closest('.dm-handle');
    if (!el || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const h = handleOf(el.dataset.dm);
    if (!h) return;
    event.preventDefault();
    el.setPointerCapture?.(event.pointerId);
    el.focus({ preventScroll: true });
    active = { id: h.id, start: [...h.point], pointerId: event.pointerId, grab: (() => { const m = opts.toModel(local(event)); return [h.point[0] - m[0], h.point[1] - m[1]]; })() };
    el.classList.add('dm-dragging');
  }
  function move(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const h = handleOf(active.id);
    const m = opts.toModel(local(event));
    active.pending = constrain(h, [m[0] + active.grab[0], m[1] + active.grab[1]]);
    if (active.frame) return;
    active.frame = requestAnimationFrame(() => { if (!active) return; active.frame = 0; emit(active.id, active.pending, 'move'); });
  }
  function up(event, cancel = false) {
    if (!active || (event && event.pointerId !== active.pointerId)) return;
    const { id, start, pending, frame } = active;
    if (frame) cancelAnimationFrame(frame);
    byId.get(id)?.classList.remove('dm-dragging');
    active = null;
    if (cancel) emit(id, start, 'cancel');
    else emit(id, pending ?? start, 'end');
    const h = handleOf(id);
    if (h && opts.announce) opts.announce(`${h.label}: ${h.describe ? h.describe(h.point) : ''}`);
  }
  function key(event) {
    const el = event.target.closest('.dm-handle');
    if (!el) return;
    const h = handleOf(el.dataset.dm);
    if (!h) return;
    if (event.key === 'Escape' && active) { event.preventDefault(); up(null, true); return; }
    if (event.key === 'Home') { event.preventDefault(); opts.onReset?.(h.id); place(); return; }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!dir) return;
    if ((h.axes === 'y' && dir[0]) || (h.axes === 'x' && dir[1])) return; // let the page scroll on unused axes
    event.preventDefault();
    const scale = event.shiftKey ? 10 : event.altKey ? .1 : 1;
    const step = h.step ?? [.1, .1];
    const next = constrain(h, [h.point[0] + dir[0] * step[0] * scale, h.point[1] + dir[1] * step[1] * scale]);
    emit(h.id, next, 'end');
    const after = handleOf(h.id);
    if (opts.announce && after) opts.announce(`${after.label}: ${after.describe ? after.describe(after.point) : ''}`);
  }

  layer.addEventListener('pointerdown', down);
  layer.addEventListener('pointermove', move);
  layer.addEventListener('pointerup', e => up(e));
  layer.addEventListener('pointercancel', e => up(e, true));
  layer.addEventListener('lostpointercapture', e => { if (active && e.pointerId === active.pointerId) up(e); });
  layer.addEventListener('keydown', key);
  place();
  return {
    refresh: place,
    destroy() { layer.replaceChildren(); byId.clear(); },
    get dragging() { return Boolean(active); },
  };
}
