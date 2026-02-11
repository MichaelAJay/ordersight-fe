import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/common/Button/Button';
import modalStyles from '@/components/common/Modal/Modal.module.css';
import styles from './MenuModalStub.module.css';

type ImportMenusCsvModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImportMenusCsvModal({ isOpen, onOpenChange }: ImportMenusCsvModalProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      className={modalStyles.overlay}
      isDismissable
      onOpenChange={onOpenChange}
    >
      <Modal className={modalStyles.dialog}>
        <Dialog>
          {({ close }) => (
            <>
              <div className={modalStyles.header}>
                <div>
                  <Heading slot="title" className={modalStyles.title}>
                    Import CSV
                  </Heading>
                  <p slot="description" className={modalStyles.description}>
                    Upload a CSV to create menus in bulk.
                  </p>
                </div>
                <Button
                  type="button"
                  className={modalStyles.closeButton}
                  onPress={close}
                  aria-label="Close dialog"
                >
                  ×
                </Button>
              </div>
              <div className={modalStyles.body}>
                <p className={styles.note}>
                  This modal is a CSV wizard stub. We&apos;ll add upload, field mapping, validation,
                  and import review in the next phase.
                </p>
                <p className={styles.hint}>
                  Planned: template download and row-level import errors.
                </p>
              </div>
              <div className={modalStyles.footer}>
                <Button type="button" variant="primary" onPress={close}>
                  Close
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
