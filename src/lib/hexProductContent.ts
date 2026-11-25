/** Product copy, not an installation registry. Native inspection, manifests
 * and reviewed receipts own versions, dependencies and installed state. */
export type HexProductId = 'cli' | 'publisher' | 'sam_law' | 'studio' | 'veilrift' | 'ibal';
export type HexProductPage = 'overview' | 'requirements' | 'install';
export type HexProductRoute = {productId: HexProductId | null; page: HexProductPage};
export type HexProductContent = {
  id: HexProductId; name: string; category: string; summary: string; headline: string; introduction: string;
  purpose: readonly {title: string; text: string}[];
  requirements: readonly {label: string; detail: string}[];
};

export const HEX_PRODUCT_CONTENT: readonly HexProductContent[] = [
  {id: 'cli', name: 'XI-IO CLI', category: 'Local tools', headline: 'Work from your terminal.',
    summary: 'Work with local projects and the tools behind your workspace.',
    introduction: 'A starting point for local XI-IO work. Use the existing installer to inspect this computer, choose a destination and review the exact changes before installing.',
    purpose: [
      {title: 'Start with your computer', text: 'Inspect the local runtime and choose where the CLI will live.'},
      {title: 'Review every change', text: 'See the selected files and permissions before approving a plan.'},
      {title: 'Keep a recovery path', text: 'Use the installer’s saved history and available rollback controls.'},
    ],
    requirements: [
      {label: 'Operating system', detail: 'The connected installer is for Linux. The native inspector checks this computer.'},
      {label: 'Local runtime', detail: 'System Python 3.10+, Bash and a selected Node 22.13+ executable. The reviewed plan checks the selected runtime.'},
      {label: 'Installation folder', detail: 'Choose a local destination in the installer and review the exact file changes.'},
      {label: 'Account', detail: 'An XI-IO account is not required for local installation. Remote connections have their own setup and permissions.'},
    ]},
  {id: 'publisher', name: 'Publisher', category: 'Documents & publishing', headline: 'Turn content into a finished composition.',
    summary: 'Shape a composition and prepare it for delivery.',
    introduction: 'Publisher is the XI-IO product for composing and delivering content. Its product page keeps the publishing workflow together while installation and launch availability remain tied to an actual release.',
    purpose: [
      {title: 'Compose', text: 'Arrange content into a document or page.'},
      {title: 'Review', text: 'Check the composition before delivering it.'},
      {title: 'Deliver', text: 'Prepare the result for its intended destination.'},
    ],
    requirements: [{label: 'Product package', detail: 'A Publisher release is not connected to this installer view yet.'}, {label: 'Platform & dependencies', detail: 'These must come from the selected Publisher package. They are not inferred from the CLI requirements.'}]},
  {id: 'sam_law', name: 'SAM_LAW', category: 'Protected document work', headline: 'Keep your drafting tied to its matter.',
    summary: 'Keep matter documents and drafting work in one place.',
    introduction: 'SAM_LAW is being prepared for protected matter and document work. Its installed workflow must preserve the matter, document revision and permissions when work is saved and reopened.',
    purpose: [
      {title: 'Find the right material', text: 'Bring the matter and its relevant documents into focus.'},
      {title: 'Work on a draft', text: 'Keep document work attached to its matter and revision.'},
      {title: 'Return to the same work', text: 'Saving and reopening must preserve the exact work and its access boundaries.'},
    ],
    requirements: [{label: 'Product package', detail: 'A SAM_LAW release is not connected to this installer view yet.'}, {label: 'Protected access', detail: 'Matter access and authorized AI work require their own identity and permission bindings.'}, {label: 'Platform & dependencies', detail: 'Use the requirements of the selected SAM_LAW release. Installing the whole suite is not implied.'}]},
  {id: 'studio', name: 'XI-IO Studio', category: 'Suite management', headline: 'Manage the products you use.',
    summary: 'Discover, organize and manage the XI-IO products you use.',
    introduction: 'Studio brings the XI-IO suite together, with product discovery and shared controls for installation, launch, updates and repair. Individual products keep their own releases and requirements.',
    purpose: [
      {title: 'Find your products', text: 'Browse the products available to your suite.'},
      {title: 'Manage installations', text: 'Review installation, update and repair actions in one place.'},
      {title: 'Open your tools', text: 'Reach installed products through their own launch actions.'},
    ],
    requirements: [{label: 'Product package', detail: 'A Studio release is not connected to this installer view yet.'}, {label: 'Platform & dependencies', detail: 'Studio’s own release must declare its runtime requirements.'}]},
  {id: 'veilrift', name: 'VeilRIFT', category: 'Play & exploration', headline: 'Explore VeilRIFT.',
    summary: 'Discover the game and the experience being built around it.',
    introduction: 'VeilRIFT has its own player experience. A product-specific installation should bring in its required runtime without requiring unrelated XI-IO products.',
    purpose: [
      {title: 'Explore the product', text: 'Keep the game’s information and experience together.'},
      {title: 'Choose the right release', text: 'Review platform and runtime requirements for that game build.'},
      {title: 'Launch the installed game', text: 'A native launch action must be bound to the actual installed release.'},
    ],
    requirements: [{label: 'Game package', detail: 'A VeilRIFT release is not connected to this installer view yet.'}, {label: 'Hardware & platform', detail: 'Hardware and graphics requirements must come from the selected game release.'}]},
  {id: 'ibal', name: '@ibal', category: 'AI assistance', headline: 'Manage AI models and project assistants.',
    summary: 'Manage local models, provider routes and authorized AI project work.',
    introduction: '@ibal brings model management, provider choices and project assistants into one console. Its assistants work through the permissions and connections you have approved.',
    purpose: [
      {title: 'Use a shared workspace', text: 'Human and AI work refer to the same durable resources.'},
      {title: 'Keep actions scoped', text: 'Registered capabilities and explicit permissions govern execution.'},
      {title: 'Read the result back', text: 'Completed work needs an independently observed result.'},
    ],
    requirements: [{label: 'Product package', detail: 'An @ibal release is not connected to this installer view yet.'}, {label: 'Models & connections', detail: 'The selected runtime and each connection need their own verified setup.'}, {label: 'Permissions', detail: 'Installation is separate from authorization to act on a workspace or account.'}]},
] as const;

export function hexProductById(id: string | null | undefined): HexProductContent | undefined {
  return HEX_PRODUCT_CONTENT.find(product => product.id === id);
}
export function normalizeHexProductRoute(route?: HexProductRoute): HexProductRoute {
  const product = hexProductById(route?.productId);
  if (!product) return {productId: null, page: 'overview'};
  const page = route?.page === 'requirements' || route?.page === 'install' ? route.page : 'overview';
  // Never route another product into the CLI plan and call it installed.
  return {productId: product.id, page: page === 'install' && product.id !== 'cli' ? 'requirements' : page};
}
