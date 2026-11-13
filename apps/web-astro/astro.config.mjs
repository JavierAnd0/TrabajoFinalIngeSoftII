import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'server',
  // La barra de desarrollo de Astro se superponía al contenido en demos y capturas.
  devToolbar: { enabled: false },
  adapter: node({
    mode: 'standalone',
  }),
  server: {
    port: 4321,
    host: true,
  },
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: true,
    }),
  ],
});
