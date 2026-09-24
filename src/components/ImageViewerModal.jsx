import Modal from './Modal.jsx';

/*
 * Full-screen receipt viewer (design.md §7: "48x48px thumbnail, click
 * opens full-screen viewer"). Built on the existing Modal rather than
 * a new overlay implementation — Modal already gives a true full-
 * screen treatment on mobile and a centered card on desktop, plus a
 * consistent "[ > TITLE ] [ X CLOSE ]" header, so this stays a single
 * small wrapper instead of a second piece of viewer architecture.
 *
 * Shown UNFILTERED (no grayscale/contrast), unlike the 48x48
 * thumbnails that trigger it — design.md ties that filter to the
 * thumbnail specifically, and the point of the full view is to
 * actually read the receipt clearly.
 */
export default function ImageViewerModal({ isOpen, onClose, imageData }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="RECEIPT" size="lg">
      {imageData && (
        <div className="flex items-center justify-center h-full w-full">
          <img
            src={imageData}
            alt="receipt full view"
            className="max-w-full max-h-full object-contain border-2 border-white"
          />
        </div>
      )}
    </Modal>
  );
}
