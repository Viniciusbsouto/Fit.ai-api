import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { openAPI } from 'better-auth/plugins';

import { prisma } from './db.js';
import { env } from './env.js';

export const auth = betterAuth({
  baseURL: env.API_BASE_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_APP_BASE_URL],
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            prompt: 'select_account',
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  emailAndPassword: {
    enabled: true,
  },
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  plugins: [openAPI()],
  advanced: env.COOKIE_DOMAIN
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain:
            env.NODE_ENV === 'production' ? '.viniciusbsout.com.br' : undefined,
        },
      }
    : undefined,
  logger: {
    disabled: env.NODE_ENV === 'test',
    level: env.NODE_ENV === 'development' ? 'debug' : 'warn',
  },
});
