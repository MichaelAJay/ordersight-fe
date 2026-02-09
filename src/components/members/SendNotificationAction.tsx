import { Button } from '../common/Button/Button';

type Props = {
  onPress: () => void;
  isDisabled?: boolean;
  label?: string;
};

export function SendNotificationAction({ onPress, isDisabled = false, label }: Props) {
  return (
    <Button type="button" variant="primary" size="sm" onPress={onPress} isDisabled={isDisabled}>
      {label ?? 'Send Notification'}
    </Button>
  );
}
