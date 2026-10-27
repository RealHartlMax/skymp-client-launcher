document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[id^="lang-switch"]').forEach((select) => {
        select.addEventListener('change', () => {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set('lang', select.value);
            window.location.assign(nextUrl.toString());
        });
    });

    document.querySelectorAll('[data-confirm]').forEach((form) => {
        form.addEventListener('submit', (event) => {
            const message = form.getAttribute('data-confirm') || 'Are you sure?';
            if (!window.confirm(message)) {
                event.preventDefault();
            }
        });
    });

    document.querySelectorAll('[data-copy]').forEach((button) => {
        button.addEventListener('click', async () => {
            const value = button.getAttribute('data-copy') || '';
            if (!value) {
                return;
            }

            const originalLabel = button.getAttribute('data-copy-label') || button.textContent;
            const successLabel = button.getAttribute('data-copy-success') || 'Copied';
            const failureLabel = button.getAttribute('data-copy-failure') || 'Copy failed';

            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(value);
                } else {
                    const helper = document.createElement('textarea');
                    helper.value = value;
                    helper.setAttribute('readonly', 'readonly');
                    helper.style.position = 'absolute';
                    helper.style.left = '-9999px';
                    document.body.appendChild(helper);
                    helper.select();
                    document.execCommand('copy');
                    document.body.removeChild(helper);
                }

                button.textContent = successLabel;
                window.setTimeout(() => {
                    button.textContent = originalLabel;
                }, 1400);
            } catch (error) {
                console.error('Copy failed', error);
                button.textContent = failureLabel;
                window.setTimeout(() => {
                    button.textContent = originalLabel;
                }, 1800);
            }
        });
    });

    document.querySelectorAll('[data-country-search]').forEach((searchInput) => {
        const targetId = searchInput.getAttribute('data-country-search');
        if (!targetId) {
            return;
        }

        const select = document.getElementById(targetId);
        if (!select) {
            return;
        }

        const allOptions = Array.from(select.options).map((option) => ({
            value: option.value,
            text: option.text,
            selected: option.selected,
        }));

        const defaultOption = allOptions.find((entry) => entry.value === '') || { value: '', text: '', selected: false };
        const countryOptions = allOptions.filter((entry) => entry.value !== '');

        const renderCountryOptions = (query) => {
            const needle = String(query || '').trim().toLowerCase();
            const selectedValue = select.value;

            let filtered = countryOptions.filter((entry) => {
                if (!needle) {
                    return true;
                }

                return entry.text.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle);
            });

            if (selectedValue && !filtered.some((entry) => entry.value === selectedValue)) {
                const selectedEntry = countryOptions.find((entry) => entry.value === selectedValue);
                if (selectedEntry) {
                    filtered = [selectedEntry, ...filtered];
                }
            }

            select.innerHTML = '';

            const defaultNode = document.createElement('option');
            defaultNode.value = defaultOption.value;
            defaultNode.textContent = defaultOption.text;
            select.appendChild(defaultNode);

            filtered.forEach((entry) => {
                const optionNode = document.createElement('option');
                optionNode.value = entry.value;
                optionNode.textContent = entry.text;
                select.appendChild(optionNode);
            });

            if (selectedValue && Array.from(select.options).some((entry) => entry.value === selectedValue)) {
                select.value = selectedValue;
            }
        };

        searchInput.addEventListener('input', () => {
            renderCountryOptions(searchInput.value);
        });

        renderCountryOptions('');
    });
});
