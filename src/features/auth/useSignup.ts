import { useMutation } from '@tanstack/react-query';
import { signup } from './api';

export function useSignup() {
  return useMutation({
    mutationFn: signup,
    // onSuccess: (data) => queryClient.invalidateQueries({ queryKey: ['currentUser'] })
  });
}
