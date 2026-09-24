/**
 * Contrat commun à tous les modules d'OmniScience.
 *
 * Chaque module est un chunk JavaScript chargé à la demande (import dynamique) :
 * la page d'accueil ne télécharge ni mathjs ni le moteur de circuits.
 */

export type ModuleCategory = 'maths' | 'physique' | 'enseignant';
export type ModuleStatus = 'prototype' | 'planned';

export interface ModuleContext {
  /** État décodé depuis le lien de partage (#/module?s=…), ou null. */
  readonly initialState: unknown;
  /** Le module signale que son état a changé (le shell met l'URL à jour, en différé). */
  notifyStateChange(): void;
  /** Affiche un message éphémère. */
  toast(message: string, kind?: 'info' | 'success' | 'error'): void;
}

export interface ModuleInstance {
  /** État sérialisable (JSON) pour les liens de partage. */
  getState?(): unknown;
  /** Image matricielle de la vue principale. */
  exportPNG?(): Promise<Blob>;
  /** Document SVG autonome (sert aussi de source vectorielle pour le PDF). */
  exportSVG?(): string;
  /** Appelé quand le thème clair/sombre ou le mode présentation change. */
  refresh?(): void;
  /** Relit seulement les couleurs du thème (export PDF en palette claire, sans effet sur la vue). */
  readTheme?(): void;
  destroy(): void;
}

export interface ModuleEntry {
  mount(container: HTMLElement, ctx: ModuleContext): ModuleInstance;
}

export interface ModuleDefinition {
  id: string;
  title: string;
  category: ModuleCategory;
  status: ModuleStatus;
  summary: string;
  /** Accroche courte (cartes de l'accueil). */
  tagline: string;
  /** Nom d'icône (voir core/icons.ts). */
  icon: string;
  /** Fonctionnalités prévues / disponibles (affichées sur la fiche du module). */
  features: string[];
  /** Bibliothèques retenues pour ce module. */
  libraries?: string[];
  load?: () => Promise<ModuleEntry>;
}
