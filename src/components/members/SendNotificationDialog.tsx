import { useMemo, useState } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../common/Button/Button';
import modalStyles from '../common/Modal/Modal.module.css';
import styles from './SendNotificationDialog.module.css';

type Props = {
  isOpen: boolean;
  recipientCount: number;
  loading?: boolean;
  error?: string | null;
  onSend: (payload: { subject: string; body: string }) => void | Promise<void>;
  onClose: () => void;
};

export function SendNotificationDialog({
  isOpen,
  recipientCount,
  loading = false,
  error,
  onSend,
  onClose,
}: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const canSend = useMemo(() => {
    if (loading) return false;
    return recipientCount > 0 && subject.trim().length > 0 && body.trim().length > 0;
  }, [body, loading, recipientCount, subject]);

  const handleSubmit = async () => {
    if (!canSend) return;
    await onSend({ subject: subject.trim(), body: body.trim() });
  };

  return (
    <ModalOverlay
      isOpen={isOpen}
      className={modalStyles.overlay}
      isDismissable={!loading}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal className={modalStyles.dialog}>
        <Dialog aria-labelledby="send-notification-title">
          {({ close }) => (
            <>
              <div className={modalStyles.header}>
                <div>
                  <Heading slot="title" className={modalStyles.title}>
                    Send notification
                  </Heading>
                  <p slot="description" className={modalStyles.description}>
                    Email selected members with a custom message.
                  </p>
                </div>
                <Button
                  type="button"
                  className={modalStyles.closeButton}
                  onPress={close}
                  isDisabled={loading}
                  aria-label="Close dialog"
                >
                  ×
                </Button>
              </div>
              <div className={modalStyles.body}>
                <div className={styles.toLine}>{`To: ${recipientCount} member${
                  recipientCount === 1 ? '' : 's'
                }`}</div>
                <label className={styles.field}>
                  <span className={styles.label}>Subject</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Notification subject"
                    disabled={loading}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Message</span>
                  <textarea
                    className={styles.textarea}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write your message"
                    rows={5}
                    disabled={loading}
                  />
                </label>
                {error ? (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                ) : null}
              </div>
              <div className={modalStyles.footer}>
                <Button type="button" variant="outline" onPress={close} isDisabled={loading}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onPress={handleSubmit}
                  isDisabled={!canSend}
                >
                  {loading ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
