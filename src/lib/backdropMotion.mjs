// Existing backdrop interpolation, now event-driven and bounded when idle.
export function createBackdropMotion({requestFrame,cancelFrame,write,onRunning=()=>{}}) {
  let x=0,y=0,tx=0,ty=0,scroll=0,lastScroll=0,frame=0,enabled=true,disposed=false;
  const epsilon=.04;
  function schedule(){if(!enabled||disposed||frame)return;onRunning(true);frame=requestFrame(tick);}
  function tick(){
    frame=0;if(!enabled||disposed){onRunning(false);return;}
    x+=(tx-x)*.055;y+=(ty-y)*.055;
    if(Math.abs(tx-x)<epsilon)x=tx;if(Math.abs(ty-y)<epsilon)y=ty;
    write(x,y,scroll);lastScroll=scroll;
    if(x!==tx||y!==ty)schedule();else onRunning(false);
  }
  return {
    target(nextX,nextY,nextScroll=scroll){
      if(disposed||![nextX,nextY,nextScroll].every(Number.isFinite))return;
      tx=Math.max(-17,Math.min(17,nextX));ty=Math.max(-11,Math.min(11,nextY));scroll=nextScroll;
      if(x!==tx||y!==ty||scroll!==lastScroll)schedule();
    },
    enable(value){enabled=Boolean(value);if(!enabled){if(frame)cancelFrame(frame);frame=0;onRunning(false);}else if(x!==tx||y!==ty||scroll!==lastScroll)schedule();},
    dispose(){disposed=true;if(frame)cancelFrame(frame);frame=0;onRunning(false);},
  };
}
