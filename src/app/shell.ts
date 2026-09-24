import { clear, debounce, dismissable, h, svgIcon } from '../core/dom';
import { downloadBlob, downloadText, timestampedName } from '../core/export/download';
import { icon } from '../core/icons';
import type { ModuleDefinition, ModuleInstance } from '../core/types';
import { buildHash, decodeState, encodeState, parseHash, shareUrl } from '../core/url-state';
import { renderHome, renderPlanned } from './home';
import { togglePresentation } from './presentation';
import { CATEGORIES, findModule, MODULES } from './registry';
import { openShareDialog } from './share-dialog';
import { getThemePref, setThemePref, type ThemePref } from './theme';
import { toast } from './toast';

const REPO_URL = 'https://github.com/VsCode-Bop/omniscience';

interface Active {
  def: ModuleDefinition;
  instance: ModuleInstance;
}

/**
 * Coquille de l'application : barre latérale de navigation, en-tête contextuel,
 * routage par fragment (#/module?s=…), cycle de vie des modules, partage et exports.
 * Le routage par « hash » est le seul compatible avec GitHub Pages sans configuration.
 */
export class Shell {
  private readonly app: HTMLElement;
  private readonly view: HTMLElement;
  private readonly crumbs: HTMLElement;
  private readonly moduleActions: HTMLElement;
  private readonly exportBtn: HTMLButtonElement;
  private readonly navItems = new Map<string, HTMLAnchorElement>();
  private readonly themeButtons = new Map<ThemePref, HTMLButtonElement>();
  private active: Active | null = null;
  private cleanupView: (() => void) | null = null;
  private closeMenu: (() => void) | null = null;
  private navToken = 0;
  /** Dernier fragment écrit par l'application elle-même (pour ignorer l'écho). */
  private writtenHash = '';

  constructor(root: HTMLElement) {
    this.app = root;
    root.classList.add('app');

    // ── Barre latérale ──
    const nav = h('nav', { class: 'sidebar-nav', 'aria-label': 'Modules' },
      this.navLink('', 'Accueil', 'home'),
      ...(Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((cat) =>
        h('div', { class: 'nav-section', 'data-cat': cat },
          h('div', { class: 'nav-title' }, CATEGORIES[cat].title),
          ...MODULES.filter((m) => m.category === cat).map((m) => this.navLink(m.id, m.title, m.icon, m.status === 'planned')),
        ),
      ),
    );
    const themeSeg = h('div', { class: 'seg theme-seg', role: 'radiogroup', 'aria-label': 'Thème' },
      ...([['auto', 'monitor', 'Automatique'], ['light', 'sun', 'Clair'], ['dark', 'moon', 'Sombre']] as [ThemePref, string, string][]).map(([pref, ic, label]) => {
        const b = h('button', { class: 'seg-btn', role: 'radio', title: `Thème ${label.toLowerCase()}`, 'aria-label': `Thème ${label.toLowerCase()}`, onclick: () => this.setTheme(pref) }, svgIcon(icon(ic)));
        this.themeButtons.set(pref, b);
        return b;
      }),
    );
    const sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Navigation' },
      h('div', { class: 'sidebar-head' },
        h('a', { class: 'brand', href: '#/', 'aria-label': 'OmniScience — accueil' },
          h('span', { class: 'brand-mark' }, svgIcon(icon('logo'))),
          h('span', { class: 'brand-name' }, 'OmniScience'),
        ),
        h('button', { class: 'btn btn-ghost btn-icon btn-sm sidebar-toggle', title: 'Réduire / déplier le menu', 'aria-label': 'Réduire ou déplier le menu', onclick: () => this.toggleSidebar() }, svgIcon(icon('sidebar'))),
      ),
      nav,
      h('div', { class: 'sidebar-foot' },
        themeSeg,
        h('a', { class: 'btn btn-ghost btn-icon btn-sm', href: REPO_URL, target: '_blank', rel: 'noopener', title: 'Code source (GitHub)', 'aria-label': 'Code source sur GitHub' }, svgIcon(icon('github'))),
      ),
    );

    // ── En-tête ──
    this.crumbs = h('div', { class: 'crumbs' });
    this.exportBtn = h('button', { class: 'btn', 'aria-haspopup': 'menu', onclick: () => this.openExportMenu() },
      svgIcon(icon('download')), h('span', { class: 'hide-sm' }, 'Exporter'), svgIcon(icon('chevronDown'), 'icon icon-sm chevron'),
    );
    this.moduleActions = h('div', { class: 'topbar-actions' },
      h('button', { class: 'btn', title: 'Partager un lien vers cette configuration', onclick: () => this.share() },
        svgIcon(icon('share')), h('span', { class: 'hide-sm' }, 'Partager'),
      ),
      h('div', { class: 'popover-anchor' }, this.exportBtn),
      h('span', { class: 'topbar-sep' }),
      h('button', { class: 'btn btn-primary', title: 'Mode présentation (touche P)', onclick: () => void togglePresentation() },
        svgIcon(icon('presentation')), h('span', { class: 'hide-sm' }, 'Présenter'),
      ),
    );
    const topbar = h('header', { class: 'topbar' },
      h('button', { class: 'btn btn-ghost btn-icon menu-btn', 'aria-label': 'Ouvrir le menu', onclick: () => this.app.classList.add('drawer-open') }, svgIcon(icon('menu'))),
      this.crumbs,
      h('div', { class: 'topbar-spacer' }),
      h('span', { class: 'offline-badge', title: 'Hors-ligne : l\'application reste utilisable' }, svgIcon(icon('wifiOff'), 'icon icon-sm'), 'Hors-ligne'),
      this.moduleActions,
    );

    this.view = h('main', { id: 'view', class: 'view', tabindex: '-1' });
    const exitPresentation = h('button', { class: 'btn present-exit', onclick: () => void togglePresentation() },
      svgIcon(icon('minimize')), 'Quitter la présentation', h('kbd', null, 'Échap'),
    );
    const scrim = h('div', { class: 'scrim', onclick: () => this.app.classList.remove('drawer-open') });
    root.append(sidebar, h('div', { class: 'main' }, topbar, this.view), scrim, exitPresentation);

    this.syncTheme();
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('omni:themechange', () => {
      this.syncTheme();
      this.active?.instance.refresh?.();
    });
    window.addEventListener('omni:presentationchange', () => this.active?.instance.refresh?.());
    // Les scènes Canvas sont redessinées une fois les polices embarquées chargées.
    void document.fonts?.ready.then(() => this.active?.instance.refresh?.());
  }

