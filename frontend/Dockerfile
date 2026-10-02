# ==============================================================================
# Étape 1 : Compilation du frontend React / TypeScript avec Node.js
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ==============================================================================
# Étape 2 : Serveur Nginx pour servir les fichiers statiques compilés
# ==============================================================================
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]


