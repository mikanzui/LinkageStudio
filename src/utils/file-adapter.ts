export type LocalSaveOutcome =
  | { status: 'saved'; name: string; confirmation: 'confirmed-write' | 'download-initiated' }
  | { status: 'cancelled' }
  | LocalFileFailure;

export type LocalOpenOutcome =
  | { status: 'opened'; content: string; name: string }
  | { status: 'cancelled' }
  | LocalFileFailure;

export interface LocalFileFailure {
  status: 'failed';
  error: Error;
}

export interface LocalSavePickerOptions {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}

export interface LocalWritableFile {
  write(content: string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface LocalSaveFileHandle {
  readonly name?: string;
  createWritable(): Promise<LocalWritableFile>;
}

export interface LocalReadableFile {
  readonly name: string;
  readText(): Promise<string>;
}

export type LocalFileInputEvent = 'change' | 'cancel' | 'error';

/** The input owns its browser node; attach must run before click. */
export interface LocalFileInput {
  readonly files: ArrayLike<LocalReadableFile> | null;
  addEventListener(type: LocalFileInputEvent, listener: () => void): void;
  removeEventListener(type: LocalFileInputEvent, listener: () => void): void;
  attach(): void;
  click(): void;
  remove(): void;
}

/** No DOM types are required to supply a test host. */
export interface BrowserFileHost {
  showSaveFilePicker?(options: LocalSavePickerOptions): Promise<LocalSaveFileHandle>;
  prompt(message: string, suggestedName: string): string | null;
  download(content: string, name: string): void;
  createFileInput(): LocalFileInput;
}

export interface LocalFileAdapter {
  saveLocalFile(content: string, suggestedName: string): Promise<LocalSaveOutcome>;
  openLocalFile(): Promise<LocalOpenOutcome>;
}

function failed(error: unknown): LocalFileFailure {
  return { status: 'failed', error: error instanceof Error ? error : new Error(String(error)) };
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function localFileName(name: string): string {
  const withoutControls = Array.from(name.trim(), (char) => char.charCodeAt(0) < 32 ? '_' : char).join('');
  const safe = withoutControls.replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '') || 'mechanism';
  return /\.slinker$/i.test(safe) ? safe : `${safe}.slinker`;
}

export function createLocalFileAdapter(host: BrowserFileHost): LocalFileAdapter {
  return {
    async saveLocalFile(content, suggestedName) {
      const name = localFileName(suggestedName);
      if (host.showSaveFilePicker) {
        let handle: LocalSaveFileHandle;
        try {
          handle = await host.showSaveFilePicker({
            suggestedName: name,
            types: [{ description: 'Slinker files', accept: { 'application/json': ['.slinker'] } }],
          });
        } catch (error) {
          return isAbortError(error) ? { status: 'cancelled' } : failed(error);
        }

        let writable: LocalWritableFile | undefined;
        try {
          writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          return { status: 'saved', name: handle.name ?? name, confirmation: 'confirmed-write' };
        } catch (error) {
          try { await writable?.abort?.(); } catch { /* Preserve the original write failure. */ }
          return failed(error);
        }
      }

      try {
        const chosenName = host.prompt('Save as:', name);
        if (chosenName === null || chosenName.trim() === '') return { status: 'cancelled' };
        const downloadName = localFileName(chosenName);
        host.download(content, downloadName);
        // A browser download has no durable-write acknowledgement.
        return { status: 'saved', name: downloadName, confirmation: 'download-initiated' };
      } catch (error) {
        return failed(error);
      }
    },

    openLocalFile() {
      return new Promise<LocalOpenOutcome>((resolve) => {
        let input: LocalFileInput | undefined;
        let settled = false;
        let reading = false;
        const finish = (outcome: LocalOpenOutcome) => {
          if (settled) return;
          settled = true;
          try {
            try {
              for (const type of ['change', 'cancel', 'error'] as const) {
                input?.removeEventListener(type, listeners[type]);
              }
            } finally {
              input?.remove();
            }
          } catch (error) {
            resolve(outcome.status === 'failed' ? outcome : failed(error));
            return;
          }
          resolve(outcome);
        };
        const listeners: Record<LocalFileInputEvent, () => void> = {
          change: () => {
            if (settled || reading) return;
            try {
              const file = input?.files?.[0];
              if (!file) { finish({ status: 'cancelled' }); return; }
              reading = true;
              const name = file.name;
              void file.readText().then(
                (content) => finish({ status: 'opened', content, name }),
                (error: unknown) => finish(failed(error)),
              );
            } catch (error) {
              finish(failed(error));
            }
          },
          // Focus/visibility timers can race the iOS picker and FileReader. Only
          // actual picker events cancel, and never once a file read has begun.
          cancel: () => { if (!reading) finish({ status: 'cancelled' }); },
          error: () => { if (!reading) finish(failed(new Error('The local file picker failed.'))); },
        };
        try {
          input = host.createFileInput();
          for (const type of ['change', 'cancel', 'error'] as const) {
            input.addEventListener(type, listeners[type]);
          }
          input.attach();
          input.click();
        } catch (error) {
          finish(failed(error));
        }
      });
    },
  };
}

function readBrowserFile(file: File, image = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => { reader.onload = reader.onerror = reader.onabort = null; };
    reader.onload = () => {
      const result = reader.result;
      cleanup();
      if (typeof result === 'string') resolve(result);
      else reject(new Error('The local file could not be read as text.'));
    };
    reader.onerror = () => {
      const error = reader.error ?? new Error('Reading the local file failed.');
      cleanup();
      reject(error);
    };
    reader.onabort = () => { cleanup(); reject(new Error('Reading the local file was interrupted.')); };
    try {
      if (image) {
        const extension = /\.(png|jpe?g|bmp|webp)$/i.exec(file.name)?.[1].toLowerCase();
        const fallback = extension ? 'image/' + (extension === 'jpg' ? 'jpeg' : extension) : '';
        const type = (!file.type || file.type === 'application/octet-stream') ? fallback : file.type;
        if (!/^image\/(png|jpeg|bmp|webp)$/.test(type) || file.size > 20 * 1024 * 1024) throw new Error('Choose a PNG, JPEG, BMP or WebP image up to 20 MB.');
        reader.readAsDataURL(file.type === type ? file : new Blob([file],{type}));
      } else reader.readAsText(file);
    } catch (error) { cleanup(); reject(error); }
  });
}

