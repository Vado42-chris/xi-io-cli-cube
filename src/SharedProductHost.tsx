import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {NativeProductWindowShell} from './shared/window-frame.mjs';
import App from './App';
import {nativeInstallerAvailable} from './lib/nativeInstaller.mjs';
import productStyles from './index.css?inline';

// Product content retains its accepted Tailwind-4 layout. A ShadowRoot prevents
// its utility rules from repainting the canonical Tailwind-3 window controls.
// This is CSS containment, not a second window or a private copy of the frame.
function CubeProductContent() {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    if (host.current) setRoot(host.current.shadowRoot || host.current.attachShadow({mode: 'open'}));
  }, []);
  return <div ref={host} className="h-full min-h-0" data-hex-product-content="accepted-cube">
    {root && createPortal(<><style>{productStyles}</style><App embedded /></>, root)}
  </div>;
}

export default function SharedProductHost() {
  // HEX product content is known; a canonical HEX Chroma/route binding was not
  // recovered. Do not silently borrow BINS/Switchboard's product hue.
  // Account tools/settings and Return to Studio remain unbound; do not fake a
  // provider or guess a destination. The local installer explains its capability.
  const product = {id: 'hex', title: 'XI-IO HEX'};
  return <NativeProductWindowShell product={product} isAuthenticated={false} controlsAvailable={nativeInstallerAvailable()}>
    <CubeProductContent />
  </NativeProductWindowShell>;
}
