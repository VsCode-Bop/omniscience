import { registerSW } from 'virtual:pwa-register';
import { toast } from './toast';

/**
 * Service worker (Workbox via vite-plugin-pwa) : toute l'application, y compris
 * les modules chargés à la demande, est pré-cachée pour fonctionner hors-ligne.
 */
export function initPWA(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      toast('Une nouvelle version d\'OmniScience est disponible.', 'info', {
        label: 'Mettre à jour',
        run: () => void updateSW(true),
      });
    },
    onOfflineReady() {
      toast('OmniScience est prêt à fonctionner hors-ligne.', 'success');
    },
  });

  const updateStatus = () => document.documentElement.classList.toggle('is-offline', !navigator.onLine);
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}
