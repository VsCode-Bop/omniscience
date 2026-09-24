import { clear, debounce, h, svgIcon } from '../core/dom';
import { downloadBlob, downloadText, timestampedName } from '../core/export/download';
import { icon } from '../core/icons';
import type { ModuleDefinition, ModuleInstance } from '../core/types';
import { buildHash, decodeState, encodeState, parseHash, shareUrl } from '../core/url-state';
import { renderHome, renderPlanned } from './home';
import { togglePresentation } from './presentation';
import { findModule } from './registry';
import { openShareDialog } from './share-dialog';
import { cycleTheme, getThemePref, THEME_LABELS, type ThemePref } from './theme';
import { toast } from './toast';

const REPO_URL = 'https://github.com/VsCode-Bop/omniscience';
const THEME_ICONS: Record<ThemePref, string> = { auto: 'auto', light: 'sun', dark: 'moon' };

interface Active {
  def: ModuleDefinition;
  instance: ModuleInstance;
}

/**
 * Coquille de l'application : barre supérieure, routage par fragment (#/module?s=…),
 * cycle de vie des modules, partage et exports.
 * Le routage par « hash » est le seul compatible avec GitHub Pages sans configuration.
 */
export class Shell {
  private readonly view: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly moduleActions: HTMLElement;
  private readonly themeBtn: HTMLButtonElement;
  private readonly exportMenu: HTMLElement;
  private active: Active | null = null;
  private navToken = 0;
  /** Dernier fragment écrit par l'application elle-même (pour ignorer l'écho). */
  private writtenHash = '';

  constructor(root: HTMLElement) {
    this.titleEl = h('span', { class: 'topbar-title' });
    this.themeBtn = h('button', { class: 'btn btn-icon', onclick: () => this.onTheme() });
    this.exportMenu = h('div', { class: 'menu', role: 'menu', hidden: true });

    const exportBtn = h('button', { class: 'btn', 'aria-haspopup': 'menu', onclick: (e: Event) => { e.stopPropagation(); this.toggleExportMenu(); } },
      svgIcon(icon('download')), h('span', { class: 'hide-sm' }, 'Exporter'), svgIcon(icon('chevronDown'), 'icon icon-sm'),
    );
    this.moduleActions = h('div', { class: 'topbar-group' },
      h('button', { class: 'btn', title: 'Partager un lien vers cette configuration', onclick: () => this.share() },
        svgIcon(icon('share')), h('span', { class: 'hide-sm' }, 'Partager'),
      ),
      h('div', { class: 'menu-anchor' }, exportBtn, this.exportMenu),
    );

    const topbar = h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'OmniScience — accueil' },
        svgIcon(icon('logo'), 'icon brand-logo'), h('span', { class: 'brand-name' }, 'Omni', h('b', null, 'Science')),
      ),
      this.titleEl,
      h('div', { class: 'topbar-spacer' }),
      h('span', { class: 'offline-badge', title: 'Hors-ligne : l\'application reste utilisable' }, svgIcon(icon('wifiOff'), 'icon icon-sm'), 'Hors-ligne'),
      this.moduleActions,
      h('div', { class: 'topbar-group' },
        h('button', { class: 'btn btn-icon', title: 'Mode présentation (P)', 'aria-label': 'Mode présentation', onclick: () => void togglePresentation() }, svgIcon(icon('presentation'))),
        this.themeBtn,
        h('a', { class: 'btn btn-icon hide-sm', href: REPO_URL, target: '_blank', rel: 'noopener', title: 'Code source sur GitHub', 'aria-label': 'Code source sur GitHub' }, svgIcon(icon('github'))),
      ),
    );

    this.view = h('main', { id: 'view', class: 'view', tabindex: '-1' });
    const exitPresentation = h('button', { class: 'btn present-exit', onclick: () => void togglePresentation() },
      svgIcon(icon('minimize')), 'Quitter la présentation',
    );
    root.append(topbar, this.view, exitPresentation);

    this.renderThemeButton();
    document.addEventListener('click', () => (this.exportMenu.hidden = true));
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('omni:themechange', () => this.active?.instance.refresh?.());
    window.addEventListener('omni:presentationchange', () => this.active?.instance.refresh?.());
  }

  start(): void {
    void this.route();
  }

  private async route(): Promise<void> {
    if (window.location.hash === this.writtenHash && this.active) return;
    const { moduleId, state } = parseHash(window.location.hash);
    const token = ++this.navToken;

    this.unmount();
    clear(this.view);
    const def = moduleId ? findModule(moduleId) : undefined;
    document.title = def ? `${def.title} — OmniScience` : 'OmniScience — outils STEM pour la classe';
    this.titleEl.textContent = def?.title ?? '';
    this.moduleActions.hidden = true;
    this.view.dataset.module = def?.id ?? 'home';

    if (!def) {
      if (moduleId) toast(`Module « ${moduleId} » introuvable.`, 'error');
      renderHome(this.view);
      return;
    }
    if (!def.load) {
      renderPlanned(this.view, def);
      return;
    }

    this.view.append(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), `Chargement de ${def.title}…`));
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
      this.buildExportMenu(instance);
    } catch (err) {
      console.error(err);
      if (token !== this.navToken) return;
      clear(this.view);
      this.view.append(
        h('div', { class: 'planned' }, h('h1', null, 'Impossible de charger le module'), h('p', null, String(err)), h('a', { class: 'btn', href: '#/' }, 'Accueil')),
      );
    }
  }

  private unmount(): void {
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

  private buildExportMenu(instance: ModuleInstance): void {
    clear(this.exportMenu);
    const base = this.active!.def.id;
    const item = (label: string, detail: string, enabled: boolean, run: () => Promise<void> | void) =>
      h('button', { class: 'menu-item', role: 'menuitem', disabled: !enabled, onclick: async () => {
        this.exportMenu.hidden = true;
        try {
          await run();
        } catch (err) {
          console.error(err);
          toast(`Échec de l'export : ${String(err)}`, 'error');
        }
      } }, h('strong', null, label), h('span', null, detail));

    this.exportMenu.append(
      item('PNG', 'Image haute résolution', !!instance.exportPNG, async () => {
        downloadBlob(await instance.exportPNG!(), timestampedName(base, 'png'));
      }),
      item('SVG', 'Vectoriel, éditable (Inkscape…)', !!instance.exportSVG, () => {
        downloadText(instance.exportSVG!(), timestampedName(base, 'svg'), 'image/svg+xml');
      }),
      item('PDF', 'Vectoriel, prêt à imprimer', !!instance.exportSVG, async () => {
        toast('Génération du PDF…');
        const { svgToPdf } = await import('../core/export/pdf');
        downloadBlob(await svgToPdf(instance.exportSVG!(), this.active?.def.title ?? 'OmniScience'), timestampedName(base, 'pdf'));
      }),
    );
  }

  private toggleExportMenu(): void {
    this.exportMenu.hidden = !this.exportMenu.hidden;
  }

  private onTheme(): void {
    const pref = cycleTheme();
    this.renderThemeButton();
    toast(THEME_LABELS[pref]);
  }

  private renderThemeButton(): void {
    const pref = getThemePref();
    clear(this.themeBtn);
    this.themeBtn.append(svgIcon(icon(THEME_ICONS[pref])));
    this.themeBtn.title = `${THEME_LABELS[pref]} (cliquer pour changer)`;
    this.themeBtn.setAttribute('aria-label', THEME_LABELS[pref]);
  }
}
