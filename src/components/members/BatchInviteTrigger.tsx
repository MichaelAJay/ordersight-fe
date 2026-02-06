import type { ComponentProps } from 'react';
import { Dialog, DialogTrigger, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../common/Button/Button';
import modalStyles from '../common/Modal/Modal.module.css';
import { BatchInvitePanel } from './BatchInvitePanel';

type Props = Pick<ComponentProps<typeof BatchInvitePanel>, 'onInvitesComplete' | 'onAuthRequired'>;

export function BatchInviteTrigger({ onInvitesComplete, onAuthRequired }: Props) {
  return (
    <DialogTrigger>
      <Button type="button">Invite</Button>
      <ModalOverlay className={modalStyles.overlay} isDismissable>
        <Modal className={modalStyles.dialog}>
          <Dialog aria-labelledby="batch-invite-title">
            {({ close }) => (
              <BatchInvitePanel
                onInvitesComplete={onInvitesComplete}
                onAuthRequired={onAuthRequired}
                onRequestClose={close}
              />
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
