(() => {
    const codes = new Set(/* COUNTRY_CODES */ []);
    const normalize = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
    const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    function name(value, language = document.documentElement.lang || 'en') {
        const code = normalize(value);
        if (!codes.has(code)) return '';
        try { return new Intl.DisplayNames([language], { type: 'region' }).of(code) || ''; } catch { return ''; }
    }
    function html(value, language, showName = false) {
        const code = normalize(value), label = name(code, language);
        if (!label) return '<span class="country-unknown">—</span>';
        return `<span class="country-label" title="${escape(label)}"><img class="country-flag" src="assets/flags/${code.toLowerCase()}.svg" alt="${showName ? '' : escape(label)}">${showName ? `<span>${escape(label)}</span>` : ''}</span>`;
    }
    window.SKMPCountry = { name, html };
})();
