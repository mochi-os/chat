// feat(auth): implement login-header based auth flow
// Note: Auth is handled by core app, this service only manages local auth state
import { useAuthStore } from '@/stores/auth-store'

// Type definitions (moved from auth API since it's removed)
// Note: Must match AuthUser from auth-store.ts
type AuthUser = {
  email?: string
  name?: string
  accountNo?: string
  role?: string[] // Match the store type (array)
  exp?: number
}

type RequestCodeResponse = {
  success?: boolean
  data?: {
    email?: string
  }
}

type VerifyCodeResponse = {
  success?: boolean
  login?: string
  token?: string
  accessToken?: string
  user?: AuthUser
}

const devConsole = globalThis.console

/**
 * Log errors in development mode only
 */
const logError = (context: string, error: unknown) => {
  if (import.meta.env.DEV) {
    devConsole?.error?.(`[Auth Service] ${context}`, error)
  }
}

/**
 * Request verification code for email
 *
 * @param _email - User's email address (unused - auth handled by core app)
 * @returns Response with verification code (in dev) or success message
 */
export const requestCode = async (
  _email: string
): Promise<RequestCodeResponse> => {
  // Auth is handled by core app - this is a placeholder
  // In practice, user should authenticate via /sign-in
  throw new Error('Authentication is handled by the core app. Please use /sign-in')
}

/**
 * Verify code and authenticate user
 *
 * Authentication Flow:
 * 1. Call backend to verify the code
 * 2. Extract `login` field (primary credential) from response
 * 3. Extract optional `token`/`accessToken` field (fallback credential)
 * 4. Extract user email from `login` or `user.email` field
 * 5. Store credentials in cookies and Zustand store via setAuth()
 *
 * The `login` value is the primary credential and will be used as-is
 * in the Authorization header. The token is optional fallback.
 *
 * @param _code - Verification code from email (unused - auth handled by core app)
 * @returns Response with token and user info
 */
export const verifyCode = async (
  _code: string
): Promise<VerifyCodeResponse & { accessToken?: string; success: boolean }> => {
  // Auth is handled by core app - this is a placeholder
  // In practice, user should authenticate via /sign-in
  throw new Error('Authentication is handled by the core app. Please use /sign-in')
}

/**
 * Validate current session by fetching user info
 *
 * This function checks if the current session is valid by:
 * 1. Checking for credentials (login or token) in store
 * 2. Optionally calling /me endpoint to validate with backend
 * 3. Updating user data if successful
 * 4. Clearing auth if validation fails
 *
 * @returns User info if session is valid, null otherwise
 */
export const validateSession = async (): Promise<AuthUser | null> => {
  try {
    // Check if we have any credentials
    const { rawLogin, accessToken, user } = useAuthStore.getState()

    if (!rawLogin && !accessToken) {
      return null
    }

    // TODO: Uncomment when backend implements /me endpoint
    // try {
    //   const response: MeResponse = await authApi.me()
    //   useAuthStore.getState().setUser(response.user)
    //   return response.user
    // } catch (meError) {
    //   logError('Failed to fetch user profile from /me', meError)
    //   // If /me fails, clear auth
    //   useAuthStore.getState().clearAuth()
    //   return null
    // }

    // For now, just return the current user from store
    // This assumes the credentials are valid if they exist
    // Type assertion needed because store's AuthUser has role as string[]
    return user as AuthUser | null
  } catch (error) {
    logError('Failed to validate session', error)
    // Clear auth on validation failure
    useAuthStore.getState().clearAuth()
    return null
  }
}

/**
 * Logout user
 *
 * This function:
 * 1. Optionally calls backend logout endpoint
 * 2. Clears all authentication state (cookies + store)
 * 3. Always succeeds (clears local state even if backend call fails)
 */
export const logout = async (): Promise<void> => {
  try {
    // TODO: Uncomment when backend implements logout endpoint
    // await authApi.logout()

    // Clear auth state (removes cookies and clears store)
    useAuthStore.getState().clearAuth()
  } catch (error) {
    logError('Logout failed', error)
    // Clear auth even if backend call fails
    useAuthStore.getState().clearAuth()
  }
}

/**
 * Load user profile from /me endpoint
 *
 * This function:
 * 1. Checks for credentials in store
 * 2. Calls /me endpoint to get user profile
 * 3. Updates store with user data
 * 4. Returns user info or null
 *
 * Call this after successful authentication to populate user data for UI.
 *
 * @returns User info if successful, null otherwise
 */
export const loadUserProfile = async (): Promise<AuthUser | null> => {
  try {
    // Check if we have credentials first
    const { rawLogin, accessToken } = useAuthStore.getState()

    if (!rawLogin && !accessToken) {
      return null
    }

    // TODO: Uncomment when backend implements /me endpoint
    // try {
    //   const response: MeResponse = await authApi.me()
    //   useAuthStore.getState().setUser(response.user)
    //   return response.user
    // } catch (meError) {
    //   logError('Failed to fetch user profile from /me', meError)
    //   // Fall through to return current user from store
    // }

    // For now, return current user from store
    // (might be from JWT decode or from login response)
    // Type assertion needed because store's AuthUser has role as string[]
    return useAuthStore.getState().user as AuthUser | null
  } catch (error) {
    logError('Failed to load user profile', error)
    return null
  }
}

// Alias for backward compatibility
export const sendVerificationCode = requestCode

export type { AuthUser, RequestCodeResponse, VerifyCodeResponse }
