(() => {
  const INCLUDE_SELECTOR = '[data-include]';
  const ALPINE_SRC = 'https://unpkg.com/alpinejs@3.14.9/dist/cdn.min.js';
  const MAX_INCLUDE_DEPTH = 10;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Unable to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function replaceInclude(node) {
    const partialPath = node.getAttribute('data-include');
    if (!partialPath) return;

    const response = await fetch(partialPath, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Unable to load partial ${partialPath}: ${response.status}`);
    }

    const template = document.createElement('template');
    template.innerHTML = await response.text();
    node.replaceWith(template.content.cloneNode(true));
  }

  async function hydrateIncludes() {
    for (let depth = 0; depth < MAX_INCLUDE_DEPTH; depth += 1) {
      const includeNodes = [...document.querySelectorAll(INCLUDE_SELECTOR)];
      if (includeNodes.length === 0) return;
      await Promise.all(includeNodes.map(replaceInclude));
    }

    throw new Error('Too many nested HTML partial includes.');
  }

  function renderBootstrapError(error) {
    const message = String(error.message || error);
    document.body.innerHTML = `
      <main style="font-family: Inter, system-ui, sans-serif; padding: 2rem; color: #102033;">
        <h1 style="margin: 0 0 0.75rem; font-size: 1.25rem;">Unable to start clinical-contract</h1>
        <p style="margin: 0; max-width: 42rem; line-height: 1.6; color: #64748b;">
          The static HTML partials could not be loaded. Serve the site from a local HTTP server or GitHub Pages,
          not directly from the filesystem.
        </p>
        <pre id="bootstrap-error-message" style="margin-top: 1rem; overflow: auto; border: 1px solid #c9dbe8; border-radius: 0.5rem; padding: 1rem; background: #f4f8fc;"></pre>
      </main>
    `;
    document.getElementById('bootstrap-error-message').textContent = message;
  }

  (async () => {
    try {
      await hydrateIncludes();
      await loadScript(ALPINE_SRC);
    } catch (error) {
      console.error(error);
      renderBootstrapError(error);
    }
  })();
})();
