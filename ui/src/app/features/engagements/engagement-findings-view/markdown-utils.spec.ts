import { wrapImageCaptions } from './markdown-utils';

describe('wrapImageCaptions', () => {
  it('wraps img with title in figure + figcaption', () => {
    const html = '<img src="test.png" title="My Caption">';
    const result = wrapImageCaptions(html);

    const div = document.createElement('div');
    div.innerHTML = result;

    const figure = div.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.className).toBe('bc-mdFigure');

    const img = figure!.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('test.png');

    const figcaption = figure!.querySelector('figcaption');
    expect(figcaption).not.toBeNull();
    expect(figcaption!.className).toBe('bc-mdFigcaption');
    expect(figcaption!.textContent).toBe('My Caption');
  });

  it('replaces parent <p> when img is the sole child', () => {
    const html = '<p><img src="a.png" title="Caption"></p>';
    const result = wrapImageCaptions(html);

    const div = document.createElement('div');
    div.innerHTML = result;

    // The <p> should be replaced by <figure>
    expect(div.querySelector('p')).toBeNull();
    expect(div.querySelector('figure')).not.toBeNull();
  });

  it('does not replace parent <p> when img has siblings', () => {
    const html = '<p>Text <img src="a.png" title="Caption"> more</p>';
    const result = wrapImageCaptions(html);

    const div = document.createElement('div');
    div.innerHTML = result;

    // The <p> should remain since img is not the sole child
    // The figure replaces the img inline
    expect(div.querySelector('figure')).not.toBeNull();
  });

  it('skips img elements without a title attribute', () => {
    const html = '<img src="no-title.png">';
    const result = wrapImageCaptions(html);

    const div = document.createElement('div');
    div.innerHTML = result;

    expect(div.querySelector('figure')).toBeNull();
    expect(div.querySelector('img')).not.toBeNull();
  });

  it('skips img elements with empty title', () => {
    const html = '<img src="empty.png" title="   ">';
    const result = wrapImageCaptions(html);

    const div = document.createElement('div');
    div.innerHTML = result;

    expect(div.querySelector('figure')).toBeNull();
  });

  it('handles multiple images with titles', () => {
    const html = '<img src="a.png" title="A"><img src="b.png" title="B">';
    const result = wrapImageCaptions(html);

    const div = document.createElement('div');
    div.innerHTML = result;

    const figures = div.querySelectorAll('figure');
    expect(figures.length).toBe(2);
    expect(figures[0].querySelector('figcaption')!.textContent).toBe('A');
    expect(figures[1].querySelector('figcaption')!.textContent).toBe('B');
  });

  it('returns empty string for empty input', () => {
    expect(wrapImageCaptions('')).toBe('');
  });

  it('returns html unchanged when no images have titles', () => {
    const html = '<p>Hello</p><img src="x.png">';
    const result = wrapImageCaptions(html);

    const div = document.createElement('div');
    div.innerHTML = result;

    expect(div.querySelector('figure')).toBeNull();
    expect(div.querySelector('p')!.textContent).toBe('Hello');
  });

  it('trims whitespace from title for caption text', () => {
    const html = '<img src="a.png" title="  Trimmed Caption  ">';
    const result = wrapImageCaptions(html);

    const div = document.createElement('div');
    div.innerHTML = result;

    const figcaption = div.querySelector('figcaption');
    expect(figcaption!.textContent).toBe('Trimmed Caption');
  });
});
