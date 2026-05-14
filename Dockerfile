# Static site — nothing to build, just serve the files with nginx.
FROM nginx:1.27-alpine

# Custom config: SPA-friendly, gzip, sensible cache headers.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# App files (everything the browser needs).
COPY index.html style.css app.js /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1
