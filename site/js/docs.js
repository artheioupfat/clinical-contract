document.addEventListener('alpine:init', () => {
  const pageShell = window.ClinicalPageShell;

  Alpine.data('docsPage', () => ({
    switchOn: false,
    locale: '',
    siteVersionLabel: pageShell.versionLabel(window.ClinicalContractVersion),
    loading: true,
    error: '',
    content: '',
    toc: [],
    activeTocId: '',
    tocScrollHandler: null,

    async init() {
      this.initThemeSwitch();
      await this.initLocale();
      await this.loadMarkdown();
    },

    ...pageShell.themeMethods,
    ...pageShell.localeMethods,

    applyPageMetadata() {
      pageShell.setPageMetadata(this.t('docs.meta.title'), this.t('docs.meta.description'));
    },

    async onLocaleChanged() {
      await this.loadMarkdown();
    },

    async loadMarkdown() {
      this.loading = true;
      this.error = '';
      try {
        const response = await fetch(`./docs/documentation.${this.locale}.md`, { cache: 'no-cache' });
        if (!response.ok) throw new Error(this.t('docs.loadError', { status: response.status }));
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
      this.activeTocId = this.toc[0]?.id || '';
      this.observeTocHeadings();
    },

    observeTocHeadings() {
      const scrollRoot = document.querySelector('.docs-frame');
      if (this.tocScrollHandler && scrollRoot) {
        scrollRoot.removeEventListener('scroll', this.tocScrollHandler);
      }

      const headings = [...document.querySelectorAll('.docs-prose h2')];
      if (!headings.length || !scrollRoot) return;

      this.tocScrollHandler = () => this.updateActiveTocFromScroll(headings, scrollRoot);
      scrollRoot.addEventListener('scroll', this.tocScrollHandler, { passive: true });
      this.updateActiveTocFromScroll(headings, scrollRoot);
    },

    updateActiveTocFromScroll(headings, scrollRoot) {
      if (!headings.length || !scrollRoot) return;

      const isNearBottom = scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 48;
      if (isNearBottom) {
        this.activeTocId = headings[headings.length - 1].id;
        return;
      }

      const rootTop = scrollRoot.getBoundingClientRect().top;
      const activeLine = rootTop + Math.min(180, scrollRoot.clientHeight * 0.3);
      let activeHeading = headings[0];

      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= activeLine) {
          activeHeading = heading;
        } else {
          break;
        }
      }

      this.activeTocId = activeHeading.id;
    },
  }));
});
