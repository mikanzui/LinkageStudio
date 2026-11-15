import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalFileAdapter, openLocalFile, saveLocalFile, openImageFile,
  type BrowserFileHost, type LocalFileInput, type LocalFileInputEvent,
  type LocalReadableFile, type LocalWritableFile,
} from '../src/utils/file-adapter.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class MockInput implements LocalFileInput {
  files: LocalReadableFile[] | null = null;
  attached = false;
  removals = 0;
  onClick = () => {};
  listeners = new Map<LocalFileInputEvent, Set<() => void>>();
  addEventListener(type: LocalFileInputEvent, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: LocalFileInputEvent, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  attach() { this.attached = true; }
  click() { assert.equal(this.attached, true); this.onClick(); }
  remove() { this.attached = false; this.removals++; }
  emit(type: LocalFileInputEvent) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  assertClean() {
    assert.equal(this.attached, false);
    assert.equal(this.removals, 1);
    for (const listeners of this.listeners.values()) assert.equal(listeners.size, 0);
  }
}

function setup(overrides: Partial<BrowserFileHost> = {}) {
  const input = new MockInput();
  const downloads: { content: string; name: string }[] = [];
  const prompts: string[] = [];
  const host: BrowserFileHost = {
    prompt: (_message, name) => { prompts.push(name); return name; },
    download: (content, name) => { downloads.push({ content, name }); },
    createFileInput: () => input,
    ...overrides,
  };
  return { input, downloads, prompts, host, adapter: createLocalFileAdapter(host) };
}

test('native save confirms only after write and close complete', async () => {
  const write = deferred<void>();
  const close = deferred<void>();
  const calls: string[] = [];
  const { adapter, downloads, prompts } = setup({
    showSaveFilePicker: async (options) => {
      assert.equal(options.suggestedName, 'Design.SLINKER');
      assert.deepEqual(options.types[0].accept, { 'application/json': ['.slinker'] });
      return {
        name: 'chosen.slinker',
        createWritable: async () => ({
          write: async (content) => { calls.push(content); await write.promise; },
          close: async () => { calls.push('close'); await close.promise; },
        }),
      };
    },
  });
  let finished = false;
  const result = adapter.saveLocalFile('{"version":1}', 'Design.SLINKER').then((outcome) => {
    finished = true;
    return outcome;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['{"version":1}']);
  assert.equal(finished, false);
  write.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['{"version":1}', 'close']);
  assert.equal(finished, false);
  close.resolve();
  assert.deepEqual(await result, { status: 'saved', name: 'chosen.slinker', confirmation: 'confirmed-write' });
  assert.deepEqual(downloads, []);
  assert.deepEqual(prompts, []);
});

test('native picker AbortError cancels with no prompt or fallback', async () => {
  const { adapter, downloads, prompts } = setup({
    showSaveFilePicker: async () => { throw { name: 'AbortError' }; },
  });
  assert.deepEqual(await adapter.saveLocalFile('data', 'test'), { status: 'cancelled' });
  assert.deepEqual(downloads, []);
  assert.deepEqual(prompts, []);
});

for (const phase of ['picker', 'createWritable', 'write', 'close'] as const) {
  test(`native ${phase} failures are explicit, never silently downloaded`, async () => {
    const error = new Error(`${phase} denied`);
    let aborted = false;
    const { adapter, downloads, prompts } = setup({
      showSaveFilePicker: async () => {
        if (phase === 'picker') throw error;
        return {
          createWritable: async () => {
            if (phase === 'createWritable') throw error;
            return {
              write: async () => { if (phase === 'write') throw error; },
              close: async () => { if (phase === 'close') throw error; },
              abort: async () => { aborted = true; throw new Error('cleanup also failed'); },
            };
          },
        };
      },
    });
    assert.deepEqual(await adapter.saveLocalFile('data', 'test'), { status: 'failed', error });
    assert.equal(aborted, phase === 'write' || phase === 'close');
    assert.deepEqual(downloads, []);
    assert.deepEqual(prompts, []);
  });
}

