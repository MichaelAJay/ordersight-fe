import { useCallback, useMemo } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../Button/Button';
import modalStyles from '../Modal/Modal.module.css';
import styles from './ConfirmDialog.module.css';

type Props = {
  isOpen: boolean;
  title: string;
  description?: string;
  details?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  error,
}: Props) {
  const safeClose = useCallback(() => {
    if (loading) return;
    onCancel();
  }, [loading, onCancel]);
  const footer = useMemo(
    () => (
      <>
        <Button type="button" variant="outline" onPress={safeClose} isDisabled={loading}>
          {cancelLabel}
        </Button>
        <Button type="button" variant="primary" onPress={onConfirm} isDisabled={loading}>
          {loading ? 'Working...' : confirmLabel}
        </Button>
      </>
    ),
    [cancelLabel, confirmLabel, loading, onConfirm, safeClose],
  );

  return (
    <ModalOverlay
      isOpen={isOpen}
      className={modalStyles.overlay}
      isDismissable={!loading}
      onOpenChange={(open) => {
        if (!open) safeClose();
      }}
    >
      <Modal className={modalStyles.dialog}>
        <Dialog>
          {({ close }) => (
            <>
              <div className={modalStyles.header}>
                <div>
                  <Heading slot="title" className={modalStyles.title}>
                    {title}
                  </Heading>
                  {description ? (
                    <p slot="description" className={modalStyles.description}>
                      {description}
                    </p>
                  ) : null}
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
                {details ? <div className={styles.details}>{details}</div> : null}
                {error ? (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                ) : null}
              </div>
              <div className={modalStyles.footer}>{footer}</div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
