# syntax=docker/dockerfile:1

# ---- Web app (React + Vite) ----
FROM node:22-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @vybe/web

# ---- API (Spring Boot) ----
FROM maven:3.9-eclipse-temurin-21 AS api
# Optional, e.g. proxy settings for restricted networks: --build-arg MAVEN_OPTS="-Dhttps.proxyHost=... -Dhttps.proxyPort=..."
ARG MAVEN_OPTS=""
ENV MAVEN_OPTS=${MAVEN_OPTS}
# Libraries come from Google's mirror of Maven Central (Central rate-limits shared build hosts), with retries.
COPY apps/api/maven-mirror.xml /usr/share/maven/ref/settings-mirror.xml
ENV MAVEN_ARGS="-s /usr/share/maven/ref/settings-mirror.xml -Daether.connector.http.retryHandler.count=8 -Daether.connector.http.retryHandler.interval=15000 -Daether.connector.http.retryHandler.serviceUnavailable=429,503"
WORKDIR /src
COPY apps/api/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY apps/api/src src
RUN mvn -q -B -DskipTests package

# ---- Runtime: one process serves the API and the built web app ----
FROM eclipse-temurin:21-jre
RUN sed -i "s#http://#https://#g" /etc/apt/sources.list.d/*.sources 2>/dev/null; \
    apt-get update && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 vybe \
    && mkdir -p /app/data /app/state && chown -R vybe /app
WORKDIR /app
COPY --from=api /src/target/vybe-api.jar app.jar
COPY --from=web /src/apps/web/dist web
# Catalog metadata ships in the image (hosts like Render have no persistent disk); media comes from
# a mounted volume (docker compose) or object storage via VYBE_MEDIA_BASE_URL.
COPY data/catalog.json data/lyrics.json /app/data/
ENV HOST=0.0.0.0 \
    PORT=4000 \
    VYBE_DATA_DIR=/app/data \
    VYBE_DB_PATH=/app/state/vybe.db \
    VYBE_IMPORTS_DIR=/app/state/imports \
    VYBE_WEB_DIR=/app/web
USER vybe
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=40s CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
