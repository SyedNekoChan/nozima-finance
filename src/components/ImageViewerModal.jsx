import Modal from './Modal.jsx';

/*
 * The receipt, full size and unfiltered, so it can actually be read.
 * Opened from a row's thumbnail or the entry form.
 */
export default function ImageViewerModal({ isOpen, onClose, imageData }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receipt" size="lg">
      {imageData && (
        <div className="flex items-center justify-center h-full w-full">
          <img src={imageData} alt="Receipt" className="max-w-full max-h-[72dvh] object-contain rounded" />
        </div>
      )}
    </Modal>
  );
}
