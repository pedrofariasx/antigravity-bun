import { Elysia, t } from 'elysia';
import { Server } from 'socket.io';
import { swagger } from '@elysiajs/swagger';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { cookie } from '@elysiajs/cookie';
import { html } from '@elysiajs/html';
import { serverTiming } from '@elysiajs/server-timing';
import { config } from './config/configuration';
import { accountsService } from './accounts/accounts.service';
import { quotaService } from './quota/quota.service';
import { apiKeysService } from './api-keys/api-keys.service';
import { antigravityService } from './antigravity/antigravity.service';
import { authService } from './auth/auth.service';
import { databaseService } from './database/database.service';
import { eventsService } from './events/events.service';
import { join } from 'path';
import { oauthService } from './oauth/oauth.service';

const app = new Elysia()
  .use(cors())
  .use(cookie())
  .use(html())
  .use(serverTiming())
  .use(
    staticPlugin({
      assets: 'public',
      prefix: '/public',
    }),
  )
  .onRequest(({ request }) => {
    console.log(`[${request.method}] ${new URL(request.url).pathname}`);
  })
  .use(
    swagger({
      provider: 'swagger-ui',
      path: '/docs',
      documentation: {
        info: {
          title: 'Antigravity API',
          version: '1.0.0',
          description:
            'OpenAI and Anthropic compatible API proxy (Elysia Edition)',
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
          },
        },
      },
    }),
  )
  // Global Middleware for API Key Validation
  .derive(({ headers, path }) => {
    if (path.startsWith('/v1/')) {
      const isAnthropic = path === '/v1/messages';
      let token = '';

      if (isAnthropic) {
        token = headers['x-api-key'] || '';
      } else {
        const auth = headers['authorization'] || '';
        if (auth.startsWith('Bearer ')) {
          token = auth.substring(7);
        }
      }

      if (!token) {
        return { apiKeyData: null, authError: 'Missing API Key' };
      }

      const { valid, keyData } = apiKeysService.validateApiKey(token);
      if (!valid || !keyData) {
        return { apiKeyData: null, authError: 'Invalid API Key' };
      }

      return { apiKeyData: keyData, authError: null };
    }
    return { apiKeyData: null, authError: null };
  })
  // Health Check
  .get('/health', () => ({ status: 'ok', runtime: 'Bun + Elysia' }))

  // API Proxy Group
  .group('/v1', (app) =>
    app
      .onBeforeHandle(({ apiKeyData, authError, set }) => {
        if (authError) {
          set.status = 401;
          return {
            error: { message: authError, type: 'authentication_error' },
          };
        }
      })
      // OpenAI compatible endpoints
      .post('/chat/completions', async ({ body, set, apiKeyData }) => {
        const dto = body as any;

        if (dto.stream) {
          return new Response(
            new ReadableStream({
              async start(controller) {
                const write = (data: string) =>
                  controller.enqueue(new TextEncoder().encode(data));
                const end = () => controller.close();
                const setHeader = (name: string, value: string) => {
                  /* Elysia set.headers is used for response */
                };

                try {
                  await antigravityService.chatCompletionStream(
                    dto,
                    write,
                    end,
                    (n, v) => {
                      set.headers[n] = v;
                    },
                    undefined,
                    apiKeyData,
                  );
                } catch (e: any) {
                  controller.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify({ error: e.message })}\n\n`,
                    ),
                  );
                  controller.close();
                }
              },
            }),
            {
              headers: { 'Content-Type': 'text/event-stream' },
            },
          );
        }

        return await antigravityService.chatCompletion(
          dto,
          undefined,
          apiKeyData,
        );
      })
      .get('/models', () => antigravityService.listModels())
      .get('/quota', () => antigravityService.getQuotaStatus())

      // Anthropic compatible endpoints
      .post('/messages', async ({ body, set, apiKeyData, headers }) => {
        const dto = body as any;
        const messageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

        if (dto.stream) {
          return new Response(
            new ReadableStream({
              async start(controller) {
                const write = (data: string) =>
                  controller.enqueue(new TextEncoder().encode(data));
                const end = () => controller.close();

                try {
                  await antigravityService.anthropicMessagesStream(
                    dto,
                    write,
                    end,
                    (n, v) => {
                      set.headers[n] = v;
                    },
                    messageId,
                    undefined,
                    apiKeyData,
                  );
                } catch (e: any) {
                  controller.enqueue(
                    new TextEncoder().encode(
                      `event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`,
                    ),
                  );
                  controller.close();
                }
              },
            }),
            {
              headers: { 'Content-Type': 'text/event-stream' },
            },
          );
        }

        return await antigravityService.anthropicMessages(
          dto,
          messageId,
          undefined,
          apiKeyData,
        );
      }),
  )

  // Dashboard Auth Middleware
  .derive(({ cookie: { session } }) => {
    // In a real app, validate session ID against DB
    return {
      isAuthorized: !!session.value,
    };
  })

  // Basic Dashboard Routes
  .get('/', () => Bun.file('public/index.html'))
  .get('/login', () => Bun.file('public/login.html'))

  // Auth Group
  .group('/auth', (app) =>
    app
      .post('/login', ({ body, cookie: { session }, set }) => {
        const { username, password } = body as any;
        if (authService.validateDashboardCredentials(username, password)) {
          session.value = authService.generateSessionId();
          session.httpOnly = true;
          session.path = '/';
          session.maxAge = 60 * 60 * 24 * 7; // 1 week
          return { success: true };
        }
        set.status = 401;
        return { error: 'Invalid credentials' };
      })
      .post('/logout', ({ cookie: { session } }) => {
        session.remove();
        return { success: true };
      }),
  )

  // Accounts Management
  .group('/accounts', (app) =>
    app
      .get('/status', () => accountsService.getStatus())
      .get('/:id/export', ({ params: { id }, set }) => {
        const credential = accountsService.getAccountForExport(id);
        if (!credential) {
          set.status = 404;
          return { error: 'Account not found' };
        }
        return credential;
      })
      .delete('/:id', ({ params: { id }, set }) => {
        const success = accountsService.deleteAccount(id);
        if (!success) {
          set.status = 404;
          return { error: 'Account not found' };
        }
        return { success: true, message: 'Account deleted' };
      })
      .post('/manual', ({ body }) => accountsService.addAccount(body as any)),
  )

  // Dashboard API Group
  .group('/api', (app) =>
    app
      .get('/dashboard', () => {
        try {
          const status = accountsService.getStatus();
          const quotaStatus = quotaService.getQuotaStatus(
            accountsService.getAccountsForQuotaStatus(),
          );
          return { status, quotaStatus };
        } catch (error) {
          console.error('[API] /dashboard error:', error);
          throw error;
        }
      })
      .get('/models', () => antigravityService.listModels())
      .get('/quota/refresh', async () => {
        await antigravityService.getQuotaStatus();
        const status = accountsService.getStatus();
        const quotaStatus = quotaService.getQuotaStatus(
          accountsService.getAccountsForQuotaStatus(),
        );
        return { status, quotaStatus };
      })
      .group('/database', (app) =>
        app
          .post('/reset', () => databaseService.resetDatabase())
          .get('/export', ({ set }) => {
            set.headers['Content-Disposition'] =
              'attachment; filename="antigravity-db.json"';
            set.headers['Content-Type'] = 'application/json';
            return databaseService.exportData();
          })
          .post('/import', ({ body }) => {
            return databaseService.importData(body as any);
          }),
      )
      .group('/keys', (app) =>
        app
          .onBeforeHandle(({ isAuthorized, set }) => {
            // if (!isAuthorized) { set.status = 401; return { error: 'Unauthorized' }; }
          })
          .get('/', () => {
            const keys = apiKeysService.getAllApiKeys();
            return {
              keys: keys.map((k) => ({
                ...k,
                key:
                  k.key.substring(0, 10) +
                  '...' +
                  k.key.substring(k.key.length - 4),
              })),
            };
          })
          .get('/stats/analytics', () => apiKeysService.getAnalyticsData())
          .post('/', ({ body, set }) => {
            const {
              name,
              dailyLimit,
              rateLimitPerMinute,
              allowedModels,
              corsOrigin,
              smartContext,
              smartContextLimit,
              description,
            } = body as any;
            if (!name) {
              set.status = 400;
              return { error: 'Name is required' };
            }
            const result = apiKeysService.createApiKey(
              name,
              dailyLimit,
              rateLimitPerMinute,
              smartContext,
              smartContextLimit,
              allowedModels,
              description,
              corsOrigin,
            );
            set.status = 201;
            return { ...result, success: true };
          })
          .put('/:id', ({ params: { id }, body }) => ({
            success: apiKeysService.updateApiKey(parseInt(id), body as any),
          }))
          .post('/:id/activate', ({ params: { id } }) => ({
            success: apiKeysService.activateApiKey(parseInt(id)),
          }))
          .post('/:id/deactivate', ({ params: { id } }) => ({
            success: apiKeysService.deactivateApiKey(parseInt(id)),
          }))
          .post(
            '/:id/smart-context',
            ({ params: { id }, body: { enabled } }: any) => ({
              success: apiKeysService.toggleSmartContext(parseInt(id), enabled),
            }),
          )
          .delete('/:id', ({ params: { id } }) => ({
            success: apiKeysService.deleteApiKey(parseInt(id)),
          })),
      ),
  )

  // OAuth flow
  .group('/oauth', (app) =>
    app
      .get('/authorize', () => {
        return Response.redirect(oauthService.getAuthorizationUrl());
      })
      .get('/callback', async ({ query: { code, error }, set }) => {
        if (error) return { type: 'OAUTH_ERROR', message: error };
        if (!code) {
          set.status = 400;
          return { error: 'Missing code' };
        }
        try {
          const result = await oauthService.exchangeCodeForTokens(code);

          // Trigger quota refresh in background
          antigravityService.getQuotaStatus().catch(console.error);

          set.headers['Content-Type'] = 'text/html';
          return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Authentication Successful</title>
                <style>
                    body {
                        background-color: #111827;
                        color: #e5e7eb;
                        font-family: system-ui, -apple-system, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                    }
                    .success {
                        color: #34d399;
                        margin-bottom: 1rem;
                    }
                    button {
                        background-color: #3b82f6;
                        color: white;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 0.375rem;
                        cursor: pointer;
                        font-size: 0.875rem;
                        transition: background-color 0.2s;
                    }
                    button:hover {
                        background-color: #2563eb;
                    }
                </style>
            </head>
            <body>
                <h2 class="success">Authentication Successful!</h2>
                <p>You can close this window now.</p>
                <button onclick="window.close()">Close Window</button>
                <script>
                    try {
                        window.opener.postMessage(${JSON.stringify({ type: 'OAUTH_SUCCESS', ...result })}, '*');
                    } catch (e) {
                        console.error('Failed to notify parent window:', e);
                    }
                    setTimeout(() => window.close(), 1000);
                </script>
            </body>
            </html>
          `;
        } catch (e: any) {
          return { type: 'OAUTH_ERROR', message: e.message };
        }
      }),
  )

  // Start Server
  .listen(config.port);

// Initialize Socket.IO (on separate port to avoid Bun/Elysia conflict)
const wsPort = config.port + 1;
const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.listen(wsPort);

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  const sub = eventsService.events$.subscribe(({ event, data }) => {
    socket.emit(event, data);
    // Backward compatibility for generic 'dashboard.update' if needed
    if (event === 'dashboard.update') {
      socket.emit('dashboard.update', data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
    sub.unsubscribe();
  });
});

console.log(`
  🚀 ANTIGRAVITY SERVER (Elysia): http://localhost:${config.port}
  Dashboard: http://localhost:${config.port}/
  API Proxy: http://localhost:${config.port}/v1/
  API Docs:  http://localhost:${config.port}/docs
  Socket.IO: http://localhost:${wsPort}
`);

if (!accountsService.hasAccounts()) {
  console.warn(
    '⚠️ NO ACCOUNTS CONFIGURED. Visit /oauth/authorize to add accounts.',
  );
}
