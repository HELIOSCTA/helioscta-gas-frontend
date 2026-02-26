FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application code
COPY . .

EXPOSE 2222

CMD ["npx", "next", "dev", "-p", "2222"]
