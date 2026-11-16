import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { CloudError } from './types';
import type { CloudAuth } from './types';

type Client = Pick<IPublicClientApplication, 'initialize' | 'getAllAccounts' | 'loginPopup' | 'acquireTokenSilent' | 'clearCache'>;
const scopes = ['Files.ReadWrite'];
export function createCloudAuth(load: () => Promise<Client>): CloudAuth {
  let client: Client | undefined, ready: Promise<void> | undefined, interactive = false;
  const requireClient = () => {
    if (!client) throw new CloudError('auth', 'Cloud sign-in is not ready.');
    return client;
  };
  const account = (id: string): AccountInfo => {
    const found = requireClient().getAllAccounts().find(a => a.homeAccountId === id);
    if (!found) throw new CloudError('auth', 'Reconnect this account before using OneDrive.');
    return found;
  };
  return {
    initialize() {
      ready ??= load().then(async c => { await c.initialize(); client = c; }).catch(() => {
        ready = undefined;
        throw new CloudError('auth', 'Cloud sign-in could not initialize. Local editing is still available.');
      });
      return ready;
    },
    accounts: () => client?.getAllAccounts().map(a => ({ id: a.homeAccountId, label: a.username || a.name || 'Microsoft account' })) ?? [],
    async signIn() {
      const c = requireClient();
      if (interactive) throw new CloudError('auth', 'A sign-in window is already open.');
      interactive = true;
      try {
        // Invoked directly from a fresh button action, never from background autosave.
        const result = await c.loginPopup({ scopes, prompt: 'select_account' });
        if (!result.account) throw new Error('No account');
        return { id: result.account.homeAccountId, label: result.account.username || result.account.name || 'Microsoft account' };
      } catch { throw new CloudError('auth', 'Sign-in did not complete. Retry from the Projects window.'); }
      finally { interactive = false; }
    },
    async signOut(id) {
      try { await requireClient().clearCache({ account: account(id) }); }
      catch { throw new CloudError('auth', 'Could not disconnect this account.'); }
    },
    async token(id) {
      const captured = account(id);
      try {
        const result = await requireClient().acquireTokenSilent({ account: captured, scopes });
        if (!result.accessToken || result.account?.homeAccountId !== id) throw new Error('Account changed');
        return result.accessToken;
      } catch { throw new CloudError('auth', 'Reconnect this account in Projects. Local changes are retained.'); }
    },
  };
}

// The editor never imports/initializes MSAL until the optional library is opened.
export const cloudAuth = createCloudAuth(async () => {
  const { PublicClientApplication } = await import('@azure/msal-browser');
  return new PublicClientApplication({
    auth: {
      clientId: import.meta.env.VITE_MSAL_CLIENT_ID || 'a69f1ac8-5335-430c-a55f-808c85ced4fa',
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: new URL(`${import.meta.env.BASE_URL}redirect.html`, location.origin).href,
    },
    cache: { cacheLocation: 'sessionStorage' },
    system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
  });
});
