// The ticket travels only in a POST body, never in the address bar or a referrer.
document.querySelector('form[data-developer-sign-in]')?.requestSubmit();
