type Listener = () => void;

let authRecoveryRequired = false;
const listeners = new Set<Listener>();

export function getAuthRecoveryRequired() {
  return authRecoveryRequired;
}

export function setAuthRecoveryRequired(required: boolean) {
  if (authRecoveryRequired === required) return;
  authRecoveryRequired = required;
  listeners.forEach((listener) => listener());
}

export function requireAuthRecovery() {
  setAuthRecoveryRequired(true);
}

export function clearAuthRecoveryRequired() {
  setAuthRecoveryRequired(false);
}

export function subscribeAuthRecovery(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
