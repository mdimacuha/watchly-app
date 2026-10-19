const PATHS = {
  BASE_URL: '/',
  AUTH: {
    SIGN_IN: '/signin',
    SIGN_UP: '/signup',
    FORGOT_PASSWORD: '/forgot-password',
  },
  ONBOARDING: {
    WELCOME: '/onboarding/welcome',
    PROFILE: '/onboarding/profile',
    REGION_AUTO: '/onboarding/region/auto',
    REGION_MANUAL: '/onboarding/region/manual',
    TITLES: '/onboarding/titles',
  },
  SEARCH: '/search',
  FOR_YOU: '/for-you',
  SWIPE: '/swipe',
  CHANGELOGS: '/changelogs',
  WATCHLISTS: '/watchlists',
  FAVORITES: '/favorites',
  ME: '/me',
  SETTINGS: {
    ROOT: '/settings',
    REGION: '/settings#settings-watching',
  },
  INTERNAL: {
    DOCUMENTATION: '/docs',
    DOCS: {
      DESIGN_SYSTEM: '/docs/design-system',
      COMPONENT_PLAYGROUND: '/docs/component-playground',
      RESPONSIVE_GUIDELINES: '/docs/responsive-guidelines',
      TOP_NOTICE_BAR: '/docs/top-notice-bar',
    },
  },
  BUSINESS: {
    PRIVACY_POLICY: '/privacy',
    TERMS_OF_SERVICE: '/terms',
    // Feedback / support inbox. Placeholder address — swap for the real
    // support mailbox before launch.
    CONTACT: 'mailto:hello@watchly.app',
  },
};

const EXTERNAL_PATHS = {
  LANDING_URL: 'https://gowatchly.com',
  BUSINESS: {
    PRIVACY_POLICY: 'https://gowatchly.com/privacy',
    TERMS_OF_SERVICE: 'https://gowatchly.com/terms',
    FEEDBACK: 'https://feedback.gowatchly.com/',
  }
}

export { PATHS, EXTERNAL_PATHS };
