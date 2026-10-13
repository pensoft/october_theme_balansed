# BALANSED website theme

October CMS theme for the BALANSED project website (balansed.pensoft.com), built
by Pensoft from the BALANSED website design.

## Structure

- `layouts/default.htm` – page shell: header, footer, and the inner-page hero
  for content pages that are not individually designed.
- `pages/` – home, about, partners, news, events, library, media centre,
  contact, newsletter, and the content pages (privacy, accessibility, ...).
- `partials/balansed/` – shared pieces (page hero, icons, cards, socials,
  share row, subscribe link, logo). `partials/site/` – header and footer.
- `partials/menu/default.htm` – Menu Manager template for the header nav.
- `partials/librarypage/templates/template5.htm` – library document card.
- `assets/less/theme.less` – the stylesheet: base Pensoft styles for plugin
  component markup (grid, jumbotron, library, forms), then the BALANSED look
  from `assets/less/balansed/` (imported last, so it wins).
- `assets/js/balansed.js` – the BALANSED behaviour (menu drawer, search,
  scroll reveals, section stacking, sliders, scroll-drawn illustrations);
  `assets/js/accessibility.js` – shared accessibility helpers.
- `assets/fonts/balansed/` – Sora and Figtree. `assets/images/balansed/` –
  images and logos. `assets/videos/balansed/` – the section videos.

## Content

All texts and lists are managed in the backend: Pensoft.Jumbotron (homepage
and About texts, privacy and accessibility pages, footer disclaimer),
Pensoft.Partners, Pensoft.Articles, Pensoft.Calendar, Pensoft.Library,
Pensoft.Media, Pensoft.Cardprofiles, Pensoft.Accordions (work packages) and
Menu Manager (header navigation). The newsletter form is the theme setting
"Subscribe link".
