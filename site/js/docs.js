document.addEventListener('alpine:init', () => {
  Alpine.data('docsPage', () => ({
    switchOn: false,
    loading: true,
    error: '',
    content: '',
    toc: [],

    async init() {
      this.initTheme();
      await this.loadMarkdown();
    },

    initTheme() {
      try {
        this.switchOn = localStorage.getItem('clinical-ui-dark') === '1';
      } catch (_error) {
        this.switchOn = false;
      }
    },

    toggleThemeSwitch() {
      this.switchOn = !this.switchOn;
      try {
        localStorage.setItem('clinical-ui-dark', this.switchOn ? '1' : '0');
      } catch (_error) {
        // Ignore storage failures.
      }
    },

    async loadMarkdown() {
      this.loading = true;
      this.error = '';
      try {
        const response = await fetch('./docs/documentation.md', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Impossible de charger la documentation (${response.status}).`);
        const markdown = await response.text();
        this.content = marked.parse(markdown);
        setTimeout(() => this.buildToc(), 0);
      } catch (error) {
        this.error = String(error.message || error);
      } finally {
        this.loading = false;
      }
    },

    slugify(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    },

    buildToc() {
      const headings = [...document.querySelectorAll('.docs-prose h2')];
      const usedIds = new Map();
      this.toc = headings.map((heading) => {
        const text = heading.textContent.trim();
        const baseId = this.slugify(text) || 'section';
        const count = usedIds.get(baseId) || 0;
        usedIds.set(baseId, count + 1);
        const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
        heading.id = id;
        return { id, text };
      });
    },
  }));
});
