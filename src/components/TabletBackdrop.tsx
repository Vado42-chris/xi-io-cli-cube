import React, {useEffect, useRef} from 'react';
import {createBackdropMotion} from '../lib/backdropMotion.mjs';
import {cursorLightGradient, cursorLightGeometry, sourcePanelShadow, LIGHT_SETTINGS_QUALIFICATION} from '../lib/source-owned-light/cursorLight.mjs';

/** Existing PNG/parallax and source-owned pointer light share one bounded clock. */
export default function TabletBackdrop() {
  const fieldRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const field=fieldRef.current,product=field?.closest<HTMLElement>('[data-tablet-surface]');
    if(!field||!product)return;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    let ancestor:Element|null=product,scroller:Element|Window=window;
    while(ancestor){
      if(/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY)){scroller=ancestor;break;}
      ancestor=ancestor.parentElement||((ancestor.getRootNode() as ShadowRoot).host??null);
    }
    let tx=0,ty=0,offset=0,pageActive=true,x=0,y=0;
    let bounds={left:0,top:0,width:0,height:0};
    const oldShadow=product.style.getPropertyValue('--workspace-source-shadow');
    product.style.setProperty('--workspace-source-shadow',sourcePanelShadow());
    const light=()=>{
      const geometry=cursorLightGeometry(bounds.width,bounds.height,x,y);
      if(!geometry)return;
      field.style.setProperty('--ca-light-diameter',geometry.diameter+'px');
      field.style.setProperty('--ca-light-x',geometry.x.toFixed(2)+'px');
      field.style.setProperty('--ca-light-y',geometry.y.toFixed(2)+'px');
    };
    const measure=()=>{
      const b=field.getBoundingClientRect();
      bounds={left:b.left,top:b.top,width:b.width,height:b.height};
      light();
    };
    const motion=createBackdropMotion({requestFrame:requestAnimationFrame,cancelFrame:cancelAnimationFrame,
      write:(nextX:number,nextY:number,s:number)=>{
        x=nextX;y=nextY;
        field.style.setProperty('--ca-plate-x',x.toFixed(2)+'px');
        field.style.setProperty('--ca-plate-y',y.toFixed(2)+'px');
        field.style.setProperty('--ca-plate-scroll',s.toFixed(2)+'px');
        light();
      }});
    const availability=()=>{
      motion.enable(pageActive&&!document.hidden&&!media.matches);
      if(media.matches){
        x=0;y=0;
        field.style.setProperty('--ca-plate-x','0px');field.style.setProperty('--ca-plate-y','0px');field.style.setProperty('--ca-plate-scroll','0px');
        light();
      }
    };
    const move=(event:Event)=>{
      if(media.matches||document.hidden||!pageActive)return;
      const e=event as PointerEvent;
      if(!bounds.width||!bounds.height||![e.clientX,e.clientY].every(Number.isFinite))return;
      tx=((e.clientX-bounds.left)/bounds.width-.5)*-34;ty=((e.clientY-bounds.top)/bounds.height-.5)*-22;
      motion.target(tx,ty,offset);
    };
    const scroll=()=>{
      if(document.hidden||!pageActive)return;
      // Bounds change with scrolling; never synchronously measure on pointermove.
      measure();offset=(scroller===window?window.scrollY:(scroller as Element).scrollTop)*-.018;
      motion.target(tx,ty,offset);
    };
    const hide=()=>{pageActive=false;availability();};
    const show=()=>{pageActive=true;measure();availability();};
    const resize=()=>{if(!document.hidden&&pageActive)measure();};
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);
    measure();availability();scroll();observer?.observe(field);
    product.addEventListener('pointermove',move,{passive:true});scroller.addEventListener('scroll',scroll,{passive:true});
    media.addEventListener('change',availability);document.addEventListener('visibilitychange',availability);window.addEventListener('resize',resize);
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);window.addEventListener('blur',hide);window.addEventListener('focus',show);
    return()=>{
      motion.dispose();observer?.disconnect();product.removeEventListener('pointermove',move);scroller.removeEventListener('scroll',scroll);
      media.removeEventListener('change',availability);document.removeEventListener('visibilitychange',availability);window.removeEventListener('resize',resize);
      window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);window.removeEventListener('blur',hide);window.removeEventListener('focus',show);
      if(oldShadow)product.style.setProperty('--workspace-source-shadow',oldShadow);else product.style.removeProperty('--workspace-source-shadow');
    };
  },[]);
  return <div ref={fieldRef} className="ca-brand-field" aria-hidden="true" data-light-settings={LIGHT_SETTINGS_QUALIFICATION}>
    <div className="ca-brand-plate"/><div className="ca-atmosphere"/><div className="ca-vignette"/>
    <div className="ca-cursor-light" data-source-owned-light="node-system-cursor" style={{backgroundImage:cursorLightGradient()}}/>
  </div>;
}
