import { NgZone } from '@angular/core';
import { editorViewCtx } from '@milkdown/core';

export type MilkdownImagesDisposer = () => void;

type NotifyFn = (msg: string) => void;

export function wireMilkdownImages(args: {
  zone: NgZone;
  ready: Promise<unknown> | undefined;
  getCrepe: () => unknown;
  uploadImage: (file: File) => Promise<string>;
  markDirty: () => void;
  notifyError?: NotifyFn;
}): MilkdownImagesDisposer {
  const notifyError = args.notifyError ?? (() => { });

  let removePasteListener: (() => void) | undefined;

  const dispose = () => {
    removePasteListener?.();
    removePasteListener = undefined;
  };

  void (async () => {
    try {
      await args.ready;

      const crepe = args.getCrepe();
      const view = getEditorView(crepe);
      if (!view) return;

      const onPaste = (ev: ClipboardEvent) => {
        void handlePaste(ev);
      };

      view.dom.addEventListener('paste', onPaste, true);

      removePasteListener = () => {
        try {
          view.dom.removeEventListener('paste', onPaste, true);
        } catch {
          // ignore
        }
      };

      async function handlePaste(ev: ClipboardEvent): Promise<void> {
        const files = getPastedImageFiles(ev);
        if (!files.length) return;

        ev.preventDefault();
        ev.stopPropagation();

        try {
          for (const file of files) {
            const url = await args.zone.run(() => args.uploadImage(file));
            insertImageNode(view, url);
            args.markDirty();
          }
        } catch (e) {
          notifyError((e as Error)?.message || 'Image paste upload failed.');
        }
      }
    } catch (e) {
      notifyError((e as Error)?.message || 'Failed to wire clipboard image paste.');
    }
  })();

  return dispose;
}

function getEditorView(crepe: any): any | null {
  try {
    const editor = crepe?.editor;
    const ctx = editor?.ctx;
    if (!ctx) return null;
    const view = ctx.get(editorViewCtx);
    return view || null;
  } catch {
    return null;
  }
}

function getPastedImageFiles(ev: ClipboardEvent): File[] {
  const dt = ev.clipboardData;
  if (!dt) return [];

  const out: File[] = [];

  if (dt.files && dt.files.length) {
    for (const f of Array.from(dt.files)) {
      if (f.type?.startsWith('image/')) out.push(f);
    }
    if (out.length) return out;
  }

  if (dt.items && dt.items.length) {
    for (const it of Array.from(dt.items)) {
      if (it.kind === 'file' && it.type?.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
    if (out.length) return out;
  }

  const html = dt.getData('text/html');
  if (html) {
    const dataUrl = extractDataImageFromHtml(html);
    if (dataUrl) {
      const f = dataUrlToFile(dataUrl, `pasted-${Date.now()}.png`);
      if (f) out.push(f);
    }
  }

  return out;
}

function extractDataImageFromHtml(html: string): string | null {
  const m = /<img[^>]+src=["'](data:image\/[^"']+)["']/i.exec(html);
  return m ? m[1] : null;
}

function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;

  const mime = m[1];
  const b64 = m[2].replace(/\s+/g, '');

  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}

function insertImageNode(view: any, url: string): void {
  const { state, dispatch } = view;
  const schema = state.schema;

  const imageBlockType = schema.nodes['image-block'];
  if (imageBlockType) {
    const node = imageBlockType.create({ src: url, caption: '', ratio: 1 });
    const tr = state.tr.replaceSelectionWith(node).scrollIntoView();
    dispatch(tr);
    view.focus();
    return;
  }

  const imageType = schema.nodes['image'];
  if (imageType) {
    const node = imageType.create({ src: url, alt: '' });
    const tr = state.tr.replaceSelectionWith(node).scrollIntoView();
    dispatch(tr);
    view.focus();
    return;
  }

  const tr = state.tr.insertText(`\n![](${url})\n`, state.selection.from, state.selection.to);
  dispatch(tr.scrollIntoView());
  view.focus();
}
