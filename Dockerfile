FROM nginx:1.27-alpine

COPY index.html puzzles.txt manifest.webmanifest sw.js /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY icons/ /usr/share/nginx/html/icons/
COPY dictionaries/ /usr/share/nginx/html/dictionaries/

EXPOSE 80
