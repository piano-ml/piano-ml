FROM node:22-alpine as build
RUN apk add git
WORKDIR /app/src
COPY package*.json ./
COPY . ./
RUN npm run build

FROM node:22-alpine
WORKDIR /usr/app
COPY --from=build /app/src/dist/piano-ml ./
CMD node server/server.mjs
EXPOSE 4000