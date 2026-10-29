# OpenTakeoff on RunPod (test deployment)

This deployment packages the existing Vite application and a small persistent
file API into one container. Interactive PDF rendering still happens in the
browser; the container establishes the deploy and storage foundation for later
GPU OCR, visual search, and cached server rendering.

## Container settings

- Image: `ghcr.io/luisgarin03/takeoff-runpod:test`
- HTTP port: `8000`
- Persistent mount: `/workspace`
- Health endpoint: `/health`
- Storage directory: `/workspace/opentakeoff-data`

Attach a RunPod Network Volume at `/workspace` if files must survive Pod
termination and redeployment. A regular container disk is not a backup.

## Environment variables

| Name | Required | Default | Purpose |
|---|---:|---|---|
| `PORT` | no | `8000` | HTTP listen port |
| `OPENTAKEOFF_DATA_DIR` | no | `/workspace/opentakeoff-data` | Persistent file directory |
| `OPENTAKEOFF_STORAGE_TOKEN` | for storage | empty | Enables and protects the file API |
| `OPENTAKEOFF_MAX_UPLOAD_BYTES` | no | `2147483648` | Maximum stored file size |

When the token is empty, the application still runs but every storage request
returns `503`. Do not expose storage on a public Pod without a strong token.

## Local verification

```bash
docker build -f Dockerfile.runpod -t opentakeoff-runpod:test .
docker run --rm -p 8000:8000 \
  -e OPENTAKEOFF_STORAGE_TOKEN=change-me \
  -v opentakeoff-data:/workspace \
  opentakeoff-runpod:test
```

Open <http://localhost:8000> and check <http://localhost:8000/health>.

## Storage API

All requests use `Authorization: Bearer <token>`.

- `GET /runpod/api/files`
- `PUT /runpod/api/files/{name}` with the raw file body
- `GET /runpod/api/files/{name}`

The first test deployment does not automatically replace IndexedDB with the
remote API. That client integration should follow after the Pod, volume, and
security configuration have been verified.
