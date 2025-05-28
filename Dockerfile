# Verwende ein leichtgewichtiges Node.js-Image (z.B. Alpine)
FROM node:24-alpine

# Setze das Arbeitsverzeichnis im Container
WORKDIR /app

# Kopiere package.json und installiere die Abhängigkeiten
COPY package*.json ./
RUN npm install --production

# Kopiere den Rest des Codes
COPY . .

# Kopiere die Beispiel-Konfiguration in config/config.json
# (Dies überschreibt nicht, wenn du später ein Volume mountest)
RUN cp ./config/config.example.json ./config/config.json

# Starte den Bot
CMD ["node", "index.js"]
