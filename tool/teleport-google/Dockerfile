# syntax=docker/dockerfile:1
#
# Auth/Proxy/Kubernetes agent image for this fork.
# Same runtime contract as build.assets/charts/Dockerfile-distroless:
# distroless/cc-debian12, dumb-init, binary at /usr/local/bin/teleport,
# STOPSIGNAL SIGQUIT, start -c /etc/teleport/teleport.yaml.
#
# The web assets and Go binary are built inside clean, digest-pinned Debian
# stages. No host-built binary and no host-built web bundle enter the image.

ARG GO_IMAGE=docker.io/library/golang@sha256:0d327c83532d3cdeeeebab56ce85962bf09cb89545355b10207c7771b0c3713f
ARG NODE_IMAGE=docker.io/library/node:24-bookworm@sha256:f6d02cf1353049cf3658e6ce9ec03c6877a6479495f122062d195e2279d01055
ARG BASE_IMAGE=gcr.io/distroless/cc-debian12@sha256:6dc8478fd8e790ae427aeff51e588573dec83b13adb7e5d10505a717927009b5
ARG STAGING_IMAGE=docker.io/library/debian:12@sha256:88a7d30d49e1d13f0aac17b0e5fb9e291717e3a7c4a512fe56636db576383b8a

FROM ${NODE_IMAGE} AS web-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 librsvg2-bin git make gcc g++ libc6-dev clang llvm binaryen curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.94.0 --target wasm32-unknown-unknown
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install wasm-bindgen-cli --version 0.2.126 --locked

WORKDIR /src
COPY . .

ARG VERSION=19.0.0-psiphon.1
ARG GITREF
RUN test -n "${GITREF}" || { echo "GITREF build argument is required" >&2; exit 1; }

ENV ACCESS_REVISION="${GITREF}"
ENV ACCESS_BUILD="${VERSION}"
ENV CC_wasm32_unknown_unknown=clang
ENV AR_wasm32_unknown_unknown=llvm-ar

RUN --mount=type=cache,target=/root/.cargo/registry \
    --mount=type=cache,target=/root/.pnpm-store \
    corepack enable pnpm \
    && python3 tool/teleport-google/assets/stamp-build.py \
    && python3 tool/teleport-google/assets/derive-logo.py --favicons \
    && pnpm install --frozen-lockfile \
    && pnpm --filter=@gravitational/teleport build

FROM ${GO_IMAGE} AS go-builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .
COPY --from=web-builder /src/webassets/teleport /src/webassets/teleport

ARG VERSION=19.0.0-psiphon.1
ARG GITREF
RUN test -n "${GITREF}" || { echo "GITREF build argument is required" >&2; exit 1; }

RUN go -C build.assets/tooling run ./cmd/apiversion "${VERSION}" > api/version.go

ENV CGO_ENABLED=1
ENV GOFLAGS=-buildvcs=false
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -tags "grpcnotrace webassets_embed" \
      -ldflags "-w -s -X github.com/gravitational/teleport.Gitref=${GITREF}" \
      -o /out/teleport ./tool/teleport

FROM ${STAGING_IMAGE} AS staging
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

FROM ${BASE_IMAGE}
ARG VERSION=19.0.0-psiphon.1
ARG GITREF

LABEL org.opencontainers.image.title="Psiphon Access" \
      org.opencontainers.image.description="Psiphon Access Auth, Proxy and Kubernetes agent" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GITREF}" \
      org.opencontainers.image.vendor="Psiphon Inc." \
      org.opencontainers.image.licenses="AGPL-3.0"

COPY --from=staging /usr/bin/dumb-init /usr/bin/dumb-init
COPY --from=staging /etc/ssl/certs /etc/ssl/certs
COPY THIRD_PARTY_NOTICES /usr/local/share/licenses/teleport/THIRD_PARTY_NOTICES
COPY LICENSE /usr/local/share/licenses/teleport/LICENSE
COPY --from=go-builder /out/teleport /usr/local/bin/teleport

ENV TELEPORT_TOOLS_VERSION=off
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/bin/dumb-init", "/usr/local/bin/teleport", "start", "-c", "/etc/teleport/teleport.yaml"]
