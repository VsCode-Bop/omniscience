/**
 * Décomposition LU dense avec pivot partiel (Doolittle, stockage ligne-major).
 *
 * Utilisée par le simulateur de circuits (analyse nodale modifiée) : les circuits
 * pédagogiques comptent rarement plus de quelques dizaines d'inconnues, une
 * factorisation dense O(n³) est donc largement suffisante et très cache-friendly.
 * La factorisation est réutilisée tant que la matrice ne change pas (circuit linéaire).
 */
export class LUSolver {
  private lu: Float64Array;
  private perm: Int32Array;
  private tmp: Float64Array;
  /** Indice de la ligne où un pivot nul a été détecté (diagnostic), sinon -1. */
  singularAt = -1;

  constructor(public readonly n: number) {
    this.lu = new Float64Array(n * n);
    this.perm = new Int32Array(n);
    this.tmp = new Float64Array(n);
  }

  /** Factorise A (n×n, ligne-major). Retourne false si la matrice est singulière. */
  factor(A: Float64Array, pivotTolerance = 1e-14): boolean {
    const { n, lu, perm } = this;
    lu.set(A);
    this.singularAt = -1;
    for (let i = 0; i < n; i++) perm[i] = i;

    for (let k = 0; k < n; k++) {
      // Recherche du pivot de plus grande valeur absolue dans la colonne k.
      let p = k;
      let max = Math.abs(lu[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(lu[i * n + k]);
        if (v > max) {
          max = v;
          p = i;
        }
      }
      if (max < pivotTolerance) {
        this.singularAt = perm[p];
        return false;
      }
      if (p !== k) {
        for (let j = 0; j < n; j++) {
          const t = lu[k * n + j];
          lu[k * n + j] = lu[p * n + j];
          lu[p * n + j] = t;
        }
        const t = perm[k];
        perm[k] = perm[p];
        perm[p] = t;
      }
      const pivot = lu[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = (lu[i * n + k] /= pivot);
        if (f === 0) continue;
        for (let j = k + 1; j < n; j++) lu[i * n + j] -= f * lu[k * n + j];
      }
    }
    return true;
  }

  /** Résout A·x = b avec la dernière factorisation. */
  solve(b: Float64Array, x: Float64Array = new Float64Array(this.n)): Float64Array {
    const { n, lu, perm, tmp } = this;
    for (let i = 0; i < n; i++) {
      let s = b[perm[i]];
      for (let j = 0; j < i; j++) s -= lu[i * n + j] * tmp[j];
      tmp[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = tmp[i];
      for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * x[j];
      x[i] = s / lu[i * n + i];
    }
    return x;
  }
}
