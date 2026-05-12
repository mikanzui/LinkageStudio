import type { Configuration } from '@azure/msal-browser';
import { LogLevel } from '@azure/msal-browser';

const CLIENT_ID = 'a69f1ac8-5335-430c-a55f-808c85ced4fa';

export const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin + import.meta.env.BASE_URL,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (_level, message, containsPii) => {
        if (!containsPii) console.debug('[MSAL]', message);
      },
    },
  },
};

export const loginScopes = ['User.Read', 'Files.ReadWrite'];
export const graphScopes = ['Files.ReadWrite'];
