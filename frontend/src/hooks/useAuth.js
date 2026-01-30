import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const authContext = useAuthContext();
  const router = useRouter();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }) => {
      const result = await authContext.signIn(email, password);
      if (!result.success) {
        throw new Error(result.error || 'Login failed');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.resetQueries()
      router.replace('/');
    },
  });

  const signupMutation = useMutation({
    mutationFn: async ({ email, password, username, gender, dob, photo_url }) => {
      const result = await authContext.signUp(email, password, {
        username,
        gender,
        dob,
        photo_url,
      });
      if (!result.success) {
        throw new Error(result.error || 'Sign up failed');
      }
      return result;
    },
    onSuccess: (result) => {
      if (result.requiresConfirmation) {
        // If email confirmation is required, you might want to show a message
        // For now, we'll still redirect to home if session exists
        router.push('/');
      } else {
        router.push('/');
      }
    },
  });

  return {
    ...authContext,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    signup: signupMutation.mutate,
    signupAsync: signupMutation.mutateAsync,
    isSigningUp: signupMutation.isPending,
    signupError: signupMutation.error,
  };
}

