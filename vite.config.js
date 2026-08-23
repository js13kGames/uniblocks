import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: { passes: 3, unsafe: true, unsafe_arrows: true },
      mangle: { toplevel: true },
    },
    rollupOptions: {
      treeshake: { moduleSideEffects: false },
    },
  },
});