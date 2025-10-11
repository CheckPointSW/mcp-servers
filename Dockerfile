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

# Install pm2 globally
RUN npm install pm2 -g

# Copy the built artifacts from the 'builder' stage
COPY --from=builder /app/packages/management/dist ./packages/management/dist
COPY --from=builder /app/packages/management-logs/dist ./packages/management-logs/dist
COPY --from=builder /app/packages/mcp-utils/dist ./packages/mcp-utils/dist
COPY --from=builder /app/packages/infra/dist ./packages/infra/dist
COPY --from=builder /app/packages/quantum-infra/dist ./packages/quantum-infra/dist

# Copy the server configuration files
COPY packages/management/src/server-config.json ./packages/management/dist/
COPY packages/management-logs/src/server-config.json ./packages/management-logs/dist/

# Copy the pm2 ecosystem config file
COPY ecosystem.config.js .

# The default command to run when the container starts.
# It uses pm2-runtime to start all applications defined in the ecosystem file.
CMD ["pm2-runtime", "start", "ecosystem.config.js"]