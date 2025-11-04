/**
 * Centralized route configuration for all Mochi apps
 *
 * This file contains all app routes for easy maintenance and updates.
 * Use these constants instead of hardcoding URLs throughout the app.
 */
export const APP_ROUTES = {
  // Core app (Authentication)
  CORE: {
    BASE: '/',
    SIGN_IN: '/sign-in',
    SIGN_UP: '/sign-up',
    FORGOT_PASSWORD: '/forgot-password',
    OTP: '/otp',
  },
  // Chat app
  CHAT: {
    BASE: '/apps/chat/',
    HOME: '/apps/chat/',
  },
  // Friends app
  FRIENDS: {
    BASE: '/apps/friends/',
    HOME: '/apps/friends/',
  },
  // Home app (future)
  HOME: {
    BASE: '/apps/home',
    HOME: '/apps/home/',
  },
  // Feeds app (future)
  FEEDS: {
    BASE: '/apps/feeds',
    HOME: '/apps/feeds/',
  },
} as const

export type AppRoutes = typeof APP_ROUTES
