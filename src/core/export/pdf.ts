/**
 * Export PDF vectoriel : le SVG produit par un module est converti par svg2pdf.js
 * dans un document jsPDF. Les deux bibliothèques ne sont chargées qu'au premier export.
 *
 * Les polices standard des PDF ne couvrent que le jeu WinAnsi (pas de −, Ω, ℓ, ≈,
 * d'indices…) : on intègre des sous-ensembles de DejaVu et Liberation, enregistrés
 * sous les noms des polices de l'interface pour que svg2pdf les retrouve.
 */
import monoBold from '../../assets/pdf-fonts/mono-bold.ttf?url';
import mono from '../../assets/pdf-fonts/mono.ttf?url';
import sansBold from '../../assets/pdf-fonts/sans-bold.ttf?url';
import sansItalic from '../../assets/pdf-fonts/sans-italic.ttf?url';
import sans from '../../assets/pdf-fonts/sans.ttf?url';
import serifItalic from '../../assets/pdf-fonts/serif-italic.ttf?url';
import serif from '../../assets/pdf-fonts/serif.ttf?url';

type Style = 'normal' | 'bold' | 'italic' | 'bolditalic';

/** Famille de l'interface → fichier de police pour chaque style. */
const PDF_FONTS: Record<string, Record<Style, string>> = {
  Geist: { normal: sans, bold: sansBold, italic: sansItalic, bolditalic: sansBold },
  'Source Serif 4': { normal: serif, bold: serif, italic: serifItalic, bolditalic: serifItalic },
  'Geist Mono': { normal: mono, bold: monoBold, italic: mono, bolditalic: monoBold },
};

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

let fontData: Promise<Map<string, string>> | null = null;

function loadFonts(): Promise<Map<string, string>> {
  const urls = [...new Set(Object.values(PDF_FONTS).flatMap((styles) => Object.values(styles)))];
  fontData ??= Promise.all(urls.map(async (url) => [url, toBase64(await (await fetch(url)).arrayBuffer())] as const)).then((entries) => new Map(entries));
  return fontData;
}

/** svg2pdf ne connaît que les graisses normal / bold : 500 → normal, 600 et plus → bold. */
function normalizeWeights(svg: Element): void {
  for (const el of svg.querySelectorAll('[font-weight]')) {
    const w = el.getAttribute('font-weight')!;
    const n = Number(w);
    el.setAttribute('font-weight', w === 'bold' || (Number.isFinite(n) && n >= 600) ? 'bold' : 'normal');
  }
}

export async function svgToPdf(svgMarkup: string, title: string): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }, fonts] = await Promise.all([import('jspdf'), import('svg2pdf.js'), loadFonts()]);

  const svg = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml').documentElement;
  normalizeWeights(svg);
  const width = parseFloat(svg.getAttribute('width') ?? '800');
  const height = parseFloat(svg.getAttribute('height') ?? '600');

  // svg2pdf a besoin d'un élément attaché au document pour résoudre les styles.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden';
  host.appendChild(svg);
  document.body.appendChild(host);

  try {
    const landscape = width >= height;
    const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    for (const [family, styles] of Object.entries(PDF_FONTS)) {
      for (const [style, url] of Object.entries(styles)) {
        const file = `${family}-${style}.ttf`;
        doc.addFileToVFS(file, fonts.get(url)!);
        doc.addFont(file, family, style);
      }
    }
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    const titleSpace = 28;
    const scale = Math.min((pageW - 2 * margin) / width, (pageH - 2 * margin - titleSpace) / height);
    const w = width * scale;
    const h = height * scale;

    doc.setFont('Geist', 'bold');
    doc.setFontSize(14);
    doc.text(title, margin, margin + 10);
    doc.setFont('Geist', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`OmniScience — ${new Date().toLocaleDateString('fr-FR')}`, pageW - margin, margin + 10, { align: 'right' });

    await svg2pdf(svg, doc, { x: (pageW - w) / 2, y: margin + titleSpace, width: w, height: h });
    return doc.output('blob');
  } finally {
    host.remove();
  }
}
