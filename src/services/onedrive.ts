import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { graphScopes } from '../auth/msal-config';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const FOLDER_PATH = 'Documents/LinkageStudio';

async function getToken(instance: IPublicClientApplication, account: AccountInfo): Promise<string> {
  try {
    const resp = await instance.acquireTokenSilent({ scopes: graphScopes, account });
    return resp.accessToken;
  } catch {
    const resp = await instance.acquireTokenPopup({ scopes: graphScopes, account });
    return resp.accessToken;
  }
}

async function graphFetch(
  instance: IPublicClientApplication,
  account: AccountInfo,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getToken(instance, account);
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

export interface OneDriveFile {
  id: string;
  name: string;
  lastModifiedDateTime: string;
  size: number;
}

/** Ensure the LinkageStudio folder exists inside Documents. */
async function ensureFolder(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<void> {
  const resp = await graphFetch(instance, account, `/me/drive/root:/${FOLDER_PATH}`);
  if (resp.ok) return;

  // Create the folder
  const createResp = await graphFetch(instance, account, `/me/drive/root:/Documents:/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'LinkageStudio',
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    }),
  });
  if (!createResp.ok && createResp.status !== 409) {
    throw new Error(`Failed to create LinkageStudio folder: ${createResp.status}`);
  }
}

/** List .slinker files in Documents/LinkageStudio */
export async function listProjects(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<OneDriveFile[]> {
  await ensureFolder(instance, account);
  const resp = await graphFetch(
    instance,
    account,
    `/me/drive/root:/${FOLDER_PATH}:/children?$orderby=lastModifiedDateTime desc`,
  );
  if (!resp.ok) throw new Error(`Failed to list projects: ${resp.status}`);
  const data = await resp.json();
  return (data.value || [])
    .filter((item: Record<string, unknown>) => (item.name as string).endsWith('.slinker'))
    .map((item: Record<string, unknown>) => ({
      id: item.id as string,
      name: item.name as string,
      lastModifiedDateTime: item.lastModifiedDateTime as string,
      size: item.size as number,
    }));
}

/** Load a .slinker file by drive item ID, returns raw JSON string. */
export async function loadProject(
  instance: IPublicClientApplication,
  account: AccountInfo,
  itemId: string,
): Promise<string> {
  const resp = await graphFetch(instance, account, `/me/drive/items/${itemId}/content`);
  if (!resp.ok) throw new Error(`Failed to load project: ${resp.status}`);
  return resp.text();
}

/** Save (create or overwrite) a .slinker file. Returns the drive item ID. */
export async function saveProject(
  instance: IPublicClientApplication,
  account: AccountInfo,
  fileName: string,
  content: string,
): Promise<string> {
  await ensureFolder(instance, account);
  const safeName = fileName.endsWith('.slinker') ? fileName : `${fileName}.slinker`;
  const resp = await graphFetch(
    instance,
    account,
    `/me/drive/root:/${FOLDER_PATH}/${safeName}:/content`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    },
  );
  if (!resp.ok) throw new Error(`Failed to save project: ${resp.status}`);
  const data = await resp.json();
  return data.id as string;
}

/** Delete a file by drive item ID. */
export async function deleteProject(
  instance: IPublicClientApplication,
  account: AccountInfo,
  itemId: string,
): Promise<void> {
  const resp = await graphFetch(instance, account, `/me/drive/items/${itemId}`, {
    method: 'DELETE',
  });
  if (!resp.ok && resp.status !== 404) throw new Error(`Failed to delete: ${resp.status}`);
}

/** Rename a file by drive item ID. */
export async function renameProject(
  instance: IPublicClientApplication,
  account: AccountInfo,
  itemId: string,
  newName: string,
): Promise<void> {
  const safeName = newName.endsWith('.slinker') ? newName : `${newName}.slinker`;
  const resp = await graphFetch(instance, account, `/me/drive/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safeName }),
  });
  if (!resp.ok) throw new Error(`Failed to rename: ${resp.status}`);
}
