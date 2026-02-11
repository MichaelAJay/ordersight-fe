import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/common/Button/Button';
import modalStyles from '@/components/common/Modal/Modal.module.css';
import styles from './MenuModalStub.module.css';

type CreateMenuModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateMenuModal({ isOpen, onOpenChange }: CreateMenuModalProps) {
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
                    Create menu
                  </Heading>
                  <p slot="description" className={modalStyles.description}>
                    Start a brand-new menu from scratch.
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
                  This modal is currently a stub. The full menu creation workflow will be added
                  next.
                </p>
                <p className={styles.hint}>
                  Planned: menu metadata, availability schedule, and item setup steps.
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
