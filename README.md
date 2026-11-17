# eldervfd.org

The website of the Elder Mountain Volunteer Fire Department. It is a static site built with
[Eleventy](https://www.11ty.dev/) and hosted free on GitHub Pages.

**Every change pushed to `main` goes live in about a minute.** The "Build and deploy" workflow in the
Actions tab builds the site and publishes it. If a build fails, the old version stays up.

## Making simple edits on github.com (no software needed)

1. Open the file below, click the pencil icon, make the change, and click **Commit changes**.
2. Watch the Actions tab. When the run turns green, the change is live.

| To change | Edit |
| --- | --- |
| Address, email, Facebook link | `src/_data/site.json` |
| Menu | `src/_data/nav.json` |
| About page | `src/about.md` |
| Join or contact us page (volunteer applications and questions, one form) | `src/contact.njk` (form fields in `src/_includes/form.njk`) |
| Home page | `src/index.njk` |
| Photo gallery captions and order | `src/_data/gallery.json` |
| Member resources links | `src/emfd-members-page.md` |
| Burn conditions page text and permit rules | `src/burning.njk` (live data and the index in `src/js/burn.js`) |

Pages ending in `.md` are [Markdown](https://www.markdownguide.org/basic-syntax/): plain text, with `## ` for a
heading and `[link text](https://example.com)` for a link. Leave the block between the `---` lines at the top alone
unless you mean to change the page title or photo.

### Adding a photo

1. Go to `src/img/photos/`, click **Add file → Upload files**, and upload the photo straight from your phone.
   Use a plain file name with no spaces, such as `brush-truck-2026.jpg`.
2. Add an entry to `src/_data/gallery.json`, copying the format of the others: the file name, a short
   caption, and `alt` text that describes the photo for blind visitors. Add `"home": true` to show it in the
   four photos on the home page (keep it to four).

The build resizes photos automatically and removes location data from them. Before uploading, check that a
photo shows no patient, no house number, and nobody who has not agreed to be online.

## Working on your computer

Needs Node 22. `npm install`, then `npm run dev` for a live preview at http://localhost:8080, or
`npm run build` to write the site to `_site/`.

## How it is put together

- `src/_includes/base.njk` is the frame of every page: the 911 strip, header, menu, and footer.
  `page.njk` is the layout for ordinary pages, `form.njk` the one contact form (on /contact/), which asks whether the message is a volunteer application or an information request and sets the email subject to match.
- `src/css/site.css.njk` holds all the styles (Eleventy writes it to `/css/site.css`). CSS, fonts, icons, and the logo are linked with `?v=<build time>` from `src/_data/build.js`, so every deploy busts browser caches; photos get new file names from the image resizer instead. Fonts are Plus Jakarta Sans, the typeface of the original WordPress site (one variable font file for all weights),
  stored in `src/fonts/`.
- Logos and icons are in `src/img/brand/` (the 2025 round logo is the main one; `emfr-shield.png` is the older
  Maltese cross shield).
- The contact form sends email through [Web3Forms](https://web3forms.com). The access key is
  `formKey` in `src/_data/site.json` and is tied to info@eldervfd.org. Without a key, the pages show an
  email link instead of a form.
- `/burning/` is built entirely in the browser by `src/js/burn.js`, from public sources that allow it, every 5 minutes:
  Elder East weather station (FST Dynamics mesonet) for wind gust and humidity; the Prentice Cooper State Forest RAWS
  (USDA Forest Service FEMS, station 409201, fuel model Y) for 10-hour fuel moisture and KBDI; the Tennessee Department of
  Agriculture burn-ban map layer; National Weather Service alerts and forecast for zones TNZ098 (Marion) and TNZ099 (Hamilton);
  and the Air Pollution Control Bureau's "Burning allowed?" and air quality widget (apcb.org page 156 through its WordPress
  API). The index is the BAFDRS points score (each factor 1-6, total 3-18). If a source stops working, its line says
  "Could not check" and the rest of the page still works. The APCB and burn-ban sources are not official APIs, so check them
  if something looks wrong.
- `wordpress-archive/` holds the text of the old WordPress site. It is not published.

## Domain and email

eldervfd.org is registered at WordPress.com (renews every April) and its DNS is managed there. The site
uses four A records for `eldervfd.org` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153)
and a CNAME of `www` to `elder-mountain-fire-department.github.io`. The MX and TXT records are for the
department's Google Workspace email. Do not change those. Keep the domain renewal paid even if the
WordPress plan is cancelled.

## Writing style

- Keep copy short and plain. Use Oxford commas.
- Do not post anything about a call that identifies a patient, a victim, or their address.
- Use real photos, not stock or AI images.
