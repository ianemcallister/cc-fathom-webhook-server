# Use an appropriate Node.js base image for the build stage
FROM node:18.0.0 AS build

# Set the working directory
WORKDIR /app

# Copy your package.json and package-lock.json (if available) and install dependencies
COPY package.json package-lock.json* ./
RUN npm install 
# && npm ci --only=production

# Copy your application code
COPY . .

# Build your application (if needed)
RUN npm run build

# Create a production-ready image
FROM node:18-slim AS production

# Set the working directory
WORKDIR /home/node/app

# Copy the production-ready artifacts from the build stage
COPY --from=build /app ./

# Expose the port your application is listening on (if applicable)
# EXPOSE 3000

# Set any environment variables needed for production (if applicable)
# ENV NODE_ENV production

# Define the command to run your server app in production
CMD [ "node", "app.js" ]