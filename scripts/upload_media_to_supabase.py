#!/usr/bin/env python3
"""
Upload Vybe's generated catalog media (data/media/audio/*.m4a, data/media/art/*.webp) to a PUBLIC
Supabase Storage bucket, and make sure the PRIVATE imports bucket exists.

Only Vybe's own generated catalog belongs in the public bucket.

Usage (from the repo root, after `npm run generate:catalog`):
    SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_KEY=<service_role key> \
        python3 scripts/upload_media_to_supabase.py

Then set VYBE_MEDIA_BASE_URL=<SUPABASE_URL>/storage/v1/object/public/vybe-catalog on the server.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "data" / "media"
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
CATALOG_BUCKET = os.environ.get("VYBE_CATALOG_BUCKET", "vybe-catalog")
IMPORTS_BUCKET = os.environ.get("VYBE_IMPORTS_BUCKET", "vybe-imports")
TYPES = {".m4a": "audio/mp4", ".webp": "image/webp"}


def call(method, path, body=None, headers=None):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(f"{URL}/storage/v1{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("apikey", KEY)
    if body is not None and not isinstance(body, bytes):
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def ensure_bucket(name, public):
    status, _ = call("GET", f"/bucket/{name}")
    if status == 200:
        call("PUT", f"/bucket/{name}", {"id": name, "name": name, "public": public})
        return
    status, body = call("POST", "/bucket", {"id": name, "name": name, "public": public})
    if status // 100 != 2:
        sys.exit(f"Could not create bucket {name}: {status} {body[:200]!r}")
    print(f"Created {'public' if public else 'private'} bucket {name}")


def upload(path: Path, prefix: str):
    key = f"{prefix}/{urllib.parse.quote(path.name)}"
    status, body = call("POST", f"/object/{CATALOG_BUCKET}/{key}", path.read_bytes(),
                        {"Content-Type": TYPES[path.suffix], "x-upsert": "true",
                         "Cache-Control": "max-age=31536000"})
    if status // 100 != 2:
        raise RuntimeError(f"{path.name}: {status} {body[:200]!r}")
    return path.name


def main():
    if not URL or not KEY:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY (service_role key, keep it secret).")
    files = [(p, "audio") for p in sorted((MEDIA / "audio").glob("*.m4a"))] + \
            [(p, "art") for p in sorted((MEDIA / "art").glob("*.webp"))]
    if not files:
        sys.exit("No media found. Run `npm run generate:catalog` first.")
    ensure_bucket(CATALOG_BUCKET, public=True)
    ensure_bucket(IMPORTS_BUCKET, public=False)
    done = failed = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(upload, p, prefix) for p, prefix in files]
        for f in as_completed(futures):
            try:
                f.result(); done += 1
            except Exception as e:  # noqa: BLE001
                failed += 1; print("FAILED", e)
            if (done + failed) % 50 == 0:
                print(f"{done + failed}/{len(files)} uploaded")
    print(f"Done: {done} uploaded, {failed} failed")
    print(f"VYBE_MEDIA_BASE_URL={URL}/storage/v1/object/public/{CATALOG_BUCKET}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