test('an aborted write is a failure, not picker cancellation', async () => {
  const error = Object.assign(new Error('write interrupted'), { name: 'AbortError' });
  const writable: LocalWritableFile = {
    write: async () => { throw error; },
    close: async () => { assert.fail('close must not run after a failed write'); },
  };
  const { adapter } = setup({ showSaveFilePicker: async () => ({ createWritable: async () => writable }) });
  assert.deepEqual(await adapter.saveLocalFile('data', 'test'), { status: 'failed', error });
});

for (const [chosen, expected] of [
  ['Arm', 'Arm.slinker'],
  ['Arm.SLINKER', 'Arm.SLINKER'],
  ['  Arm.sLiNkEr  ', 'Arm.sLiNkEr'],
  ['../folder/Arm:name', '.._folder_Arm_name.slinker'],
  ['Arm\u0000name', 'Arm_name.slinker'],
  ['...', 'mechanism.slinker'],
] as const) {
  test(`fallback uses a safe filename: ${JSON.stringify(chosen)}`, async () => {
    const { adapter, downloads } = setup({ prompt: () => chosen });
    assert.deepEqual(await adapter.saveLocalFile('unmodified content', 'initial'), {
      status: 'saved', name: expected, confirmation: 'download-initiated',
    });
    assert.deepEqual(downloads, [{ content: 'unmodified content', name: expected }]);
  });
}

test('fallback prompts with normalized suggested name', async () => {
  const { adapter, prompts } = setup();
  await adapter.saveLocalFile('', 'demo');
  await adapter.saveLocalFile('', '');
  assert.deepEqual(prompts, ['demo.slinker', 'mechanism.slinker']);
});

for (const name of [null, '', '   ']) {
  test(`fallback cancellation (${JSON.stringify(name)}) initiates no download`, async () => {
    const { adapter, downloads } = setup({ prompt: () => name });
    assert.deepEqual(await adapter.saveLocalFile('data', 'test'), { status: 'cancelled' });
    assert.deepEqual(downloads, []);
  });
}

for (const phase of ['prompt', 'download'] as const) {
  test(`fallback ${phase} errors are explicit`, async () => {
    const error = new Error(`${phase} blocked`);
    const { adapter } = setup({ [phase]: () => { throw error; } });
    assert.deepEqual(await adapter.saveLocalFile('data', 'test'), { status: 'failed', error });
  });
}

test('open keeps the input attached throughout a slow read and ignores late cancel/change', async () => {
  const { adapter, input } = setup();
  const read = deferred<string>();
  let reads = 0;
  let settled = false;
  const result = adapter.openLocalFile().then((outcome) => { settled = true; return outcome; });
  input.files = [{ name: 'actual.SLINKER', readText: () => { reads++; return read.promise; } }];
  input.emit('change');
  input.emit('cancel');
  input.emit('change');
  input.emit('error');
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(input.attached, true);
  assert.equal(settled, false);
  assert.equal(reads, 1);
  read.resolve('\ufeff{"unchanged":"content"}\n');
  assert.deepEqual(await result, { status: 'opened', name: 'actual.SLINKER', content: '\ufeff{"unchanged":"content"}\n' });
  input.assertClean();
});

test('an idle picker is not cancelled by time or missing focus events', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { adapter, input } = setup();
  let settled = false;
  const result = adapter.openLocalFile().then((outcome) => { settled = true; return outcome; });
  context.mock.timers.tick(24 * 60 * 60 * 1000);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(input.attached, true);
  input.emit('cancel');
  assert.deepEqual(await result, { status: 'cancelled' });
  input.assertClean();
});

for (const event of ['cancel', 'change'] as const) {
  test(`open ${event} without a file cancels and cleans up`, async () => {
    const { adapter, input } = setup();
    const result = adapter.openLocalFile();
    input.emit(event);
    assert.deepEqual(await result, { status: 'cancelled' });
    input.emit('error');
    input.assertClean();
  });
}

