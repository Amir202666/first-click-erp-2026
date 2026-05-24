/** عنصر HTML مخصص لـ createPortal — خارج #root وفوق الشريط الجانبي */
export function getModalContainer(): HTMLElement {
  return document.getElementById('modal-root') ?? document.body
}
