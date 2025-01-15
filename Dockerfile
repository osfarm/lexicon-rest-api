FROM oven/bun:alpine

WORKDIR /app

ENV PATH="${PATH}:/root/.bun/bin"

#########
# ARGS
###########

###########
# ENV
###########

ENV FULL_ICU_PREFER_NPM=true
RUN npm init -y && bun add full-icu
ENV NODE_ICU_DATA=/app/node_modules/full-icu

ENV NODE_OPTIONS=--max_old_space_size=4096

COPY . .

RUN rm -rf ./node_modules
RUN bun install

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

CMD ["bun", "start"]