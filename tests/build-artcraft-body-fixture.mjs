import {build} from 'vite';

// Compile the actual React consumer; tests still mock only the donor boundary.
await build({
  configFile: false,
  build: {
    outDir: 'test-dist',
    lib: {
      entry: 'src/components/ArtcraftLauncherBody.tsx',
      formats: ['es'],
      fileName: 'body',
    },
    rollupOptions: {external: ['react', 'react/jsx-runtime']},
  },
});
