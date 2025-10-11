# STAGE 1: Build Stage
# This stage installs all dependencies, including devDependencies,
# and runs the monorepo build script.
FROM node:18-slim AS builder

WORKDIR /app

# Copy all package.json and package-lock.json files
COPY package.json package-lock.json ./
COPY packages/ packages/

# Install all dependencies (including devDependencies for building)
RUN npm install

# Copy the rest of the source code
COPY . .

# Run the build for all packages in the monorepo
# This command is defined in the root package.json
RUN npm run build:all

# STAGE 2: Production Stage
# This stage creates the final, lightweight production image.
FROM node:18-slim

WORKDIR /app

# Set the environment to production
ENV NODE_ENV=production

# Copy only the production package.json and lockfile
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Define build argument for the service path
ARG SERVICE_PATH

# Copy the built artifacts for the specified service
COPY --from=builder /app/${SERVICE_PATH}/dist ./${SERVICE_PATH}/dist
COPY --from=builder /app/packages/mcp-utils/dist ./packages/mcp-utils/dist
COPY --from=builder /app/packages/infra/dist ./packages/infra/dist
COPY --from=builder /app/packages/quantum-infra/dist ./packages/quantum-infra/dist

# Copy the server configuration file for the specified service
COPY ${SERVICE_PATH}/src/server-config.json ./${SERVICE_PATH}/dist/

# Install pm2 globally
RUN npm install pm2 -g

# Copy the pm2 ecosystem config file
COPY ecosystem.config.js .

# The default command to run when the container starts.
# It uses pm2-runtime to start the application in cluster mode.
CMD ["pm2-runtime", "start", "ecosystem.config.js"]