import React, {useEffect, useRef} from 'react';

/** Existing .ca backdrop behavior, scoped to this product and cleaned up on exit. */
export default function TabletBackdrop() {
  const fieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const field = fieldRef.current;
    const product = field?.closest('[data-tablet-surface]');
    if (!field || !product) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let dispose = () => {};
    const activate = () => {
      dispose();
      field.style.setProperty('--ca-plate-x', '0px');
      field.style.setProperty('--ca-plate-y', '0px');
      field.style.setProperty('--ca-plate-scroll', '0px');
      if (media.matches) return;
      // The product may live in a ShadowRoot inside the tablet's scroll plane.
      let ancestor: Element | null = product;
      let scroller: Element | Window = window;
      while (ancestor) {
        if (/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY)) {scroller = ancestor; break;}
        ancestor = ancestor.parentElement || ((ancestor.getRootNode() as ShadowRoot).host ?? null);
      }
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
      const move = (event: Event) => {
        const e = event as PointerEvent, bounds = field.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        tx = ((e.clientX - bounds.left) / bounds.width - .5) * -34;
        ty = ((e.clientY - bounds.top) / bounds.height - .5) * -22;
      };
      const scroll = () => field.style.setProperty('--ca-plate-scroll',
        ((scroller === window ? window.scrollY : (scroller as Element).scrollTop) * -.018).toFixed(2) + 'px');
      const tick = () => {
        cx += (tx - cx) * .055; cy += (ty - cy) * .055;
        field.style.setProperty('--ca-plate-x', cx.toFixed(2) + 'px');
        field.style.setProperty('--ca-plate-y', cy.toFixed(2) + 'px');
        raf = requestAnimationFrame(tick);
      };
      product.addEventListener('pointermove', move, {passive: true});
      scroller.addEventListener('scroll', scroll, {passive: true});
      scroll(); raf = requestAnimationFrame(tick);
      dispose = () => {
        cancelAnimationFrame(raf);
        product.removeEventListener('pointermove', move);
        scroller.removeEventListener('scroll', scroll);
      };
    };
    activate();
    media.addEventListener('change', activate);
    const leave = () => dispose();
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', activate);
    return () => {dispose(); media.removeEventListener('change', activate); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', activate);};
  }, []);
  return <div ref={fieldRef} className="ca-brand-field" aria-hidden="true">
    <div className="ca-brand-plate" /><div className="ca-atmosphere" /><div className="ca-vignette" />
  </div>;
}

