# ORIGIN website

Open `index.html` in a browser, or deploy the folder as-is (Vercel / Netlify / GitHub Pages). An internet connection is needed for fonts, the 3D scene (three.js) and smooth scrolling (Lenis), which load from CDNs.

## Where things live
- `assets/team/` – crew photos. Set `photo:` for each person in `const PEOPLE` in index.html. Sai Charan still needs a photo.
- `assets/support/` – Our Support photos (section `#support`).
- `assets/gallery/` – gallery photos. To add one, copy a `<figure class="ph">` block in `#gallery` and set `--ar` (width ÷ height).
- `assets/reels/` – reel videos + poster frames. Edit `const REELS` (set `ar` = width / height).

## Sections
About · Recent Events · Certificates · Our Support · Crew · Gallery · Reels · Connect
