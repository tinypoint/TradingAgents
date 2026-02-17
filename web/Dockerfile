FROM node:20-alpine

WORKDIR /web

# Install dependencies in image layers to avoid reinstall on every boot.
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

