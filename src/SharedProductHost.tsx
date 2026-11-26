import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {NativeProductWindowShell, useThemeMode, setThemeMode} from './shared/window-frame.mjs';
import {Grid, Download, Wrench, Calculator, Sun, Moon} from 'lucide-react';
import ArtcraftLauncherBody from './components/ArtcraftLauncherBody';
import {loadPackagedArtcraftLauncher} from './lib/artcraftLauncherAssets.mjs';
import NativeInstallerPanel from './components/NativeInstallerPanel';
import HexLocalTools from './components/HexLocalTools';
import Snap55Workbench from './components/Snap55Workbench';
import TabletBackdrop from './components/TabletBackdrop';
import brandPlate from './assets/brand/7d133412d_blue-bg.png';
import {nativeInstallerAvailable} from './lib/nativeInstaller.mjs';
import productStyles from './index.css?inline';
type View = 'software' | 'install' | 'tools' | 'maths';

// Current shell and installer custody remain. Artcraft owns only Software.
function CubeProductContent({view, onReviewInstallation}: {view: View; onReviewInstallation: () => void}) {
  const host = useRef<HTMLDivElement>(null);
  const launcherLifecycle = useRef<{pending: Promise<void>; cleanupFailure: string | null}>({pending: Promise.resolve(), cleanupFailure: null});
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const theme = useThemeMode();
  useEffect(() => {
    if (host.current) setRoot(host.current.shadowRoot || host.current.attachShadow({mode: 'open'}));
  }, []);
  return <div ref={host} className="h-full min-h-0" data-hex-product-content="artcraft-hosted">
    {root && createPortal(<>
      <style>{productStyles}</style>
      <div className="h-full min-h-0 flex flex-col" data-hex-workspace data-product-theme={theme}>
        <div className="hex-product-toolbar flex items-center justify-between shrink-0 px-3 py-2 text-workspace-text">
          <span className="font-semibold">{view === 'software' ? 'Software' : view === 'install' ? 'Install XI-IO CLI' : view === 'tools' ? 'Local tools' : 'Maths'}</span>
          <button type="button" className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center border border-workspace-border-strong"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`}
            onClick={() => setThemeMode(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
        </div>
        {view === 'software' && <div className="flex-1 min-h-0">
          <ArtcraftLauncherBody loadModule={loadPackagedArtcraftLauncher} lifecycle={launcherLifecycle.current} onReviewInstallation={onReviewInstallation} appearance={theme === 'dark' ? 'dark' : 'light'} />
        </div>}
        <div hidden={view === 'software'} style={{display: view === 'software' ? 'none' : undefined, '--workspace-plate-image': `url(${brandPlate})`} as React.CSSProperties}
          className="relative flex-1 min-h-0 overflow-auto" data-tablet-surface>
          <TabletBackdrop />
          {/* Keep exact installer plan, consent and uncertain outcomes alive. */}
          <div className="hex-workspace-layout relative" hidden={view !== 'install'} style={{display: view === 'install' ? undefined : 'none'}}>
            <NativeInstallerPanel />
          </div>
          <div className="hex-workspace-layout relative" hidden={view !== 'tools'} style={{display: view === 'tools' ? undefined : 'none'}}>
            <HexLocalTools active={view === 'tools'} />
          </div>
          <div className="hex-workspace-layout relative" hidden={view !== 'maths'} style={{display: view === 'maths' ? undefined : 'none'}}>
            <Snap55Workbench />
          </div>
        </div>
      </div>
    </>, root)}
  </div>;
}
export default function SharedProductHost() {
  const product = {id: 'hex', title: 'XI-IO HEX', theme: 'cyan-500'};
  const [view, setView] = useState<View>('software');
  const onReviewInstallation = useCallback(() => setView('install'), []);
  const tabs = [
    {id: 'software', label: 'Software', icon: Grid},
    {id: 'install', label: 'Install', icon: Download},
    {id: 'tools', label: 'Tools', icon: Wrench},
    {id: 'maths', label: 'Maths', icon: Calculator},
  ];
  const onTabChange = (id: string) => {
    if (id === 'software' || id === 'install' || id === 'tools' || id === 'maths') setView(id);
  };
  return <NativeProductWindowShell product={product} isAuthenticated={false} controlsAvailable={nativeInstallerAvailable()}
    tabs={tabs} activeTab={view} onTabChange={onTabChange}>
    <CubeProductContent view={view} onReviewInstallation={onReviewInstallation} />
  </NativeProductWindowShell>;
}
