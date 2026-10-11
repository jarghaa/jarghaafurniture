Jarghaa Furniture - website

Handmade wood furniture in Lalitpur, Bagmati Province, Nepal.

PAGES
  index.html       Home
  about.html       About
  shop.html        Products
  furniture.html   Furniture
  contact.html     Contact + embedded map

ASSETS
  css/     bootstrap.css, style.css (compiled from style.scss), responsive.css
  js/      jquery-3.4.1.min.js, bootstrap.js
  images/  photos, icons and logo files

EDITING THE DESIGN
  Colours and layout live in css/style.scss. After editing it, recompile:
      npx sass css/style.scss css/style.css

  Brand colours:
      emerald green   #0b7d54   (primary)
      gold            #c9a24b   (secondary)
      deep emerald    #0e231b   (dark header / footer)

LOGO
  logo-symbol.svg / .png         the dovetail "J" mark (emerald + gold)
  logo-symbol-light.svg / .png   the mark for dark backgrounds
  logo-horizontal.svg / .png     mark + wordmark (navbar, email)
  logo-stacked.svg / .png        stacked badge (signage, engraving)
  The navbar and footer use logo-symbol-light.svg.

DEPLOYMENT
  Pushing to the main branch runs .github/workflows/static.yml, which
  publishes the site to GitHub Pages.
