#!/bin/sh
# Downloads the pinned Litestream release into ./bin for the hosted (Render) build.
# The checksum is pinned here, not fetched, so a swapped release asset fails the build.
set -eu

VERSION=0.5.18
SHA256=d3687b9fd0f2e9426bbd3da828429ff3f1dfc5c9b74d54fdf028e4ee510e7dea
ARCHIVE="litestream-${VERSION}-linux-x86_64.tar.gz"

mkdir -p bin
curl -fsSL -o "bin/${ARCHIVE}" \
  "https://github.com/benbjohnson/litestream/releases/download/v${VERSION}/${ARCHIVE}"
echo "${SHA256}  bin/${ARCHIVE}" | sha256sum -c -
tar -xzf "bin/${ARCHIVE}" -C bin litestream
rm "bin/${ARCHIVE}"
./bin/litestream version
