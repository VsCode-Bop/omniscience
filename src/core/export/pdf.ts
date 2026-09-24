/**
 * Export PDF vectoriel : le SVG produit par un module est converti par svg2pdf.js
 * dans un document jsPDF. Les deux bibliothèques ne sont chargées qu'au premier export.
 */
export async function svgToPdf(svgMarkup: string, title: string): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);

  const svg = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml').documentElement;
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
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    const titleSpace = 28;
    const scale = Math.min((pageW - 2 * margin) / width, (pageH - 2 * margin - titleSpace) / height);
    const w = width * scale;
    const h = height * scale;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, margin, margin + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`OmniScience — ${new Date().toLocaleDateString('fr-FR')}`, pageW - margin, margin + 10, { align: 'right' });

    await svg2pdf(svg, doc, { x: (pageW - w) / 2, y: margin + titleSpace, width: w, height: h });
    return doc.output('blob');
  } finally {
    host.remove();
  }
}
