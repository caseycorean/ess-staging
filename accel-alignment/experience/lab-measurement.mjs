// The Lab is hand-authored, so it does not inherit the static page generator's Google tag.
if (location.hostname === 'endicottspeedshop.com' && typeof window.gtag !== 'function') {
  const id = 'G-GGJVMS8CZD';
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  const src = document.createElement('script');
  src.async = true;
  src.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.append(src);
  window.gtag('config', id, {
    page_location:location.origin + location.pathname,
    page_referrer:document.referrer ? new URL(document.referrer).origin : '',
  });
}
