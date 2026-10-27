(() => {
    const storageKey = 'skymp_lang';
    const translations = window.SKMP_TRANSLATIONS || {};
    const supportedLanguages = Object.keys(translations);
    let activeLanguage = 'en';

    function readCookie(name) {
        const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function writeCookie(name, value) {
        document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
    }

    function resolveLanguage() {
        const queryLanguage = new URLSearchParams(window.location.search).get('lang');
        if (queryLanguage && supportedLanguages.includes(queryLanguage)) return queryLanguage;
        const savedLanguage = window.localStorage.getItem(storageKey);
        if (savedLanguage && supportedLanguages.includes(savedLanguage)) {
            return savedLanguage;
        }

        const cookieLanguage = readCookie(storageKey);
        if (cookieLanguage && supportedLanguages.includes(cookieLanguage)) {
            return cookieLanguage;
        }

        const browserLanguage = (navigator.language || 'en').slice(0, 2).toLowerCase();
        if (supportedLanguages.includes(browserLanguage)) {
            return browserLanguage;
        }

        return supportedLanguages.includes('en') ? 'en' : supportedLanguages[0];
    }

    function translate(key) {
        const languagePack = translations[activeLanguage] || {};
        const fallbackPack = translations.en || {};
        return languagePack[key] ?? fallbackPack[key] ?? key;
    }

    function applyLanguage(language) {
        activeLanguage = language;
        document.documentElement.lang = language;

        if (translate('__title') !== '__title') {
            document.title = translate('__title');
        }

        document.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.getAttribute('data-i18n');
            element.textContent = translate(key);
        });

        document.querySelectorAll('[data-i18n-html]').forEach((element) => {
            const key = element.getAttribute('data-i18n-html');
            element.innerHTML = translate(key);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.setAttribute('placeholder', translate(key));
        });

        document.querySelectorAll('[data-i18n-title]').forEach((element) => {
            const key = element.getAttribute('data-i18n-title');
            element.setAttribute('title', translate(key));
        });

        document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
            const key = element.getAttribute('data-i18n-aria-label');
            element.setAttribute('aria-label', translate(key));
        });

        document.querySelectorAll('[id^="lang-switch"]').forEach((select) => {
            select.value = language;
        });

        const docsLabels = {de: 'Dokumentation', en: 'Documentation', ru: 'Документация'};
        document.querySelectorAll('[data-platform-docs]').forEach((link) => {
            const target = new URL(link.href);
            target.searchParams.set('lang', language);
            link.href = target.href;
            link.replaceChildren(document.createTextNode(docsLabels[language] + ' '));
            const arrow = document.createElement('span');
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '↗';
            link.append(arrow);
        });
        document.querySelectorAll('[data-platform-downloads]').forEach((link) => {
            const target = new URL(link.href);
            target.searchParams.set('lang', language);
            link.href = target.href;
            link.textContent = (language === 'ru' ? 'Загрузки' : 'Downloads') + ' ↗';
        });

        if (typeof window.SKMP_AFTER_LANGUAGE_CHANGE === 'function') {
            window.SKMP_AFTER_LANGUAGE_CHANGE(language, translate);
        }
    }

    function setLanguage(language) {
        if (!supportedLanguages.includes(language)) {
            return;
        }

        window.localStorage.setItem(storageKey, language);
        writeCookie(storageKey, language);
        applyLanguage(language);
    }

    window.SKMP_GET_LANGUAGE = () => activeLanguage;
    window.SKMP_T = translate;

    function initialize() {
        document.querySelectorAll('[id^="lang-switch"]').forEach((select) => {
            select.addEventListener('change', () => {
                setLanguage(select.value);
            });
        });

        setLanguage(resolveLanguage());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
