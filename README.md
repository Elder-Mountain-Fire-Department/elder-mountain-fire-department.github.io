# eldervfd.org

The website of the Elder Mountain Fire Department (EMFD). It is a static site built with
[Eleventy](https://www.11ty.dev/) and hosted free on GitHub Pages at https://eldervfd.org.

**Every change pushed to `main` goes live in about a minute.** The "Build and deploy" workflow in the
Actions tab builds the site and publishes it. If a build fails, the old version stays up.

## Making simple edits on github.com (no software needed)

1. Open the file below, click the pencil icon, make the change, and click **Commit changes**.
2. Watch the Actions tab. When the run turns green, the change is live.

| To change | Edit |
| --- | --- |
| Address, email, Facebook link, form key | `src/_data/site.json` |
| Menu | `src/_data/nav.json` |
| Home page | `src/index.njk` |
| About page, including apparatus | `src/about.md` |
| Photo gallery captions and order | `src/_data/gallery.json` |
| Join or contact us page (one form for volunteer applications and questions) | `src/contact.njk` (form fields in `src/_includes/form.njk`) |
| Burn conditions page text and Marion County permit rules | `src/burning.njk` |
| Member resources link | `src/emfd-members-page.md` |

Pages ending in `.md` are [Markdown](https://www.markdownguide.org/basic-syntax/): plain text, with `## ` for a
heading and `[link text](https://example.com)` for a link. Leave the block between the `---` lines at the top alone
unless you mean to change the page title or photo.

### Adding a photo

1. Go to `src/img/photos/`, click **Add file → Upload files**, and upload the photo straight from your phone.
   Use a plain file name with no spaces, such as `brush-1-2026.jpg`.
2. Add an entry to `src/_data/gallery.json`, copying the format of the others: the file name, a short
   caption, and `alt` text that describes the photo for blind visitors. Add `"home": true` to show it in the
   four photos on the home page (keep it to four; the first one is shown large).

The build resizes photos automatically and removes location data from them. Before uploading, check that a
photo shows no patient, no house number, and nobody who has not agreed to be online.

## Working on your computer

Needs Node 22. `npm install`, then `npm run dev` for a live preview at http://localhost:8080, or
`npm run build` to write the site to `_site/`.

## How it is put together

- `src/_includes/base.njk` is the frame of every page: header, menu (a Menu button on phones), and footer. On the
  home page the header starts clear over the photo and fades to white as you scroll. `page.njk` is the layout for
  ordinary pages (one centered column).
- The home page banner is the Tennessee River Gorge photo. It stays put while the page scrolls up over it, fills the
  whole screen on phones (including under the iPhone status bar), and carries the "Call 911 for emergencies" line.
- `src/css/site.css.njk` holds all the styles (Eleventy writes it to `/css/site.css`). Fonts are Plus Jakarta Sans,
  the typeface of the original WordPress site, in `src/fonts/`. CSS, fonts, scripts, icons, and the logo are linked
  with `?v=<build time>` from `src/_data/build.js`, so each deploy busts browser caches. Photos get new file names
  from the image resizer instead.
- Logos and icons are in `src/img/brand/`. The 2025 round logo is the main one; `emfr-shield.png` is the older
  Maltese cross shield.
- The contact form sends email through [Web3Forms](https://web3forms.com). The access key is `formKey` in
  `src/_data/site.json` and is tied to info@eldervfd.org. Without a key, the page shows an email link instead.
  `/join-us/` redirects to the contact page with "volunteer" already selected.
- The members page (`/emfd-members-page/`) is hidden from search engines but not password protected. Put nothing
  private on it.
- `wordpress-archive/` holds the text of the old WordPress site. It is not published.

### Burn conditions (`/burning/` and the box on the home page)

Everything is fetched in the visitor's browser by `src/js/burn.js` from public sources, and refreshed every 5
minutes while the page is open. No server or scheduled job is involved.

- **Elder East** weather station (FST Dynamics mesonet): wind gust and humidity on the mountain.
- **Prentice Cooper State Forest** RAWS (USDA Forest Service FEMS, station 409201, fuel model Y): weather, rain,
  observed and forecast 10-hour fuel moisture, and the drought index (KBDI).
- **National Weather Service**: alerts and the hourly forecast of gusts and humidity for Marion County (zone TNZ098).
- **Tennessee Department of Agriculture** burn-ban map layer for Marion County.
- **Chattanooga-Hamilton County Air Pollution Control Bureau**: the daily air quality forecast (apcb.org page 156
  through its WordPress API).

Fire danger is the **FST Dynamics Basic Fire Danger Rating System**. Ten-hour fuel moisture, wind gust, and
humidity are each scored 1 to 6 and added up; the total maps to very low, low, moderate, high, or very high. Only
the category is shown.

- Right now: both stations are rated, and the page uses the higher danger.
- Today's peak, the hourly burn windows, and the next five days: every hour from 8 AM to 8 PM is rated from the
  National Weather Service forecast and the Forest Service fuel moisture forecast. A day's rating is its highest
  hour, the way the national fire danger rating reports a daily peak.
- The page says **do not burn** at high or very high, and whenever there is a Marion County burn ban, a Red Flag
  Warning, a Fire Weather Watch, a Wind Advisory, gusts of 20 mph or more, or humidity under 25%.

Permit information is for Marion County (Tennessee Division of Forestry), where the station is. Forestry's permit
system cannot be read by other websites, so the page links to it. If a source stops working, its line says
"Could not check" and the rest of the page still works. The burn-ban layer and the APCB page are not official
APIs, so check them first if something looks wrong.

## Domain and email

eldervfd.org is registered at WordPress.com (renews every April) and its DNS is managed there. Keep the domain
renewal paid even if the WordPress plan is cancelled.

- The site uses four A records (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153), four AAAA
  records (2606:50c0:8000::153 through 2606:50c0:8003::153), and a CNAME of `www` to
  `elder-mountain-fire-department.github.io`.
- The custom domain is set under the repository's Settings → Pages, with "Enforce HTTPS" on. GitHub renews the
  certificate automatically.
- The MX, SPF, DKIM, and Google verification records are for the department's Google Workspace email. Do not
  change them.
- The TXT record `_github-pages-challenge-Elder-Mountain-Fire-Department` verifies the domain for the GitHub org, so
  no other GitHub account can claim eldervfd.org. Keep it.

## Writing style

- Keep copy short and plain. Use Oxford commas.
- The department's name is the Elder Mountain Fire Department (EMFD).
- Do not post anything about a call that identifies a patient, a victim, or their address.
- Use real photos, not stock or AI images.
