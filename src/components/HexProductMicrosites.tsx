import React, {useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Boxes, FileText, Gamepad2, LayoutGrid, Search, ShieldCheck, Sparkles, Sun, Moon, Terminal, type LucideIcon} from 'lucide-react';
import {useThemeMode, setThemeMode} from '../shared/window-frame.mjs';
import TabletBackdrop from './TabletBackdrop';
import brandPlate from '../assets/brand/7d133412d_blue-bg.png';
import coreStyles from '../shared/xiui/core.css?inline';
import shellStyles from '../shared/xiui/shell.css?inline';
import styles from '../styles/hex-product-microsites.css?inline';
import {HEX_PRODUCT_CONTENT, hexProductById, normalizeHexProductRoute, type HexProductContent, type HexProductId, type HexProductPage, type HexProductRoute} from '../lib/hexProductContent';

export type {HexProductRoute} from '../lib/hexProductContent';
export type HexProductMicrositesProps = {
  /** Existing NativeInstallerPanel, always retained in one CLI-only slot. */
  installer: ReactNode;
  route?: HexProductRoute;
  onNavigate?: (route: HexProductRoute) => void;
};
const ICONS: Record<HexProductId, LucideIcon> = {cli: Terminal, publisher: FileText, sam_law: ShieldCheck, studio: LayoutGrid, veilrift: Gamepad2, ibal: Sparkles};
const PAGE_LABELS: Record<HexProductPage, string> = {overview: 'Overview', requirements: 'Requirements', install: 'Install'};

function ProductMark({product, large = false}: {product: HexProductContent; large?: boolean}) {
  const Icon = ICONS[product.id];
  return <span className={`hex-ms-mark${large ? ' hex-ms-mark-large' : ''}`} aria-hidden="true"><Icon strokeWidth={1.35} /></span>;
}
function ProductState({product}: {product: HexProductContent}) {
  return <span data-xiui="status-badge" data-tone="unknown" className="hex-ms-state">{product.id === 'cli' ? 'Local installer' : 'Package not connected'}</span>;
}

/** Exact SDK page/panel/grid/section/action/tab attributes and styles, with
 * React navigation. The string SDK tab binder uses ownerDocument and cannot
 * resolve this ShadowRoot. This copy is not a hydrated Article/release pack. */
