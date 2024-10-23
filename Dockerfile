# Use the official Node.js 20 image from the Docker Hub.
FROM node:20.11.1


# Create and set the working directory
WORKDIR /usr/src

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Install TypeScript globally
RUN npm install -g typescript

# Transpile TypeScript to JavaScript
RUN npm run build



# Expose the port the app runs on
EXPOSE 3000

# Command to run the application k
CMD ["npm", "start"]
