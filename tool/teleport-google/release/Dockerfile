# Compile on a matching native Debian platform. Never cross compile.
ARG GO_IMAGE=docker.io/library/golang@sha256:0d327c83532d3cdeeeebab56ce85962bf09cb89545355b10207c7771b0c3713f
FROM ${GO_IMAGE} AS builder
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev lld \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
ARG VERSION
ARG GITREF
ENV GOFLAGS=-buildvcs=false GOTOOLCHAIN=local GOMAXPROCS=2 GOENV=off
RUN test "$(go env GOVERSION)" = go1.26.5 \
    && test "$(go env GOARCH)" = "$(go env GOHOSTARCH)" \
    && test "${#GITREF}" = 40 && test -n "$VERSION"
RUN go -C build.assets/tooling run -mod=readonly ./cmd/apiversion "$VERSION" > api/version.go
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    set -eu; arch=$(go env GOHOSTARCH); \
    for tool in teleport tctl tsh; do \
      cgo=1; flags="-w -s -X github.com/gravitational/teleport.Gitref=${GITREF}"; \
      if [ "$tool" = tctl ]; then cgo=0; \
      else \
        extldflags="-static"; \
        if [ "$arch" = arm64 ]; then extldflags="$extldflags -fuse-ld=lld"; fi; \
        flags="$flags -extldflags '$extldflags'"; \
      fi; \
      CGO_ENABLED=$cgo go build -mod=readonly -p 2 -trimpath -ldflags "$flags" \
        -o "/out/$tool-linux-$arch" "./tool/$tool"; \
    done
FROM scratch AS artifacts
COPY --from=builder /out/ /
