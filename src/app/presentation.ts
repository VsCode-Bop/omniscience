/**
 * Mode présentation (TBI / vidéoprojecteur) : plein écran, interface réduite au
 * strict nécessaire, textes et traits agrandis. Raccourci : touche P, sortie : Échap.
 */

const CLASS = 'is-presenting';

export function isPresenting(): boolean {
  return document.documentElement.classList.contains(CLASS);
}

function setPresenting(on: boolean): void {
  document.documentElement.classList.toggle(CLASS, on);
  window.dispatchEvent(new CustomEvent('omni:presentationchange'));
}

export async function togglePresentation(): Promise<void> {
  if (isPresenting()) {
    setPresenting(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    return;
  }
  setPresenting(true);
  // Certains navigateurs (iOS) refusent le plein écran : le mode reste utile sans.
  await document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function initPresentation(): void {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isPresenting()) setPresenting(false);
  });
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      void togglePresentation();
    } else if (e.key === 'Escape' && isPresenting() && !document.fullscreenElement) {
      setPresenting(false);
    }
  });
}
