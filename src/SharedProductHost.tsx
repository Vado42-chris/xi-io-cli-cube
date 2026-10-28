import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {NativeProductWindowShell} from './shared/window-frame.mjs';
import App, {type ProductNavigation} from './App';
import NativePluginMarketplace from './components/NativePluginMarketplace';
import {Compass, Grid, Download, Activity, History, Puzzle} from 'lucide-react';
import {nativeInstallerAvailable} from './lib/nativeInstaller.mjs';
import productStyles from './index.css?inline';

// Product content retains its accepted Tailwind-4 layout. A ShadowRoot prevents
// its utility rules from repainting the canonical Tailwind-3 window controls.
// This is CSS containment, not a second window or a private copy of the frame.
function CubeProductContent({navigation, onNavigate, pluginsVisible}: {navigation: ProductNavigation; onNavigate: (patch: Partial<ProductNavigation>) => void; pluginsVisible:boolean}) {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    if (host.current) setRoot(host.current.shadowRoot || host.current.attachShadow({mode: 'open'}));
  }, []);
  return <div ref={host} className="h-full min-h-0" data-hex-product-content="accepted-cube">
    {root && createPortal(<><style>{productStyles}</style>{pluginsVisible ? <div className="p-5" data-hex-plugin-native-panel="v1"><NativePluginMarketplace /></div> : <App embedded navigation={navigation} onNavigate={onNavigate} />}</>, root)}
  </div>;
}

export default function SharedProductHost() {
  // Owner-directed HEX accent uses the existing Node cyan-500 token (hue 188).
  // This completes the current binding; it does not assert a recovered historical registry entry.
  // Account tools/settings and Return to Studio remain unbound; do not fake a
  // provider or guess a destination. The local installer explains its capability.
  const product = {id: 'hex', title: 'XI-IO HEX', theme: 'cyan-500'};
  const [navigation, setNavigation] = useState<ProductNavigation>({perspective: 'client', activeView: 'catalog'});
  const [pluginsVisible, setPluginsVisible] = useState(false);
  const navigate = (patch: Partial<ProductNavigation>) => setNavigation(current => ({...current, ...patch}));
  const tabs = [
    {id: 'setup', label: 'Setup', icon: Compass},
    {id: 'catalog', label: 'Software', icon: Grid},
    {id: 'plugins', label: 'Plugins', icon: Puzzle},
    {id: 'installer', label: 'Install', icon: Download},
    {id: 'status-dashboard', label: 'Status', icon: Activity},
    {id: 'rebaseline', label: 'Onboarding', icon: History},
  ];
  const onTabChange = (id: string) => {
    if (id === 'plugins') { setPluginsVisible(true); return; }
    setPluginsVisible(false);
    if (id === 'setup') navigate({perspective: 'client'});
    else if (tabs.some(tab => tab.id === id)) navigate({perspective: 'auditor', activeView: id as ProductNavigation['activeView']});
  };
  return <NativeProductWindowShell product={product} isAuthenticated={false} controlsAvailable={nativeInstallerAvailable()}
    tabs={tabs} activeTab={pluginsVisible ? 'plugins' : navigation.perspective === 'client' ? 'setup' : navigation.activeView} onTabChange={onTabChange}>
    <CubeProductContent navigation={navigation} onNavigate={navigate} pluginsVisible={pluginsVisible} />
  </NativeProductWindowShell>;
}
