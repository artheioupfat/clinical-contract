(function registerDocsRouting(root) {
  const pages = Object.freeze([
    Object.freeze({
      id: 'overview',
      fileBase: 'documentation',
      labelKey: 'docs.pages.overview',
      titleKey: 'docs.pageMeta.overviewTitle',
      bodyKey: 'docs.pageMeta.overviewBody',
    }),
    Object.freeze({
      id: 'contract-reference',
      fileBase: 'contract-reference',
      labelKey: 'docs.pages.contractReference',
      titleKey: 'docs.pageMeta.contractReferenceTitle',
      bodyKey: 'docs.pageMeta.contractReferenceBody',
    }),
    Object.freeze({
      id: 'python-api',
      fileBase: 'python-api',
      labelKey: 'docs.pages.pythonApi',
      titleKey: 'docs.pageMeta.pythonApiTitle',
      bodyKey: 'docs.pageMeta.pythonApiBody',
    }),
  ]);

  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const defaultPage = pages[0];

  function resolvePage(search = '') {
    const pageId = new URLSearchParams(search).get('page');
    return pagesById.get(pageId) || defaultPage;
  }

  function pageById(pageId) {
    return pagesById.get(pageId) || defaultPage;
  }

  function pageHref(pageId, locale = '') {
    const page = pageById(pageId);
    const params = new URLSearchParams();
    if (page.id !== defaultPage.id) params.set('page', page.id);
    if (locale) params.set('lang', locale);
    const query = params.toString();
    return `./docs.html${query ? `?${query}` : ''}`;
  }

  const api = Object.freeze({ pages, defaultPage, resolvePage, pageById, pageHref });
  root.ClinicalDocsRouting = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
