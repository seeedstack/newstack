import { useMutation } from '@tanstack/react-query'

import { confirmPasswordReset, login, requestPasswordReset, signup, verifyEmail } from '../api'

export function useSignup() {
  return useMutation({ mutationFn: ({ email, password }: { email: string; password: string }) => signup(email, password) })
}

export function useLogin() {
  return useMutation({ mutationFn: ({ email, password }: { email: string; password: string }) => login(email, password) })
}

export function useVerifyEmail() {
  return useMutation({ mutationFn: (token: string) => verifyEmail(token) })
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => requestPasswordReset(email) })
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: ({ token, newPassword }: { token: string; newPassword: string }) => confirmPasswordReset(token, newPassword),
  })
}
