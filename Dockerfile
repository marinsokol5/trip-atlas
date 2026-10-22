# Trip Atlas in a container. Build it, then serve the folder holding your itinerary
# and its documents at http://localhost:4173:
#
#   docker build -t trip-atlas .
#   docker run --rm -p 127.0.0.1:4173:4173 -v "$PWD:/trip:ro" trip-atlas /trip/itinerary.json
FROM node:24-alpine AS build
RUN npm install -g pnpm@11
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build && pnpm pack --out /trip-atlas.tgz

# Just the npm package, which has no runtime dependencies.
FROM node:24-alpine
COPY --from=build /trip-atlas.tgz /tmp/
RUN npm install -g /tmp/trip-atlas.tgz && rm /tmp/trip-atlas.tgz
USER node
# All interfaces inside the container: publish the port on 127.0.0.1 (as above) or
# put a proxy in front, naming it in TRIP_ATLAS_HOSTS.
ENV TRIP_ATLAS_LISTEN=0.0.0.0
EXPOSE 4173
ENTRYPOINT ["trip-atlas"]
