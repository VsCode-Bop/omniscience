import qrcode from 'qrcode-generator';
import { h, svgIcon } from '../core/dom';
import { icon } from '../core/icons';
import { toast } from './toast';

/**
 * Boîte de dialogue de partage : lien d'état + QR code, pour que les élèves ouvrent
 * exactement la même configuration sur leur tablette ou leur téléphone.
 */
export function openShareDialog(url: string, title: string): void {
  const dialog = h('dialog', { class: 'dialog share-dialog', 'aria-label': 'Partager' });
  const input = h('input', { class: 'input', type: 'text', readonly: true, value: url, 'aria-label': 'Lien de partage' });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Lien copié dans le presse-papiers.', 'success');
    } catch {
      input.select();
      document.execCommand?.('copy');
      toast('Lien sélectionné : Ctrl+C pour le copier.', 'info');
    }
  };

  const qrBox = h('div', { class: 'qr' });
  try {
    const qr = qrcode(0, 'L');
    qr.addData(url);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch {
    qrBox.append(h('p', { class: 'muted' }, 'Configuration trop volumineuse pour un QR code : utilisez le lien.'));
  }

  const close = () => dialog.close();
  dialog.append(
    h('div', { class: 'dialog-head' },
      h('h2', null, `Partager — ${title}`),
      h('button', { class: 'btn btn-icon', 'aria-label': 'Fermer', onclick: close }, svgIcon(icon('x'))),
    ),
    h('p', { class: 'muted' }, 'Ce lien contient toute la configuration : aucun compte, aucun serveur. Projetez le QR code pour que la classe l\'ouvre.'),
    h('div', { class: 'row' },
      input,
      h('button', { class: 'btn btn-primary', onclick: copy }, svgIcon(icon('link')), 'Copier'),
    ),
    qrBox,
  );
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  input.select();
}
