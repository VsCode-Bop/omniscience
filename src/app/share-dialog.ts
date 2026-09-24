import qrcode from 'qrcode-generator';
import { h, svgIcon } from '../core/dom';
import { icon } from '../core/icons';
import { toast } from './toast';

/**
 * Boîte de dialogue de partage : lien d'état + QR code, pour que les élèves ouvrent
 * exactement la même configuration sur leur tablette ou leur téléphone.
 */
export function openShareDialog(url: string, title: string): void {
  const dialog = h('dialog', { class: 'dialog share-dialog', 'aria-labelledby': 'share-title' });
  const input = h('input', { class: 'input', type: 'text', readonly: true, value: url, 'aria-label': 'Lien de partage' });
  const copyBtn = h('button', { class: 'btn btn-primary' }, svgIcon(icon('copy')), 'Copier');

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.replaceChildren(svgIcon(icon('check')), 'Copié');
      toast('Lien copié dans le presse-papiers.', 'success');
    } catch {
      input.select();
      toast('Lien sélectionné : Ctrl+C pour le copier.');
    }
  });

  let qrBlock: HTMLElement;
  try {
    const qr = qrcode(0, 'L');
    qr.addData(url);
    qr.make();
    const holder = h('div', { class: 'qr-code' });
    holder.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    qrBlock = h('div', { class: 'qr-frame' },
      holder,
      h('div', null,
        h('h3', null, 'Projetez ce code'),
        h('p', null, 'Les élèves le scannent et retrouvent exactement la même configuration sur leur tablette ou leur téléphone.'),
      ),
    );
  } catch {
    qrBlock = h('p', { class: 'muted small' }, 'Configuration trop volumineuse pour un QR code : utilisez le lien.');
  }

  const close = () => dialog.close();
  dialog.append(
    h('div', { class: 'dialog-head' },
      h('div', null,
        h('h2', { id: 'share-title' }, `Partager — ${title}`),
        h('p', null, 'Le lien contient toute la configuration. Aucun compte, aucune donnée envoyée à un serveur.'),
      ),
      h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Fermer', onclick: close }, svgIcon(icon('x'))),
    ),
    h('div', { class: 'dialog-body' },
      h('div', { class: 'share-row' }, input, copyBtn),
      qrBlock,
    ),
  );
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  input.select();
}
