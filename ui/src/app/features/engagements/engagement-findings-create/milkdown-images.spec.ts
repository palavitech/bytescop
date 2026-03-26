import { NgZone } from '@angular/core';
import { wireMilkdownImages, MilkdownImagesDisposer } from './milkdown-images';

describe('milkdown-images', () => {

  // --- wireMilkdownImages: basic wiring ---

  it('returns a dispose function', () => {
    const dispose = wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: undefined,
      getCrepe: () => null,
      uploadImage: async () => '',
      markDirty: () => {},
    });
    expect(typeof dispose).toBe('function');
  });

  it('dispose can be called safely even when ready is undefined', () => {
    const dispose = wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: undefined,
      getCrepe: () => null,
      uploadImage: async () => '',
      markDirty: () => {},
    });
    expect(() => dispose()).not.toThrow();
  });

  it('notifies error when ready promise rejects', async () => {
    const errors: string[] = [];
    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.reject(new Error('init failed')),
      getCrepe: () => null,
      uploadImage: async () => '',
      markDirty: () => {},
      notifyError: (msg) => errors.push(msg),
    });
    await flushMicrotasks();
    expect(errors.length).toBe(1);
    expect(errors[0]).toBe('init failed');
  });

  it('does not throw when getEditorView returns null', async () => {
    const errors: string[] = [];
    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => ({ editor: { ctx: null } }),
      uploadImage: async () => '',
      markDirty: () => {},
      notifyError: (msg) => errors.push(msg),
    });
    await flushMicrotasks();
    expect(errors.length).toBe(0);
  });

  it('attaches paste listener on editor view DOM', async () => {
    const dom = document.createElement('div');
    const addSpy = spyOn(dom, 'addEventListener').and.callThrough();

    const mockCrepe = buildMockCrepe(dom);

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => 'https://img.test/1.png',
      markDirty: () => {},
    });
    await flushMicrotasks();

    expect(addSpy).toHaveBeenCalledWith('paste', jasmine.any(Function), true);
  });

  it('dispose removes the paste listener', async () => {
    const dom = document.createElement('div');
    const removeSpy = spyOn(dom, 'removeEventListener').and.callThrough();

    const mockCrepe = buildMockCrepe(dom);

    const dispose = wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => '',
      markDirty: () => {},
    });
    await flushMicrotasks();

    dispose();
    expect(removeSpy).toHaveBeenCalledWith('paste', jasmine.any(Function), true);
  });

  it('dispose can be called multiple times safely', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);

    const dispose = wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => '',
      markDirty: () => {},
    });
    await flushMicrotasks();

    expect(() => { dispose(); dispose(); }).not.toThrow();
  });

  // --- Paste handling ---

  it('handles paste event with image file', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let dirty = false;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => 'https://img.test/1.png',
      markDirty: () => { dirty = true; },
    });
    await flushMicrotasks();

    const file = new File(['px'], 'shot.png', { type: 'image/png' });
    const pasteEvent = createPasteEvent([file]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(dirty).toBe(true);
  });

  it('ignores paste events with no image files', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let uploadCalled = false;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => { uploadCalled = true; return ''; },
      markDirty: () => {},
    });
    await flushMicrotasks();

    const pasteEvent = createPasteEvent([]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(uploadCalled).toBe(false);
  });

  it('notifies error when upload fails during paste', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    const errors: string[] = [];

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => { throw new Error('Upload failed'); },
      markDirty: () => {},
      notifyError: (msg) => errors.push(msg),
    });
    await flushMicrotasks();

    const file = new File(['px'], 'shot.png', { type: 'image/png' });
    const pasteEvent = createPasteEvent([file]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(errors).toContain('Upload failed');
  });

  it('handles paste with non-image files gracefully', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let uploadCalled = false;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => { uploadCalled = true; return ''; },
      markDirty: () => {},
    });
    await flushMicrotasks();

    const textFile = new File(['text'], 'notes.txt', { type: 'text/plain' });
    const pasteEvent = createPasteEvent([textFile]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(uploadCalled).toBe(false);
  });

  // --- getEditorView edge cases ---

  it('handles crepe with no editor property', async () => {
    const errors: string[] = [];
    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => ({}),
      uploadImage: async () => '',
      markDirty: () => {},
      notifyError: (msg) => errors.push(msg),
    });
    await flushMicrotasks();
    expect(errors.length).toBe(0);
  });

  it('handles crepe with editor but no ctx', async () => {
    const errors: string[] = [];
    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => ({ editor: {} }),
      uploadImage: async () => '',
      markDirty: () => {},
      notifyError: (msg) => errors.push(msg),
    });
    await flushMicrotasks();
    expect(errors.length).toBe(0);
  });

  it('handles ctx.get throwing an error', async () => {
    const errors: string[] = [];
    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => ({
        editor: {
          ctx: {
            get: () => { throw new Error('no slice'); },
          },
        },
      }),
      uploadImage: async () => '',
      markDirty: () => {},
      notifyError: (msg) => errors.push(msg),
    });
    await flushMicrotasks();
    expect(errors.length).toBe(0);
  });

  // --- Default notifyError (no-op) ---

  it('does not throw when notifyError is not provided and ready rejects', async () => {
    expect(() => {
      wireMilkdownImages({
        zone: { run: (fn: any) => fn() } as any,
        ready: Promise.reject(new Error('boom')),
        getCrepe: () => null,
        uploadImage: async () => '',
        markDirty: () => {},
      });
    }).not.toThrow();
    await flushMicrotasks();
  });

  // --- insertImageNode: fallback to 'image' node (no image-block) ---

  it('inserts image node when image-block is not available', async () => {
    const dom = document.createElement('div');
    let dispatchedTr: any = null;
    const mockState = {
      schema: {
        nodes: {
          'image': {
            create: (attrs: any) => ({ type: { name: 'image' }, attrs }),
          },
        },
      },
      tr: {
        replaceSelectionWith: (node: any) => ({
          scrollIntoView: () => mockState.tr,
        }),
        insertText: () => ({ scrollIntoView: () => mockState.tr }),
      },
      selection: { from: 0, to: 0 },
    };

    const mockCrepe = {
      editor: {
        ctx: {
          get: () => ({
            dom,
            state: mockState,
            dispatch: (tr: any) => { dispatchedTr = tr; },
            focus: () => {},
          }),
        },
      },
    };

    let dirty = false;
    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => 'https://img.test/2.png',
      markDirty: () => { dirty = true; },
    });
    await flushMicrotasks();

    const file = new File(['px'], 'shot.png', { type: 'image/png' });
    const pasteEvent = createPasteEvent([file]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(dirty).toBe(true);
  });

  // --- insertImageNode: fallback to markdown text ---

  it('inserts markdown text when no image node types available', async () => {
    const dom = document.createElement('div');
    const mockState = {
      schema: {
        nodes: {},
      },
      tr: {
        replaceSelectionWith: () => ({ scrollIntoView: () => mockState.tr }),
        insertText: () => ({ scrollIntoView: () => mockState.tr }),
      },
      selection: { from: 0, to: 0 },
    };

    const mockCrepe = {
      editor: {
        ctx: {
          get: () => ({
            dom,
            state: mockState,
            dispatch: () => {},
            focus: () => {},
          }),
        },
      },
    };

    let dirty = false;
    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => 'https://img.test/3.png',
      markDirty: () => { dirty = true; },
    });
    await flushMicrotasks();

    const file = new File(['px'], 'shot.png', { type: 'image/png' });
    const pasteEvent = createPasteEvent([file]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(dirty).toBe(true);
  });

  // --- getPastedImageFiles: HTML data URL path ---

  it('handles paste with HTML containing data:image URL', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let uploadedFile: File | null = null;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async (file) => { uploadedFile = file; return 'https://img.test/4.png'; },
      markDirty: () => {},
    });
    await flushMicrotasks();

    // Create a paste event with HTML containing a data:image src
    const b64 = btoa('fakepngdata');
    const htmlStr = `<img src="data:image/png;base64,${b64}">`;
    const pasteEvent = createPasteEventWithHtml(htmlStr);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(uploadedFile).not.toBeNull();
    expect(uploadedFile!.type).toBe('image/png');
  });

  it('ignores paste with HTML that has no data:image', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let uploadCalled = false;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => { uploadCalled = true; return ''; },
      markDirty: () => {},
    });
    await flushMicrotasks();

    const pasteEvent = createPasteEventWithHtml('<img src="https://normal.com/img.png">');
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(uploadCalled).toBe(false);
  });

  it('ignores paste with HTML containing invalid base64 data URL', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let uploadCalled = false;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => { uploadCalled = true; return ''; },
      markDirty: () => {},
    });
    await flushMicrotasks();

    // data URL with invalid characters that will cause atob to fail
    const pasteEvent = createPasteEventWithHtml('<img src="data:image/png;base64,!!!invalid!!!">');
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(uploadCalled).toBe(false);
  });

  it('notifies with fallback message when upload throws non-Error', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    const errors: string[] = [];

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => { throw 'string error'; },
      markDirty: () => {},
      notifyError: (msg) => errors.push(msg),
    });
    await flushMicrotasks();

    const file = new File(['px'], 'shot.png', { type: 'image/png' });
    const pasteEvent = createPasteEvent([file]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(errors).toContain('Image paste upload failed.');
  });

  it('notifies with fallback message when ready rejects with non-Error', async () => {
    const errors: string[] = [];
    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.reject('not an error object'),
      getCrepe: () => null,
      uploadImage: async () => '',
      markDirty: () => {},
      notifyError: (msg) => errors.push(msg),
    });
    await flushMicrotasks();
    expect(errors.length).toBe(1);
    expect(errors[0]).toBe('Failed to wire clipboard image paste.');
  });

  it('handles paste with DataTransfer items (not files) containing image', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let dirty = false;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => 'https://img.test/items.png',
      markDirty: () => { dirty = true; },
    });
    await flushMicrotasks();

    // Use DataTransfer items path — add a file via items.add which populates both
    const file = new File(['px'], 'shot.png', { type: 'image/png' });
    const pasteEvent = createPasteEvent([file]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(dirty).toBe(true);
  });

  it('handles paste with multiple image files', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let uploadCount = 0;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => { uploadCount++; return 'https://img.test/multi.png'; },
      markDirty: () => {},
    });
    await flushMicrotasks();

    const file1 = new File(['px'], 'shot1.png', { type: 'image/png' });
    const file2 = new File(['px'], 'shot2.png', { type: 'image/jpeg' });
    const pasteEvent = createPasteEvent([file1, file2]);
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(uploadCount).toBe(2);
  });

  it('handles paste with no clipboardData', async () => {
    const dom = document.createElement('div');
    const mockCrepe = buildMockCrepe(dom);
    let uploadCalled = false;

    wireMilkdownImages({
      zone: { run: (fn: any) => fn() } as any,
      ready: Promise.resolve(),
      getCrepe: () => mockCrepe,
      uploadImage: async () => { uploadCalled = true; return ''; },
      markDirty: () => {},
    });
    await flushMicrotasks();

    const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    dom.dispatchEvent(pasteEvent);
    await flushMicrotasks();

    expect(uploadCalled).toBe(false);
  });
});

// --- Helpers ---

function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function buildMockCrepe(dom: HTMLElement): any {
  const mockState = {
    schema: {
      nodes: {
        'image-block': {
          create: (attrs: any) => ({ type: { name: 'image-block' }, attrs }),
        },
      },
    },
    tr: {
      replaceSelectionWith: () => ({ scrollIntoView: () => mockState.tr }),
      insertText: () => ({ scrollIntoView: () => mockState.tr }),
    },
    selection: { from: 0, to: 0 },
  };

  return {
    editor: {
      ctx: {
        get: () => ({
          dom,
          state: mockState,
          dispatch: () => {},
          focus: () => {},
        }),
      },
    },
  };
}

function createPasteEvent(files: File[]): ClipboardEvent {
  const dt = new DataTransfer();
  for (const f of files) {
    dt.items.add(f);
  }
  return new ClipboardEvent('paste', {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
  });
}

function createPasteEventWithHtml(html: string): ClipboardEvent {
  const dt = new DataTransfer();
  dt.setData('text/html', html);
  return new ClipboardEvent('paste', {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
  });
}
