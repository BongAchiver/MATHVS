#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/run/mathvs-update.lock
flock -n 9 || exit 0
cd /opt/mathvs
tag=${1:-$(curl --connect-timeout 10 --max-time 30 --retry 2 -fsSL https://api.github.com/repos/BongAchiver/MATHVS/releases/latest | python3 -c 'import json,sys; r=json.load(sys.stdin); required={"mathvs-image.tar.gz","compose.yaml","env.example","RELEASE.md","SHA256SUMS"}; assert not r["draft"] and not r["prerelease"] and required.issubset({a["name"] for a in r["assets"] if a["state"]=="uploaded"}), "Release assets not ready"; print(r["tag_name"])')}
[[ "$tag" =~ ^build-[0-9]+-[a-f0-9]{7}$ ]] || { echo 'Invalid release tag' >&2; exit 1; }
if [[ -f current-release && "$(cat current-release)" == "$tag" ]]; then
    echo "Already running $tag"
    exit 0
fi
stage="/opt/mathvs/releases/.incoming-$tag"
install -d -m 0750 "$stage"
cleanup_stage() { rm -rf -- "$stage"; }
trap cleanup_stage EXIT
base="https://github.com/BongAchiver/MATHVS/releases/download/$tag"
for file in mathvs-image.tar.gz compose.yaml env.example RELEASE.md SHA256SUMS; do
    curl --connect-timeout 10 --max-time 300 --retry 3 -fLsS "$base/$file" -o "$stage/$file"
done
(cd "$stage" && sha256sum -c SHA256SUMS)
docker compose -f "$stage/compose.yaml" config --quiet
if docker volume inspect mathvs_mathvs-data >/dev/null 2>&1; then /opt/mathvs/backup.sh; fi
docker load -i "$stage/mathvs-image.tar.gz"
cp compose.yaml compose.previous.yaml
install -m 0640 "$stage/compose.yaml" compose.yaml
healthy() {
    docker compose up -d --wait --wait-timeout 90 &&
    curl --retry 3 --retry-delay 2 --max-time 10 -fsS http://127.0.0.1:3000/api/health
}
if ! healthy; then
    cp compose.previous.yaml compose.yaml
    docker compose up -d --wait --wait-timeout 90
    docker image rm "mathvs:$tag" || true
    echo 'New image failed healthcheck; previous image restored. Database volume retained.' >&2
    exit 1
fi
# Commit only after the new container passes both Docker and API health checks.
printf '%s\n' "$tag" > current-release.next
mv current-release.next current-release
release="/opt/mathvs/releases/$tag"
mv "$stage" "$release"
trap - EXIT
# Compose now points at the new image. Remove only obsolete MATHVS tags, never
# volumes, unrelated images, or the previous image during a failed deployment.
while IFS= read -r image; do
    [[ "$image" == "mathvs:$tag" ]] && continue
    [[ "$image" =~ ^mathvs:build-[0-9]+-[a-f0-9]{7}$ ]] || continue
    docker image rm "$image" || true
done < <(docker image ls mathvs --format '{{.Repository}}:{{.Tag}}')
for path in /opt/mathvs/releases/build-*; do
    [[ -d "$path" && ! -L "$path" && "$path" != "$release" ]] || continue
    [[ "$(basename "$path")" =~ ^build-[0-9]+-[a-f0-9]{7}$ ]] || continue
    rm -rf -- "$path"
done
# The archive has been loaded; keeping it would duplicate the installed image.
rm -f "$release/mathvs-image.tar.gz" compose.previous.yaml
echo "Release running: $tag; obsolete MATHVS images and archives removed."
