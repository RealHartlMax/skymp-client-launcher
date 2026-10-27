// Local, accessible password controls shared by all account and setup forms.
(() => {
    const labels = {
        de: ['Passwort einblenden', 'Passwort ausblenden'],
        en: ['Show password', 'Hide password'],
        ru: ['Показать пароль', 'Скрыть пароль'],
    };
    const words = labels[document.documentElement.lang.slice(0, 2)] || labels.en;
    let sequence = 0;
    const hideAll = () => document.querySelectorAll('[data-password-toggle][aria-pressed="true"]').forEach(button => button.click());
    function install(root = document) {
        root.querySelectorAll('input[type="password"]').forEach(input => {
            if (input.dataset.passwordControl) return;
            input.dataset.passwordControl = 'true';
            if (!input.id) {
                do { input.id = 'password-field-' + ++sequence; }
                while (document.querySelectorAll('#' + input.id).length > 1);
            }
            const wrapper = document.createElement('span');
            wrapper.className = 'password-field';
            input.before(wrapper); wrapper.append(input);
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'password-toggle';
            button.dataset.passwordToggle = 'true';
            button.setAttribute('aria-controls', input.id);
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            for (const [key, value] of Object.entries({viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.75', 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true'})) svg.setAttribute(key, value);
            const eye = document.createElementNS(ns, 'path');
            eye.setAttribute('d', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z');
            const pupil = document.createElementNS(ns, 'circle');
            pupil.setAttribute('cx', '12'); pupil.setAttribute('cy', '12'); pupil.setAttribute('r', '3');
            const slash = document.createElementNS(ns, 'path'); slash.setAttribute('d', 'M3 3l18 18');
            svg.append(eye, pupil, slash); button.append(svg); wrapper.append(button);
            function update() {
                const visible = input.type === 'text';
                button.setAttribute('aria-label', words[visible ? 1 : 0]);
                button.setAttribute('title', words[visible ? 1 : 0]);
                button.setAttribute('aria-pressed', String(visible));
                slash.style.display = visible ? '' : 'none';
                button.disabled = input.disabled;
            }
            button.addEventListener('click', event => {
                event.preventDefault();
                const start = input.selectionStart, end = input.selectionEnd;
                input.type = input.type === 'password' ? 'text' : 'password';
                update(); input.focus({preventScroll:true});
                if (start !== null && end !== null) input.setSelectionRange(start, end);
            });
            update();
            new MutationObserver(update).observe(input, {attributes:true, attributeFilter:['disabled']});
            input.form?.addEventListener('submit', () => { input.type = 'password'; update(); });
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install());
    else install();
    window.addEventListener('pagehide', hideAll);
})();