function browserHost(image = false): BrowserFileHost {
  const browser = window as Window & {
    showSaveFilePicker?: BrowserFileHost['showSaveFilePicker'];
  };
  const picker = browser.showSaveFilePicker;
  return {
    showSaveFilePicker: typeof picker === 'function' ? (options) => picker.call(browser, options) : undefined,
    prompt: (message, name) => browser.prompt(message, name),
    download(content, name) {
      const anchor = document.createElement('a');
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      let initiated = false;
      try {
        anchor.href = url;
        anchor.download = name;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        initiated = true;
      } finally {
        anchor.remove();
        // Safari may consume the URL after click returns; do not revoke it yet.
        if (initiated) browser.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        else URL.revokeObjectURL(url);
      }
    },
    createFileInput() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = image ? 'image/png,image/jpeg,image/bmp,image/webp' : '.slinker,.json,application/json';
      input.multiple = false;
      input.style.position = 'fixed';
      input.style.top = '-9999px';
      input.style.left = '-9999px';
      return {
        get files() {
          const file = input.files?.[0];
          return file ? [{ name: file.name, readText: () => readBrowserFile(file, image) }] : null;
        },
        addEventListener: (type, listener) => input.addEventListener(type, listener),
        removeEventListener: (type, listener) => input.removeEventListener(type, listener),
        attach: () => { document.body.appendChild(input); },
        click: () => input.click(),
        remove: () => input.remove(),
      };
    },
  };
}

export async function saveLocalFile(content: string, suggestedName: string): Promise<LocalSaveOutcome> {
  try { return await createLocalFileAdapter(browserHost()).saveLocalFile(content, suggestedName); }
  catch (error) { return failed(error); }
}

export async function openLocalFile(): Promise<LocalOpenOutcome> {
  try { return await createLocalFileAdapter(browserHost()).openLocalFile(); }
  catch (error) { return failed(error); }
}

export async function openImageFile(): Promise<LocalOpenOutcome> {
  try { return await createLocalFileAdapter(browserHost(true)).openLocalFile(); }
  catch (error) { return failed(error); }
}
