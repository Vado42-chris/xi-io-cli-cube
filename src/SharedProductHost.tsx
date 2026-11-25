import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {NativeProductWindowShell, useThemeMode} from './shared/window-frame.mjs';
import {Library, Download, Wrench, Calculator} from 'lucide-react';
import HexProductMicrosites, {type HexProductRoute} from './components/HexProductMicrosites';
import NativeInstallerPanel from './components/NativeInstallerPanel';
import HexLocalTools from './components/HexLocalTools';
import Snap55Workbench from './components/Snap55Workbench';
import {normalizeHexProductRoute} from './lib/hexProductContent';
import {nativeInstallerAvailable} from './lib/nativeInstaller.mjs';
import productStyles from './index.css?inline';

type View = 'products' | 'tools' | 'maths';

// Contain product styles inside the existing native shell. The content and its
// installer keep their React identities when the user moves between routes.
function CubeProductContent({view, route, onNavigate}: {view: View; route: HexProductRoute; onNavigate: (route: HexProductRoute) => void}) {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const theme = useThemeMode();
  useEffect(() => {
    if (host.current) setRoot(host.current.shadowRoot || host.current.attachShadow({mode: 'open'}));
  }, []);
  return <div ref={host} className="h-full min-h-0" data-hex-product-content="product-microsites">
    {root && createPortal(<>
      <style>{productStyles}</style>
      <div hidden={view !== 'products'} style={{display: view === 'products' ? undefined : 'none'}}>
        <HexProductMicrosites route={route} onNavigate={onNavigate} installer={<NativeInstallerPanel />} />
      </div>
      <div data-hex-workspace data-product-theme={theme} hidden={view !== 'tools'} style={{display: view === 'tools' ? undefined : 'none'}}>
        <HexLocalTools />
      </div>
      <div data-hex-workspace data-product-theme={theme} hidden={view !== 'maths'} style={{display: view === 'maths' ? undefined : 'none'}} className="p-6">
        <Snap55Workbench />
      </div>
    </>, root)}
  </div>;
}

export default function SharedProductHost() {
  const product = {id: 'hex', title: 'XI-IO HEX', theme: 'cyan-500'};
  const [view, setView] = useState<View>('products');
  const [route, setRoute] = useState<HexProductRoute>({productId: null, page: 'overview'});
  function navigate(next: HexProductRoute) {
    setRoute(normalizeHexProductRoute(next));
    setView('products');
  }
  const tabs = [
    {id: 'library', label: 'Library', icon: Library},
    {id: 'install', label: 'Install', icon: Download},
    {id: 'tools', label: 'Tools', icon: Wrench},
    {id: 'maths', label: 'Maths', icon: Calculator},
  ];
  const activeTab = view === 'products' ? (route.page === 'install' ? 'install' : 'library') : view;
  const onTabChange = (id: string) => {
    if (id === 'library') navigate({productId: null, page: 'overview'});
    else if (id === 'install') navigate({productId: route.productId ?? 'cli', page: 'install'});
    else if (id === 'tools' || id === 'maths') setView(id);
  };
  return <NativeProductWindowShell product={product} isAuthenticated={false} controlsAvailable={nativeInstallerAvailable()}
    tabs={tabs} activeTab={activeTab} onTabChange={onTabChange}>
    <CubeProductContent view={view} route={route} onNavigate={navigate} />
  </NativeProductWindowShell>;
}
