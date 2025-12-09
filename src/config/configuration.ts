export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  // Proxy authentication
  proxyApiKey: process.env.PROXY_API_KEY ?? '',

  // Antigravity OAuth credentials
  antigravity: {
    accessToken: process.env.ANTIGRAVITY_ACCESS_TOKEN ?? '',
    refreshToken: process.env.ANTIGRAVITY_REFRESH_TOKEN ?? '',
    expiryDate: parseInt(process.env.ANTIGRAVITY_EXPIRY_DATE ?? '0', 10),
    projectId: process.env.ANTIGRAVITY_PROJECT_ID ?? '',
    email: process.env.ANTIGRAVITY_EMAIL ?? '',
    clientId:
      process.env.ANTIGRAVITY_CLIENT_ID ??
      '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
    clientSecret:
      process.env.ANTIGRAVITY_CLIENT_SECRET ??
      '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',
  },

  // OAuth settings
  oauth: {
    callbackPort: parseInt(process.env.OAUTH_CALLBACK_PORT ?? '51121', 10),
    callbackPath: process.env.OAUTH_CALLBACK_PATH || '/oauthcallback',
    tokenUri: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/cclog',
      'https://www.googleapis.com/auth/experimentsandconfigs',
    ],
  },
});
