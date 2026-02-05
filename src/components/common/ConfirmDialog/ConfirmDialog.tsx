import { useMemo } from 'react';
import { Button } from '../Button/Button';
import { Modal } from '../Modal/Modal';
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
  const safeClose = loading ? () => {} : onCancel;
  const footer = useMemo(
    () => (
      <>
        <Button type="button" variant="outline" onClick={safeClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button type="button" variant="primary" onClick={onConfirm} disabled={loading}>
          {loading ? 'Working...' : confirmLabel}
        </Button>
      </>
    ),
    [cancelLabel, confirmLabel, loading, onConfirm, safeClose],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={safeClose}
      title={title}
      description={description}
      footer={footer}
      closeOnBackdrop={!loading}
    >
      {details ? <div className={styles.details}>{details}</div> : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