test('picker error is failed, not cancelled, and cleans up', async () => {
  const { adapter, input } = setup();
  const result = adapter.openLocalFile();
  input.emit('error');
  const outcome = await result;
  assert.equal(outcome.status, 'failed');
  if (outcome.status === 'failed') assert.match(outcome.error.message, /picker failed/);
  input.assertClean();
});

for (const synchronous of [false, true]) {
  test(`read failure (${synchronous ? 'synchronous' : 'asynchronous'}) stays explicit and cleans up`, async () => {
    const error = new Error('File unavailable');
    const { adapter, input } = setup();
    const result = adapter.openLocalFile();
    input.files = [{ name: 'missing.slinker', readText: () => {
      if (synchronous) throw error;
      return Promise.reject(error);
    } }];
    input.emit('change');
    assert.deepEqual(await result, { status: 'failed', error });
    input.assertClean();
  });
}

for (const phase of ['createFileInput', 'attach', 'click'] as const) {
  test(`open ${phase} exception settles as failed and cleans up existing input`, async () => {
    const error = new Error(`${phase} unavailable`);
    const { adapter, host, input } = setup();
    if (phase === 'createFileInput') host.createFileInput = () => { throw error; };
    else input[phase] = () => { throw error; };
    assert.deepEqual(await adapter.openLocalFile(), { status: 'failed', error });
    if (phase !== 'createFileInput') input.assertClean();
  });
}

test('cancelled open can be retried with an independent fresh input', async () => {
  const inputs: MockInput[] = [];
  const { adapter } = setup({ createFileInput: () => {
    const input = new MockInput();
    inputs.push(input);
    return input;
  } });
  const cancelled = adapter.openLocalFile();
  inputs[0].emit('cancel');
  assert.deepEqual(await cancelled, { status: 'cancelled' });
  const opened = adapter.openLocalFile();
  inputs[1].files = [{ name: 'retry.json', readText: async () => '' }];
  inputs[1].emit('change');
  assert.deepEqual(await opened, { status: 'opened', name: 'retry.json', content: '' });
  inputs.forEach((input) => input.assertClean());
});

test('module import requires no DOM, and unavailable default browser returns failed', async () => {
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal((await saveLocalFile('data', 'test')).status, 'failed');
  assert.equal((await openLocalFile()).status, 'failed');
});

function replaceGlobals(values: Record<string, unknown>) {
  const originals = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
}

for (const clickFails of [false, true]) {
  test(`default browser download ${clickFails ? 'cleans up a failed click' : 'defers URL revocation after an attached click'}`, async (context) => {
    let attached = false;
    let blob: Blob | undefined;
    let release: (() => void) | undefined;
    const revoked: string[] = [];
    const error = new Error('download blocked');
    const anchor = {
      href: '', download: '', style: { display: '' },
      click() { assert.equal(attached, true); if (clickFails) throw error; },
      remove() { attached = false; },
    };
    context.mock.method(URL, 'createObjectURL', (value: Blob) => { blob = value; return 'blob:test'; });
    context.mock.method(URL, 'revokeObjectURL', (url: string) => { revoked.push(url); });
    const restore = replaceGlobals({
      window: {
        prompt: () => 'runtime.SLINKER',
        setTimeout: (callback: () => void, delay: number) => {
          assert.equal(delay, 60_000);
          release = callback;
        },
      },
      document: {
        createElement: (tag: string) => { assert.equal(tag, 'a'); return anchor; },
        body: { appendChild: (node: unknown) => { assert.equal(node, anchor); attached = true; } },
      },
    });
    try {
      const outcome = await saveLocalFile('<raw content>', 'suggested');
      assert.equal(anchor.href, 'blob:test');
      assert.equal(anchor.download, 'runtime.SLINKER');
      assert.equal(attached, false);
      assert.equal(blob?.type, 'application/json');
      assert.equal(await blob?.text(), '<raw content>');
      if (clickFails) {
        assert.deepEqual(outcome, { status: 'failed', error });
        assert.deepEqual(revoked, ['blob:test']);
        assert.equal(release, undefined);
      } else {
        assert.deepEqual(outcome, { status: 'saved', name: 'runtime.SLINKER', confirmation: 'download-initiated' });
        assert.deepEqual(revoked, []);
        assert.ok(release);
        release();
        assert.deepEqual(revoked, ['blob:test']);
      }
    } finally { restore(); }
  });
}

