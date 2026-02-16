/**
 * Site Images Loader — fetches admin-managed images from API
 * and replaces elements with data-site-image="slot" attributes.
 * Falls back gracefully to static src if API unavailable.
 */
(function () {
  'use strict';

  var API_URL = '/api/v1/public/site-images';

  function applyImage(el, url, altText) {
    var tag = el.tagName.toLowerCase();

    if (tag === 'img') {
      el.src = url;
      if (altText) el.alt = altText;
    } else if (tag === 'video') {
      // Update poster attribute
      el.poster = url;
    } else if (tag === 'source') {
      el.src = url;
      // Reload parent video if needed
      var video = el.closest('video');
      if (video) video.load();
    } else if (tag === 'link') {
      el.href = url;
    } else if (tag === 'meta') {
      el.content = url;
    } else {
      // Generic: try background-image
      el.style.backgroundImage = 'url(' + url + ')';
    }
  }

  function loadSiteImages() {
    var elements = document.querySelectorAll('[data-site-image]');
    if (!elements.length) return;

    fetch(API_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (images) {
        // Build slot→image map
        var map = {};
        for (var i = 0; i < images.length; i++) {
          map[images[i].slot] = images[i];
        }

        elements.forEach(function (el) {
          var slot = el.getAttribute('data-site-image');
          var img = map[slot];
          if (img && img.image_url) {
            applyImage(el, img.image_url, img.alt_text);
          }
        });
      })
      .catch(function () {
        // Silent fail — keep static fallback images
      });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSiteImages);
  } else {
    loadSiteImages();
  }
})();
