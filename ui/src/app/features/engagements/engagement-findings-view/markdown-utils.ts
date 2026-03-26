/** Wrap <img title="caption"> nodes in <figure> + <figcaption> for display. */
export function wrapImageCaptions(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  div.querySelectorAll('img[title]').forEach(img => {
    const caption = img.getAttribute('title')?.trim();
    if (!caption) return;

    const figure = document.createElement('figure');
    figure.className = 'bc-mdFigure';
    const figcaption = document.createElement('figcaption');
    figcaption.className = 'bc-mdFigcaption';
    figcaption.textContent = caption;

    // If the img is the sole child of a <p>, replace the <p> with the figure.
    const parent = img.parentElement;
    if (parent?.tagName === 'P' && parent.children.length === 1) {
      parent.replaceWith(figure);
    } else {
      img.replaceWith(figure);
    }
    figure.appendChild(img);
    figure.appendChild(figcaption);
  });

  return div.innerHTML;
}
