interface AccountCredential {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  projectId?: string;
}

/**
 * Legacy loader for initial migration.
 * This will be removed in future versions in favor of SQLite persistence.
 */
function loadAccountsFromEnv(): AccountCredential[] {
  const accounts: AccountCredential[] = [];
  let index = 1;

  while (index <= 50) {
    // Safety limit
    const envValue = process.env[`ANTIGRAVITY_ACCOUNTS_${index}`];
    if (envValue) {
      try {
        const parsed = JSON.parse(envValue) as AccountCredential;
        if (parsed.email && parsed.accessToken && parsed.refreshToken) {
          accounts.push(parsed);
        }
      } catch {
        console.warn(`Failed to parse ANTIGRAVITY_ACCOUNTS_${index}`);
      }
    }
    index++;
  }

  return accounts;
}

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  auth: {
    dashboardUsername: process.env.DASHBOARD_USERNAME ?? 'admin',
    dashboardPassword: process.env.DASHBOARD_PASSWORD ?? 'admin',
  },

  antigravity: {
    clientId:
      process.env.ANTIGRAVITY_CLIENT_ID ??
      '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
    clientSecret:
      process.env.ANTIGRAVITY_CLIENT_SECRET ??
      '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',
  },

  accounts: {
    list: loadAccountsFromEnv(),
    cooldownDurationMs: parseInt(
      process.env.COOLDOWN_DURATION_MS ?? '60000',
      10,
    ),
    maxRetryAccounts: parseInt(process.env.MAX_RETRY_ACCOUNTS ?? '3', 10),
  },

  oauth: {
    redirectUri: process.env.OAUTH_REDIRECT_URI,
    callbackPort: parseInt(process.env.OAUTH_CALLBACK_PORT ?? '51121', 10),
    callbackPath: process.env.OAUTH_CALLBACK_PATH || '/oauth/callback',
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
