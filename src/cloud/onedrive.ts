import { CloudError, type CloudErrorCode, type CloudItem, type CloudPort } from './types';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const FOLDER = '/me/drive/root:/Documents/LinkageStudio';
const DOCUMENTS = '/me/drive/root:/Documents';
const MAX_CHARS = 32_000_000;
const MAX_BYTES = 96_000_000;
const MAX_PAGES = 50;
const MAX_ITEMS = 5_000;
const TIMEOUT_MS = 30_000;
const messages: Record<CloudErrorCode, string> = {
  auth: 'Microsoft sign-in is required or access was denied.',
  conflict: 'The cloud project changed. Keep a separate copy or open the remote version.',
  quota: 'Cloud storage is full.',
  offline: 'The cloud request could not reach the service. Its outcome may be unknown.',
  missing: 'The cloud project or folder was not found.',
  invalid: 'The cloud request or response is invalid or exceeds supported limits.',
  transient: 'The cloud service did not complete the request. Its outcome may be unknown.',
  cancelled: 'The cloud operation was cancelled. A sent write may still have completed.',
  unknown: 'The cloud operation failed. Its outcome may be unknown.',
};

function fail(code: CloudErrorCode, status?: number): CloudError {
  return new CloudError(code, messages[code], status);
}

function statusError(status: number): CloudError {
  const code = status === 401 || status === 403 ? 'auth'
    : status === 404 ? 'missing'
    : status === 409 || status === 412 ? 'conflict'
    : status === 507 ? 'quota'
    : status === 408 || status === 429 || status >= 500 ? 'transient'
    : status === 400 || status === 413 || status === 422 ? 'invalid' : 'unknown';
  return fail(code, status);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('invalid');
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex -- Prevent control characters in paths and request headers.
  if (typeof value !== 'string' || !value || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw fail('invalid');
  return value;
}

function id(value: unknown): string {
  const result = boundedString(value, 256);
  if (!/^[A-Za-z0-9._!~-]+$/.test(result) || result === '.' || result === '..') throw fail('invalid');
  return result;
}

function segment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function nameString(value: unknown): string {
  const result = boundedString(value, 255);
  if (/[\\/]/.test(result)) throw fail('invalid');
  return result;
}

function entityTag(value: unknown): string {
  const result = boundedString(value, 1_024);
  if (!/^(?:W\/)?"[\x21\x23-\x7e]+"$/.test(result)) throw fail('invalid');
  return result;
}

function fileName(value: unknown): string {
  let result = nameString(value);
  if (/[<>:"|?*]/.test(result) || result.trim() !== result || result.endsWith('.') || result === '.' || result === '..') throw fail('invalid');
  if (!/\.slinker$/i.test(result)) result += '.slinker';
  if (result.length > 255 || result.toLowerCase() === '.slinker') throw fail('invalid');
  // Reject unpaired surrogates rather than allowing encodeURIComponent to leak a URIError.
  try { segment(result); } catch { throw fail('invalid'); }
  return result;
}

function item(value: unknown, graphResponse = false): CloudItem {
  const data = record(value);
  const parent = graphResponse ? record(data.parentReference) : data;
  const result: CloudItem = {
    driveId: id(parent.driveId), id: id(data.id), name: nameString(data.name),
    eTag: entityTag(data.eTag),
    lastModifiedDateTime: boundedString(data.lastModifiedDateTime, 64),
    size: data.size as number,
  };
  if (!Number.isSafeInteger(result.size) || result.size < 0 || !Number.isFinite(Date.parse(result.lastModifiedDateTime))) throw fail('invalid');
  return result;
}

function graphItem(value: unknown, kind: 'file' | 'folder', expected?: Pick<CloudItem, 'driveId' | 'id'>): CloudItem {
  const data = record(value);
  record(data[kind]);
  if (data.deleted != null || data.remoteItem != null || data[kind === 'file' ? 'folder' : 'file'] != null) throw fail('invalid');
  const result = item(data, true);
  if (expected && (result.id !== expected.id || result.driveId !== expected.driveId)) throw fail('invalid');
  if (kind === 'file' && !/\.slinker$/i.test(result.name)) throw fail('invalid');
  return result;
}

function itemPath(value: Pick<CloudItem, 'driveId' | 'id'>): string {
  return `/drives/${segment(value.driveId)}/items/${segment(value.id)}`;
}

function checkText(text: string): void {
  if (typeof text !== 'string' || text.length > MAX_CHARS) throw fail('invalid');
  // TextEncoder replaces lone surrogates, so reject them to avoid silent source changes.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw fail('invalid');
    } else if (code >= 0xdc00 && code <= 0xdfff) throw fail('invalid');
  }
}

interface RequestContext {
  signal: AbortSignal;
  wait<T>(promise: Promise<T>): Promise<T>;
  check(): void;
}

async function boundedRequest<T>(external: AbortSignal | undefined, run: (context: RequestContext) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  external?.addEventListener('abort', abort, { once: true });
  if (external?.aborted) abort();
  const timer = setTimeout(() => { timedOut = true; abort(); }, TIMEOUT_MS);
  const check = () => { if (controller.signal.aborted) throw fail(timedOut ? 'transient' : 'cancelled'); };
  const wait = async <V>(promise: Promise<V>): Promise<V> => {
    return new Promise<V>((resolve, reject) => {
      const onAbort = () => reject(fail(timedOut ? 'transient' : 'cancelled'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      promise.then(value => { controller.signal.removeEventListener('abort', onAbort); resolve(value); }, error => {
        controller.signal.removeEventListener('abort', onAbort); reject(error);
      });
      if (controller.signal.aborted) onAbort();
    });
  };
  try {
    check();
    const result = await run({ signal: controller.signal, wait, check });
    check();
    return result;
  } catch (error) {
    check();
    if (error instanceof CloudError) throw fail(error.code, error.status);
    throw fail(error instanceof TypeError ? 'offline' : 'unknown');
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', abort);
  }
}

async function readText(response: Response, context: RequestContext, maxBytes: number, maxChars: number): Promise<{ text: string; bytes: number }> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > maxBytes)) {
    void response.body?.cancel().catch(() => undefined);
    throw fail('invalid');
  }
  if (!response.body) throw fail('invalid');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const chunks: string[] = [];
  let bytes = 0;
  let chars = 0;
  let complete = false;
  try {
    while (true) {
      const part = await context.wait(reader.read());
      context.check();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw fail('invalid');
      let text: string;
      try { text = decoder.decode(part.value, { stream: true }); } catch { throw fail('invalid'); }
      chars += text.length;
      if (chars > maxChars) throw fail('invalid');
      chunks.push(text);
    }
    let tail: string;
    try { tail = decoder.decode(); } catch { throw fail('invalid'); }
    chars += tail.length;
    if (chars > maxChars || (length !== null && bytes !== Number(length))) throw fail('invalid');
    chunks.push(tail);
    complete = true;
    return { text: chunks.join(''), bytes };
  } finally {
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function listingUrl(raw: string, path: string): string {
  // eslint-disable-next-line no-control-regex -- Reject URL parser normalization of ASCII controls.
  if (raw.length > 8_192 || /[\\\u0000-\u0020\u007f]/.test(raw)) throw fail('invalid');
  let url: URL;
  try { url = new URL(raw); } catch { throw fail('invalid'); }
  if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password || url.hash || url.pathname !== `/v1.0${path}`) throw fail('invalid');
  const keys = new Set<string>();
  for (const [key] of url.searchParams) {
    const lower = key.toLowerCase();
    if (!['$skiptoken', '$top', '$select', '$orderby'].includes(lower) || keys.has(lower)) throw fail('invalid');
    keys.add(lower);
  }
  return url.href;
}

function downloadUrl(raw: unknown): string {
  const value = boundedString(raw, 8_192);
  let url: URL;
  try { url = new URL(value); } catch { throw fail('invalid'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port || /[\\\s]/.test(value)
    || !host.includes('.') || host.endsWith('.') || host.endsWith('.localhost') || host.endsWith('.local')
    || /^[\d.]+$/.test(host) || host.includes(':')) throw fail('invalid');
  return url.href;
}

export function createOneDriveClient(options: { accountId: string; token: () => Promise<string>; fetch?: typeof globalThis.fetch }): CloudPort {
  const accountId = boundedString(options.accountId, 512);
  const token = options.token;
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function fetchResponse(url: string, init: RequestInit, context: RequestContext): Promise<Response> {
    context.check();
    const pending = fetcher(url, init).then(response => {
      if (context.signal.aborted) {
        void response.body?.cancel().catch(() => undefined);
        context.check();
      }
      return response;
    });
    return context.wait(pending);
  }

  async function graph(pathOrUrl: string, init: RequestInit, signal: AbortSignal | undefined, statuses: number[], json = true): Promise<unknown> {
    // Every caller constructs paths from validated/encoded segments. Only list accepts an absolute URL.
    const url = pathOrUrl.startsWith('/') ? GRAPH + pathOrUrl : pathOrUrl;
    if (new URL(url).origin !== 'https://graph.microsoft.com' || !new URL(url).pathname.startsWith('/v1.0/')) throw fail('invalid');
    return boundedRequest(signal, async context => {
      let bearer: string;
      try { bearer = await context.wait(Promise.resolve().then(token)); } catch {
        context.check(); throw fail('auth');
      }
      context.check();
      if (typeof bearer !== 'string' || !bearer || bearer.length > 32_768 || /[^\x21-\x7e]/.test(bearer)) throw fail('auth');
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${bearer}`);
      const response = await fetchResponse(url, { ...init, headers, signal: context.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' }, context);
      if (!statuses.includes(response.status)) {
        void response.body?.cancel().catch(() => undefined);
        throw statusError(response.status);
      }
      if (!json) { void response.body?.cancel().catch(() => undefined); return undefined; }
      const body = await readText(response, context, 8_000_000, 2_000_000);
      try { return JSON.parse(body.text) as unknown; } catch { throw fail('invalid'); }
    });
  }

  async function folder(path: string, name: string, signal?: AbortSignal): Promise<CloudItem> {
    const result = graphItem(await graph(path, {}, signal, [200]), 'folder');
    if (result.name !== name) throw fail('invalid');
    return result;
  }

  async function createFolder(path: string, name: string, signal?: AbortSignal): Promise<CloudItem> {
    const result = graphItem(await graph(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    }, signal, [201]), 'folder');
    if (result.name !== name) throw fail('invalid');
    return result;
  }

  async function ensureFolder(signal?: AbortSignal): Promise<CloudItem> {
    try { return await folder(FOLDER, 'LinkageStudio', signal); } catch (error) {
      if (!(error instanceof CloudError) || error.code !== 'missing' || error.status !== 404) throw error;
    }
    let documents: CloudItem;
    try { documents = await folder(DOCUMENTS, 'Documents', signal); } catch (error) {
      if (!(error instanceof CloudError) || error.code !== 'missing' || error.status !== 404) throw error;
      documents = await createFolder('/me/drive/root/children', 'Documents', signal);
    }
    const result = await createFolder(`${itemPath(documents)}/children`, 'LinkageStudio', signal);
    if (result.driveId !== documents.driveId) throw fail('invalid');
    return result;
  }

  return Object.freeze({
    accountId,
    async list(signal?: AbortSignal): Promise<CloudItem[]> {
      let parent: CloudItem;
      try { parent = await folder(FOLDER, 'LinkageStudio', signal); } catch (error) {
        if (error instanceof CloudError && error.code === 'missing' && error.status === 404) return [];
        throw error;
      }
      const path = `${itemPath(parent)}/children`;
      let next: string | undefined = `${GRAPH}${path}?$top=100`;
      const seen = new Set<string>();
      const identities = new Set<string>();
      const result: CloudItem[] = [];
      let scanned = 0;
      while (next !== undefined) {
        const url = listingUrl(next, path);
        const canonical = new URL(url);
        canonical.searchParams.sort();
        if (seen.has(canonical.href) || seen.size >= MAX_PAGES) throw fail('invalid');
        seen.add(canonical.href);
        const page = record(await graph(url, {}, signal, [200]));
        if (!Array.isArray(page.value) || scanned + page.value.length > MAX_ITEMS) throw fail('invalid');
        scanned += page.value.length;
        for (const entry of page.value) {
          const data = record(entry);
          const name = nameString(data.name);
          // The project library is not a recursive folder or shortcut browser.
          if (!/\.slinker$/i.test(name) || data.folder != null) continue;
          const value = graphItem(data, 'file');
          if (value.driveId !== parent.driveId || identities.has(value.id)) throw fail('invalid');
          identities.add(value.id);
          result.push(value);
        }
        const link = page['@odata.nextLink'];
        if (link !== undefined && (typeof link !== 'string' || !link)) throw fail('invalid');
        next = link as string | undefined;
      }
      return result;
    },
    async load(source: CloudItem, signal?: AbortSignal) {
      const captured = item(source);
      const path = itemPath(captured);
      const raw = await graph(`${path}?$select=id,name,eTag,parentReference,lastModifiedDateTime,size,file,folder,remoteItem,deleted,@microsoft.graph.downloadUrl`, {}, signal, [200]);
      const before = graphItem(raw, 'file', captured);
      if (before.eTag !== captured.eTag) throw fail('conflict');
      if (before.size > MAX_BYTES) throw fail('invalid');
      const url = downloadUrl(record(raw)['@microsoft.graph.downloadUrl']);
      const content = await boundedRequest(signal, async context => {
        const response = await fetchResponse(url, {
          method: 'GET', signal: context.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', mode: 'cors',
        }, context);
        if (response.status !== 200) {
          void response.body?.cancel().catch(() => undefined);
          throw statusError(response.status);
        }
        return readText(response, context, MAX_BYTES, MAX_CHARS);
      });
      const after = graphItem(await graph(path, {}, signal, [200]), 'file', captured);
      if (before.eTag !== after.eTag || before.size !== after.size) throw fail('conflict');
      if (content.bytes !== before.size) throw fail('invalid');
      return { item: after, text: content.text };
    },
    async create(name: string, text: string, signal?: AbortSignal) {
      const capturedName = fileName(name);
      checkText(text);
      const parent = await ensureFolder(signal);
      const raw = await graph(`${itemPath(parent)}:/${segment(capturedName)}:/content?@microsoft.graph.conflictBehavior=fail`, {
        method: 'PUT', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: text,
      }, signal, [201]);
      const created = graphItem(raw, 'file');
      if (created.driveId !== parent.driveId || created.name !== capturedName) throw fail('invalid');
      return created;
    },
    async save(source: CloudItem, text: string, signal?: AbortSignal) {
      const captured = item(source);
      checkText(text);
      return graphItem(await graph(`${itemPath(captured)}/content`, {
        method: 'PUT', headers: { 'Content-Type': 'text/plain; charset=utf-8', 'If-Match': captured.eTag }, body: text,
      }, signal, [200, 201]), 'file', captured);
    },
    async rename(source: CloudItem, name: string, signal?: AbortSignal) {
      const captured = item(source);
      const capturedName = fileName(name);
      const result = graphItem(await graph(`${itemPath(captured)}?@microsoft.graph.conflictBehavior=fail`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': captured.eTag },
        body: JSON.stringify({ name: capturedName }),
      }, signal, [200]), 'file', captured);
      if (result.name !== capturedName) throw fail('invalid');
      return result;
    },
    async remove(source: CloudItem, signal?: AbortSignal) {
      const captured = item(source);
      await graph(itemPath(captured), { method: 'DELETE', headers: { 'If-Match': captured.eTag } }, signal, [204], false);
    },
  });
}