export default function HexProductMicrosites({installer, route: controlledRoute, onNavigate}: HexProductMicrositesProps) {
  const [localRoute, setLocalRoute] = useState<HexProductRoute>({productId: null, page: 'overview'});
  const route = normalizeHexProductRoute(controlledRoute ?? localRoute);
  const product = hexProductById(route.productId);
  const [query, setQuery] = useState('');
  const theme = useThemeMode();
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const id = useId().replace(/:/g, '');
  const tabPrefix = `hex-product-${id}`;
  const panelPrefix = `hex-product-panel-${id}`;
  function navigate(next: HexProductRoute, focus = true) {
    const normalized = normalizeHexProductRoute(next);
    focusHeading.current = focus;
    if (controlledRoute === undefined) setLocalRoute(normalized);
    onNavigate?.(normalized);
  }
  useEffect(() => {
    if (focusHeading.current) heading.current?.focus({preventScroll: true});
    focusHeading.current = false;
  }, [route.productId, route.page]);
  const tabs: HexProductPage[] = product?.id === 'cli' ? ['overview', 'requirements', 'install'] : ['overview', 'requirements'];
  function selectTab(page: HexProductPage) {
    if (product) navigate({productId: product.id, page}, false);
  }
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, page: HexProductPage) {
    let next = tabs.indexOf(page);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (next + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (next - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextPage = tabs[next];
    selectTab(nextPage);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-xiui-tab-id="${nextPage}"]`)?.focus();
  }
  const filtered = HEX_PRODUCT_CONTENT.filter(item => `${item.name} ${item.category} ${item.summary}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const installVisible = route.productId === 'cli' && route.page === 'install';
  return <div data-xiui-root data-xiui="page-shell" data-hex-microsites data-hex-workspace data-tablet-surface
    data-product-theme={theme} data-product-page={product ? route.page : 'library'}
    style={{'--workspace-plate-image': `url(${brandPlate})`} as React.CSSProperties}>
    <style>{coreStyles + '\n' + shellStyles + '\n' + styles}</style>
    <TabletBackdrop />
    <div className="hex-workspace-layout hex-ms-layout">
      <div className="hex-ms-topline">
        <button type="button" className="hex-ms-library-link" onClick={() => navigate({productId: null, page: 'overview'})} aria-label="Back to Library"><Boxes size={18} aria-hidden="true" /><span>XI-IO <span className="hex-ms-topline-muted">/</span> Library</span></button>
        <button type="button" data-xiui="icon-button" className="hex-ms-theme" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} appearance`} onClick={() => setThemeMode(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </div>
      {!product ? <main aria-label="Product Library" className="hex-ms-library">
        <header data-xiui="route-header" className="hex-ms-library-header"><p className="hex-ms-eyebrow">TOOLS FOR THE WORK YOU WANT TO DO</p><h1 ref={heading} tabIndex={-1}>Your XI-IO<br />library.</h1><p data-xiui="route-header-subtitle">Explore a product, check what it needs, and take the next available step.</p></header>
        <section data-xiui="panel" className="hex-ms-featured" aria-label="Start with local tools" data-product-primitive="ProductHero">
          <div className="hex-ms-featured-copy"><span className="hex-ms-eyebrow">START ON THIS COMPUTER</span><h2>Set up your local tools.</h2><p>XI-IO CLI has an installer in this build. Inspect your computer and review the changes before you choose to install.</p><button type="button" data-xiui="action-button" className="hex-ms-primary" onClick={() => navigate({productId: 'cli', page: 'overview'})}>Explore XI-IO CLI <ArrowRight size={18} aria-hidden="true" /></button></div>
          <div className="hex-ms-featured-visual" aria-hidden="true"><Terminal strokeWidth={1} /><span>XI-IO CLI</span><span className="hex-ms-featured-rule" /></div>
        </section>
        <section data-xiui="section" aria-labelledby={`hex-library-title-${id}`} className="hex-ms-products">
          <div className="hex-ms-section-heading"><div><p className="hex-ms-eyebrow">THE LIBRARY</p><h2 id={`hex-library-title-${id}`}>Choose your next tool</h2></div><label className="hex-ms-search"><Search size={18} aria-hidden="true" /><span className="hex-ms-sr-only">Find a product</span><input type="search" placeholder="Find a product" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
          <div data-xiui="grid" className="hex-ms-product-grid">{filtered.map(item => <article data-xiui="panel" className="hex-ms-product-card" data-product-id={item.id} key={item.id}>
            <div className="hex-ms-card-top"><ProductMark product={item} /><span className="hex-ms-category">{item.category}</span></div><h3>{item.name}</h3><p>{item.summary}</p>
            <div className="hex-ms-card-bottom"><ProductState product={item} /><button type="button" className="hex-ms-text-action" aria-label={`View ${item.name}`} onClick={() => navigate({productId: item.id, page: 'overview'})}>View product <ArrowUpRight size={17} aria-hidden="true" /></button></div>
          </article>)}</div>
          {filtered.length === 0 && <div data-xiui="empty-state" role="status"><strong>No matching products</strong><p>Try a product name or a different search.</p><button type="button" data-xiui="action-button" onClick={() => setQuery('')}>Clear search</button></div>}
        </section>
      </main> : <main aria-label={`${product.name} product page`}>
        <header data-xiui="route-header" className="hex-ms-product-header">
          <nav data-xiui="breadcrumbs" aria-label="Breadcrumb"><button type="button" onClick={() => navigate({productId: null, page: 'overview'})}><ArrowLeft size={15} aria-hidden="true" /> Library</button><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span></nav>
          <div data-xiui="route-header-main"><div className="hex-ms-product-identity"><ProductMark product={product} large /><div><p className="hex-ms-eyebrow">{product.category}</p><h1 ref={heading} tabIndex={-1}>{product.name}</h1></div></div><ProductState product={product} /></div>
          <p data-xiui="route-header-subtitle" className="hex-ms-product-summary">{product.summary}</p>
        </header>
        <div data-xiui="tabs" className="hex-ms-tabs" role="tablist" aria-label={`${product.name} sections`}>{tabs.map(page => <button type="button" role="tab" key={page} id={`${tabPrefix}-${page}`} data-xiui-tab-id={page} aria-selected={route.page === page} aria-controls={`${panelPrefix}-${page}`} tabIndex={route.page === page ? 0 : -1} onClick={() => selectTab(page)} onKeyDown={event => onTabKeyDown(event, page)}>{PAGE_LABELS[page]}</button>)}</div>
        <section data-xiui="section" role="tabpanel" id={`${panelPrefix}-overview`} aria-labelledby={`${tabPrefix}-overview`} hidden={route.page !== 'overview'} className="hex-ms-overview">
          <div data-xiui="grid" className="hex-ms-overview-grid"><div className="hex-ms-story" data-product-primitive="RepresentativeJob"><p className="hex-ms-eyebrow">ABOUT {product.name}</p><h2>{product.headline}</h2><p className="hex-ms-introduction">{product.introduction}</p><div className="hex-ms-purpose" data-product-primitive="CapabilityHighlights">{product.purpose.map((item, index) => <div key={item.title}><span className="hex-ms-purpose-number" aria-hidden="true">0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></div>)}</div></div>
            <aside data-xiui="panel" className="hex-ms-next" aria-label={`${product.name} next step`} data-product-primitive="ProductActionGroup"><BookOpen size={26} strokeWidth={1.3} aria-hidden="true" /><p className="hex-ms-eyebrow">YOUR NEXT STEP</p><h2>{product.id === 'cli' ? 'Review what it needs.' : 'Get to know the product.'}</h2><p>{product.id === 'cli' ? 'Check the local requirements, then open the existing installer. You will review a plan before any files are installed.' : 'Installation and launch are not available for this product in this build. You can still explore its purpose and requirements.'}</p><button type="button" data-xiui="action-button" className="hex-ms-primary" onClick={() => navigate({productId: product.id, page: 'requirements'})}>View requirements <ArrowRight size={18} aria-hidden="true" /></button><p className="hex-ms-small">{product.id === 'cli' ? 'Local installation does not require sign-in.' : 'No changes are made while you browse.'}</p></aside>
          </div>
        </section>
        <section data-xiui="section" role="tabpanel" id={`${panelPrefix}-requirements`} aria-labelledby={`${tabPrefix}-requirements`} hidden={route.page !== 'requirements'} className="hex-ms-requirements">
          <div className="hex-ms-section-heading"><div><p className="hex-ms-eyebrow">BEFORE YOU BEGIN</p><h2>Requirements</h2></div><span className="hex-ms-observation-label">{product.id === 'cli' ? 'Check this computer in the installer' : 'Product requirements'}</span></div>
          <dl data-xiui="panel" className="hex-ms-requirement-list" data-product-primitive="PlatformRequirements">{product.requirements.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.detail}</dd></div>)}</dl>
          {product.id === 'cli' ? <section data-xiui="next-action-strip" className="hex-ms-install-next" aria-label="Review CLI installation"><div><h3>Ready to review the local installation?</h3><p>The installer checks this computer and lets you choose the destination and permissions. Review its exact plan before approving.</p></div><button type="button" data-xiui="action-button" className="hex-ms-primary" onClick={() => navigate({productId: 'cli', page: 'install'})}>Review installation <ArrowRight size={18} aria-hidden="true" /></button></section>
            : <section data-xiui="empty-state" className="hex-ms-unavailable" aria-label="Installation unavailable"><h3>Installation is not connected yet</h3><p>The {product.name} installer is not available in this build. Return to the Library to explore other products.</p><button type="button" data-xiui="action-button" onClick={() => navigate({productId: null, page: 'overview'})}>Return to Library</button></section>}
        </section>
      </main>}
      {/* Stable sibling, no conditional/key: plans, consent and uncertain-effect
          recovery survive navigation. The slot always belongs to CLI. */}
      <section role="tabpanel" id={`${panelPrefix}-install`} aria-labelledby={installVisible ? `${tabPrefix}-install` : undefined} aria-label={installVisible ? undefined : 'XI-IO CLI installation'} hidden={!installVisible} className="hex-ms-install-slot" data-hex-installer-slot="cli">
        <div className="hex-ms-install-heading"><p className="hex-ms-eyebrow">XI-IO CLI</p><h2>Review your installation</h2><p>Choose where to install, review the changes, then approve the installation. Your plan is kept while you browse other pages.</p></div>{installer}
      </section>
      <footer className="hex-ms-footer"><span>XI-IO HEX</span><p>One useful tool at a time.</p><a href="https://xi-io.ca/" target="_blank" rel="noopener noreferrer">About XI-IO <ArrowUpRight size={15} aria-hidden="true" /></a></footer>
    </div>
  </div>;
}
