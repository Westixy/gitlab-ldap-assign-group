FROM node:lts as build

COPY ./src /src
WORKDIR /src

RUN npm ci

FROM node:lts-slim

COPY --from=build /src /src
WORKDIR /src