  start(): void {
    void this.route();
  }

  private navLink(id: string, label: string, ic: string, soon = false): HTMLAnchorElement {
    const a = h('a', { class: `nav-item${soon ? ' is-soon' : ''}`, href: `#/${id}`, title: soon ? `${label} (en préparation)` : label, onclick: () => this.app.classList.remove('drawer-open') },
      h('span', { class: 'nav-icon' }, svgIcon(icon(ic))),
      h('span', { class: 'nav-label' }, label),
      soon ? h('span', { class: 'nav-soon', 'aria-label': 'en préparation' }) : null,
    );
    this.navItems.set(id, a);
    return a;
  }

  private toggleSidebar(): void {
    this.app.classList.toggle('sidebar-collapsed');
  }

  private setTheme(pref: ThemePref): void {
    setThemePref(pref);
    this.syncTheme();
  }

  private syncTheme(): void {
    const pref = getThemePref();
    for (const [p, b] of this.themeButtons) {
      b.classList.toggle('is-active', p === pref);
      b.setAttribute('aria-checked', String(p === pref));
    }
  }

  private async route(): Promise<void> {
    if (window.location.hash === this.writtenHash && this.active) return;
    const { moduleId, state } = parseHash(window.location.hash);
    const token = ++this.navToken;

    this.unmount();
    clear(this.view);
    const def = moduleId ? findModule(moduleId) : undefined;
    document.title = def ? `${def.title} — OmniScience` : 'OmniScience — le laboratoire numérique des cours de sciences';
    this.renderCrumbs(def);
    for (const [id, a] of this.navItems) a.classList.toggle('is-active', id === (def?.id ?? ''));
    this.moduleActions.hidden = true;
    this.view.dataset.module = def?.id ?? 'home';
    this.app.dataset.route = def?.load ? 'tool' : 'page';
    // Dans un outil, la barre latérale se réduit en rail pour laisser la place à l'espace de travail.
    this.app.classList.toggle('sidebar-collapsed', !!def?.load);
    this.view.scrollTop = 0;

    if (!def) {
      if (moduleId) toast(`Module « ${moduleId} » introuvable.`, 'error');
      this.cleanupView = renderHome(this.view);
      return;
    }
    if (!def.load) {
      renderPlanned(this.view, def);
      return;
    }

    this.view.append(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), `Chargement — ${def.title}`));
    try {
      const entry = await def.load();
      if (token !== this.navToken) return; // navigation plus récente entre-temps
      clear(this.view);
      const host = h('div', { class: 'module-host' });
      this.view.append(host);
      const notify = debounce(() => this.writeState(), 400);
      const instance = entry.mount(host, {
        initialState: decodeState(state),
        notifyStateChange: notify,
        toast,
      });
      this.active = { def, instance };
      this.moduleActions.hidden = false;
      this.exportBtn.disabled = !instance.exportPNG && !instance.exportSVG;
    } catch (err) {
      console.error(err);
      if (token !== this.navToken) return;
      clear(this.view);
      this.view.append(
        h('div', { class: 'page narrow' }, h('h1', null, 'Impossible de charger le module'), h('p', { class: 'muted' }, String(err)), h('a', { class: 'btn', href: '#/' }, 'Accueil')),
      );
    }
  }

  private renderCrumbs(def: ModuleDefinition | undefined): void {
    clear(this.crumbs);
    if (!def) {
      this.crumbs.append(h('span', { class: 'crumb-title' }, 'Accueil'));
      return;
    }
    this.crumbs.append(
      h('span', { class: `crumb-cat cat-${def.category}` }, CATEGORIES[def.category].title),
      svgIcon(icon('chevronRight'), 'icon icon-sm crumb-sep'),
      h('span', { class: 'crumb-title' }, def.title),
    );
  }

  private unmount(): void {
    this.closeMenu?.();
    this.cleanupView?.();
    this.cleanupView = null;
    if (this.active) {
      this.active.instance.destroy();
      this.active = null;
    }
  }

  private writeState(): void {
    if (!this.active?.instance.getState) return;
    const hash = buildHash(this.active.def.id, encodeState(this.active.instance.getState()));
    this.writtenHash = hash;
    history.replaceState(null, '', hash);
  }

  private share(): void {
    if (!this.active) return;
    const state = this.active.instance.getState?.();
    openShareDialog(shareUrl(this.active.def.id, state), this.active.def.title);
  }

  private openExportMenu(): void {
    if (this.closeMenu) {
      this.closeMenu();
      return;
    }
    const instance = this.active?.instance;
    if (!instance) return;
    const base = this.active!.def.id;
    const title = this.active!.def.title;
    const menu = h('div', { class: 'menu', role: 'menu' });
    const item = (ic: string, label: string, detail: string, enabled: boolean, run: () => Promise<void> | void) =>
      h('button', { class: 'menu-item', role: 'menuitem', disabled: !enabled, onclick: async () => {
        this.closeMenu?.();
        try {
          await run();
        } catch (err) {
          console.error(err);
          toast(`Échec de l'export : ${String(err)}`, 'error');
        }
      } }, svgIcon(icon(ic)), h('strong', null, label), h('small', null, detail));

    menu.append(
      h('div', { class: 'menu-label' }, 'Exporter la vue'),
      item('download', 'Image PNG', 'Haute résolution, pour diaporamas et ENT', !!instance.exportPNG, async () => {
        downloadBlob(await instance.exportPNG!(), timestampedName(base, 'png'));
      }),
      item('worksheet', 'Document PDF', 'Vectoriel, fond clair, prêt à imprimer', !!instance.exportSVG, async () => {
        toast('Génération du PDF…');
        const { svgToPdf } = await import('../core/export/pdf');
        downloadBlob(await svgToPdf(printableSVG(instance), title), timestampedName(base, 'pdf'));
      }),
      item('graph', 'Dessin SVG', 'Vectoriel, modifiable (Inkscape, LibreOffice)', !!instance.exportSVG, () => {
        downloadText(instance.exportSVG!(), timestampedName(base, 'svg'), 'image/svg+xml');
      }),
    );
    this.exportBtn.parentElement!.append(menu);
    this.exportBtn.setAttribute('aria-expanded', 'true');
    this.closeMenu = dismissable(menu, () => {
      menu.remove();
      this.exportBtn.setAttribute('aria-expanded', 'false');
      this.closeMenu = null;
    }, this.exportBtn);
  }
}

/**
 * SVG de la vue en palette claire, pour l'impression. Le changement de thème est
 * synchrone et annulé avant tout rafraîchissement de l'écran : aucun clignotement.
 */
function printableSVG(instance: ModuleInstance): string {
  const root = document.documentElement;
  if (root.dataset.theme !== 'dark' || !instance.readTheme) return instance.exportSVG!();
  root.dataset.theme = 'light';
  try {
    instance.readTheme();
    return instance.exportSVG!();
  } finally {
    root.dataset.theme = 'dark';
    instance.readTheme();
  }
}
