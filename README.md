# Alice nas Artes

**Artist portfolio website** for Alice de Fátima Loureiro — a Portuguese painter, photographer, and art teacher — built and maintained by [Ana Loureiro](https://github.com/anawk).

**Live site:** [alicenasartes.net](https://gh.alicenasartes.net)

---

## Overview

A production gallery website showcasing over 260 original artworks across three disciplines: oil and acrylic paintings, fine-art photography, and mixed-technique works. The site serves as the artist's primary public portfolio and point of contact.

Built without a JavaScript framework — deliberately lean, fast, and maintainable by a non-technical owner.

---

## Features

- **Daily rotating spotlight** — painting and photograph of the day cycle based on the current date, giving repeat visitors new content on each visit
- **Four photography galleries** — Structures, Nature, Beach, and Free Theme, each navigable via a sticky dropdown menu
- **Paintings gallery** — 26 works with hover overlays showing title, year, medium, and dimensions
- **Mixed-technique gallery** — 14 works in the same interaction pattern
- **Downloadable PDF portfolio** — one-click access to the printable portfolio
- **Biography page** — professional credentials and artist statement
- **Fully responsive** — mobile, tablet, and desktop layouts via Bootstrap 5 and custom media queries
- **Custom domain** — deployed on GitHub Pages with CNAME configuration

---

## Tech Stack

| Layer | Choice |
|---|---|
| Markup | HTML5 |
| Styling | CSS3 · Bootstrap 5.3.2 |
| Scripting | Vanilla JavaScript · jQuery 3.2.1 |
| Icons | FontAwesome |
| Hosting | GitHub Pages |
| Domain | Custom CNAME (`gh.alicenasartes.net`) |

No build step, no bundler, no dependencies to manage — intentional for long-term maintainability.

---

## Project Structure

```
├── index.html          # Homepage — daily painting & photo spotlight
├── pinturas.html       # Paintings gallery (26 works)
├── fotografia.html     # Photography gallery (217 photos, 4 categories)
├── mista.html          # Mixed-technique gallery (14 works)
├── biografia.html      # Artist biography
├── CNAME               # GitHub Pages custom domain
└── src/
    ├── style.css       # Global styles
    ├── galery.css      # Gallery-specific styles
    ├── script.js       # Daily rotation logic & gallery interactions
    └── img/            # 260+ original artworks and photographs
```

---

## What this project demonstrates

- Translating a real client's needs into a working, deployed product
- Responsive layout design from scratch and with Bootstrap utilities
- Dynamic content logic in vanilla JS (date-based content rotation)
- CSS hover interactions and modal patterns without a UI library
- Handling a large static asset library (~260 images) with organized structure
- GitHub Pages deployment with custom domain configuration
- Attention to performance: no unnecessary dependencies, CDN-loaded libraries

---

## Copyright

Website code &copy; 2024–2026 Ana Loureiro. All rights reserved.

All artwork, paintings, and photographs &copy; Alice de Fátima Loureiro. All rights reserved. Reproduction or redistribution of any visual content is prohibited without written consent. See [LICENSE](./LICENSE) for details.