for (const event of ['load', 'error', 'abort', 'throw'] as const) {
  test(`default browser FileReader ${event} keeps input attached until terminal read outcome`, async () => {
    const input = new MockInput();
    const file = { name: 'from-files.slinker' };
    const readerError = new Error('read denied');
    class MockReader {
      static current: MockReader;
      result: string | null = null;
      error = readerError;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      constructor() { MockReader.current = this; }
      readAsText(value: unknown) {
        assert.equal(value, file);
        assert.equal(input.attached, true);
        if (event === 'throw') throw readerError;
      }
    }
    const element = {
      type: '', accept: '', multiple: true, style: { position: '', top: '', left: '' },
      files: [file],
      addEventListener: input.addEventListener.bind(input),
      removeEventListener: input.removeEventListener.bind(input),
      click: input.click.bind(input),
      remove: input.remove.bind(input),
    };
    const restore = replaceGlobals({
      window: {}, FileReader: MockReader,
      document: {
        createElement: (tag: string) => { assert.equal(tag, 'input'); return element; },
        body: { appendChild: (node: unknown) => { assert.equal(node, element); input.attach(); } },
      },
    });
    try {
      const result = openLocalFile();
      assert.equal(element.type, 'file');
      assert.equal(element.accept, '.slinker,.json,application/json');
      assert.equal(element.multiple, false);
      input.emit('change');
      const reader = MockReader.current;
      if (event !== 'throw') {
        assert.equal(input.attached, true);
        if (event === 'load') { reader.result = 'raw bytes'; reader.onload?.(); }
        if (event === 'error') reader.onerror?.();
        if (event === 'abort') reader.onabort?.();
      }
      const outcome = await result;
      if (event === 'load') assert.deepEqual(outcome, { status: 'opened', name: file.name, content: 'raw bytes' });
      else {
        assert.equal(outcome.status, 'failed');
        if (event !== 'abort') assert.deepEqual(outcome, { status: 'failed', error: readerError });
      }
      assert.equal(reader.onload, null);
      assert.equal(reader.onerror, null);
      assert.equal(reader.onabort, null);
      input.assertClean();
    } finally { restore(); }
  });
}

for (const scenario of [
  { name: 'photo.PNG', type: '', expected: 'image/png' },
  { name: 'photo.jpeg', type: 'application/octet-stream', expected: 'image/jpeg' },
  { name: 'photo.webp', type: 'image/webp', expected: 'image/webp' },
  { name: 'photo.png', type: 'image/svg+xml', expected: null },
  { name: 'unknown', type: '', expected: null },
]) test('image Files metadata: '+scenario.type+'/'+scenario.name,async()=>{
  const input=new MockInput(),file=new File([new Uint8Array([1,2])],scenario.name,{type:scenario.type});
  class MockReader {
    static current:MockReader;
    result:string|null=null;error=null;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;onabort:(()=>void)|null=null;
    constructor(){MockReader.current=this;}
    readAsDataURL(blob:Blob){assert(input.attached);assert.equal(blob.type,scenario.expected);}
  }
  const element={type:'',accept:'',multiple:true,style:{},files:[file],addEventListener:input.addEventListener.bind(input),removeEventListener:input.removeEventListener.bind(input),click:input.click.bind(input),remove:input.remove.bind(input)};
  const restore=replaceGlobals({window:{},FileReader:MockReader,document:{createElement:()=>element,body:{appendChild:()=>input.attach()}}});
  try{
    const promise=openImageFile();assert(element.accept.includes('image/png'));input.emit('change');
    if(scenario.expected){input.emit('cancel');assert(input.attached);MockReader.current.result='data:'+scenario.expected+';base64,AQID';MockReader.current.onload?.();}
    const result=await promise;assert.equal(result.status,scenario.expected?'opened':'failed');input.assertClean();
  }finally{restore();}
});
