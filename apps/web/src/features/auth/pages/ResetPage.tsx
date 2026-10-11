import { readTokenFromHash } from '../utils/hashToken'
import { ResetConfirmPage } from './ResetConfirmPage'
import { ResetRequestPage } from './ResetRequestPage'

// ARCHITECTURE §9: the email link is `/reset#t=<token>` — request and confirm share
// one route, split by whether the fragment carries a token.
export function ResetPage() {
  const hasToken = readTokenFromHash(window.location.hash) !== null
  return hasToken ? <ResetConfirmPage /> : <ResetRequestPage />
}
