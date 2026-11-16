// External test-build dependency replacement. Never imported by a production build.
export class PublicClientApplication {
  async initialize() {
    const response = await fetch('/__test_auth__/initialize');
    if (!response.ok) throw new Error('Injected initialization failure');
    if (!sessionStorage.getItem('test-msal-accounts')) sessionStorage.setItem('test-msal-accounts', JSON.stringify([{ homeAccountId: 'account-A', username: 'a@example.test' }]));
  }
  getAllAccounts() { return JSON.parse(sessionStorage.getItem('test-msal-accounts') || '[]'); }
  async loginPopup() {
    const response = await fetch('/__test_auth__/login');
    if (!response.ok) throw new Error('Injected sign-in failure');
    const account = await response.json();
    sessionStorage.setItem('test-msal-accounts', JSON.stringify([...this.getAllAccounts().filter(a => a.homeAccountId !== account.homeAccountId), account]));
    return { account };
  }
  async acquireTokenSilent({ account }) {
    const response = await fetch('/__test_auth__/token?account=' + encodeURIComponent(account.homeAccountId));
    if (!response.ok) throw new Error('Injected credential expiry');
    return { account, accessToken: 'test-only-' + account.homeAccountId };
  }
  async clearCache({ account }) { sessionStorage.setItem('test-msal-accounts', JSON.stringify(this.getAllAccounts().filter(a => a.homeAccountId !== account.homeAccountId))); }
}
