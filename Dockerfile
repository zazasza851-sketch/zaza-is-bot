FROM node:22

WORKDIR /app

RUN npm install @whiskeysockets/baileys pino qrcode

COPY index.js ./

EXPOSE 8080

CMD ["node", "index.js"]
