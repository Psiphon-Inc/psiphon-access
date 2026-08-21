# syntax=docker/dockerfile:1
#
# Release build Dockerfile for Psiphon Access Linux amd64 command artifacts.
# Compiles teleport, tctl, and tsh in a clean, pinned Debian container.

ARG GO_IMAGE=docker.io/library/golang@sha256:0d327c83532d3cdeeeebab56ce85962bf09cb89545355b10207c7771b0c3713f

FROM ${GO_IMAGE} AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .

ARG VERSION=19.0.0-psiphon.1
ARG GITREF

ENV GOFLAGS=-buildvcs=false

RUN test -n "${GITREF}" || { echo "GITREF build argument is required" >&2; exit 1; }

RUN go -C build.assets/tooling run ./cmd/apiversion "${VERSION}" > api/version.go

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 go build -trimpath -ldflags "-w -s -X github.com/gravitational/teleport.Gitref=${GITREF} -extldflags '-static'" \
      -o /out/teleport-linux-amd64 ./tool/teleport

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags "-w -s -X github.com/gravitational/teleport.Gitref=${GITREF}" \
      -o /out/tctl-linux-amd64 ./tool/tctl

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 go build -trimpath -ldflags "-w -s -X github.com/gravitational/teleport.Gitref=${GITREF} -extldflags '-static'" \
      -o /out/tsh-linux-amd64 ./tool/tsh

FROM scratch AS artifacts
COPY --from=builder /out/teleport-linux-amd64 /teleport-linux-amd64
COPY --from=builder /out/tctl-linux-amd64 /tctl-linux-amd64
COPY --from=builder /out/tsh-linux-amd64 /tsh-linux-amd64
