import React, {useEffect, useRef} from 'react';
import {createBackdropMotion} from '../lib/backdropMotion.mjs';

/** Existing PNG/parallax, event-driven; no continuous idle frame or paint loop. */
export default function TabletBackdrop() {
  const fieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const field=fieldRef.current,product=field?.closest('[data-tablet-surface]');
    if(!field||!product)return;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    let ancestor:Element|null=product,scroller:Element|Window=window;
    while(ancestor){
      if(/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY)){scroller=ancestor;break;}
      ancestor=ancestor.parentElement||((ancestor.getRootNode() as ShadowRoot).host??null);
    }
    let tx=0,ty=0,offset=0,pageActive=true;
    const motion=createBackdropMotion({requestFrame:requestAnimationFrame,cancelFrame:cancelAnimationFrame,
      write:(x:number,y:number,s:number)=>{
        field.style.setProperty('--ca-plate-x',x.toFixed(2)+'px');
        field.style.setProperty('--ca-plate-y',y.toFixed(2)+'px');
        field.style.setProperty('--ca-plate-scroll',s.toFixed(2)+'px');
      }});
    const availability=()=>{
      motion.enable(pageActive&&!document.hidden&&!media.matches);
      if(media.matches){field.style.setProperty('--ca-plate-x','0px');field.style.setProperty('--ca-plate-y','0px');field.style.setProperty('--ca-plate-scroll','0px');}
    };
    const move=(event:Event)=>{
      if(media.matches||document.hidden||!pageActive)return;
      const e=event as PointerEvent,b=field.getBoundingClientRect();if(!b.width||!b.height)return;
      tx=((e.clientX-b.left)/b.width-.5)*-34;ty=((e.clientY-b.top)/b.height-.5)*-22;
      motion.target(tx,ty,offset);
    };
    const scroll=()=>{offset=(scroller===window?window.scrollY:(scroller as Element).scrollTop)*-.018;motion.target(tx,ty,offset);};
    const hide=()=>{pageActive=false;availability();};
    const show=()=>{pageActive=true;availability();};
    availability();scroll();
    product.addEventListener('pointermove',move,{passive:true});scroller.addEventListener('scroll',scroll,{passive:true});
    media.addEventListener('change',availability);document.addEventListener('visibilitychange',availability);
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);window.addEventListener('blur',hide);window.addEventListener('focus',show);
    return()=>{motion.dispose();product.removeEventListener('pointermove',move);scroller.removeEventListener('scroll',scroll);media.removeEventListener('change',availability);document.removeEventListener('visibilitychange',availability);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);window.removeEventListener('blur',hide);window.removeEventListener('focus',show);};
  },[]);
  return <div ref={fieldRef} className="ca-brand-field" aria-hidden="true"><div className="ca-brand-plate"/><div className="ca-atmosphere"/><div className="ca-vignette"/></div>;
}
