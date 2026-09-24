import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Sur GitHub Pages, un site de projet est servi sous `/<nom-du-depot>/`.
 * Le workflow de déploiement fournit BASE_PATH ; en local on sert depuis `/`.
 * (Avec un domaine personnalisé, laisser BASE_PATH vide.)
 */
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: true,
    // mathjs pèse ~600 ko minifié : il vit dans le chunk de la grapheuse, chargé à la demande.
    chunkSizeWarningLimit: 900,
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'OmniScience — outils STEM pour la classe',
        short_name: 'OmniScience',
        description:
          'Simulateur de circuits, grapheuse, calculatrice et outils interactifs pour les enseignants de mathématiques et de physique-chimie.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#2563eb',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Tous les modules (chunks chargés à la demande) sont pré-cachés : l'application
        // entière fonctionne hors-ligne après la première visite.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Dépendances optionnelles de jsPDF jamais chargées par OmniScience (export HTML, canvg).
        globIgnores: ['**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
