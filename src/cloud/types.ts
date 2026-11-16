export interface CloudAccount { id: string; label: string }

export interface CloudItem {
  driveId: string;
  id: string;
  name: string;
  eTag: string;
  lastModifiedDateTime: string;
  size: number;
}
export interface CloudRead { item: CloudItem; text: string }
export type CloudErrorCode = 'auth' | 'conflict' | 'quota' | 'offline' | 'missing' | 'invalid' | 'transient' | 'cancelled' | 'unknown';
export class CloudError extends Error {
  readonly code: CloudErrorCode;
  readonly status?: number;
  constructor(code: CloudErrorCode, message: string, status?: number) {
    super(message); this.name = 'CloudError'; this.code = code; this.status = status;
  }
}

/** A client is bound to one account for its entire lifetime. */
export interface CloudPort {
  readonly accountId: string;
  list(signal?: AbortSignal): Promise<CloudItem[]>;
  load(item: CloudItem, signal?: AbortSignal): Promise<CloudRead>;
  create(name: string, text: string, signal?: AbortSignal): Promise<CloudItem>;
  save(item: CloudItem, text: string, signal?: AbortSignal): Promise<CloudItem>;
  rename(item: CloudItem, name: string, signal?: AbortSignal): Promise<CloudItem>;
  remove(item: CloudItem, signal?: AbortSignal): Promise<void>;
}

export interface CloudCacheRow {
  accountId: string;
  item: CloudItem;
  text: string;
  updatedAt: number;
  revision: number;
  pending?: { text: string; projectName: string };
  remoteDeleted?: boolean;
}
export interface CloudCacheMetadata {
  accountId: string;
  item: CloudItem;
  updatedAt: number;
  revision: number;
  hasPending: boolean;
  remoteDeleted: boolean;
}
export interface CloudCache {
  list(accountId: string, limit?: number): Promise<CloudCacheMetadata[]>;
  read(accountId: string, driveId: string, itemId: string): Promise<CloudCacheRow | null>;
  write(row: CloudCacheRow): Promise<boolean>;
  remove(accountId: string, driveId: string, itemId: string, revision: number): Promise<boolean>;
  close(): void;
}

export interface CloudAuth {
  initialize(): Promise<void>;
  accounts(): CloudAccount[];
  signIn(): Promise<CloudAccount>;
  signOut(accountId: string): Promise<void>;
  token(accountId: string): Promise<string>;
}
