# Eko EPS — Authentication

Source: Postman collection prerequest script (`postman/eps-collection.json`).

## Collection variables

| Variable | Role |
|----------|------|
| `access_key` | Partner access key (UTF-8 → Base64 → HMAC key material) |
| `developer_key` | Sent as header `developer_key` on every request |
| `secret-key` | Computed per request (do not store long-term) |
| `secret-key-timestamp` | Milliseconds since epoch (string) used as HMAC message |

**Never commit real keys.** Put secrets in Coolify / local `.env` only.

## Algorithm (per request)

```text
ts = String(Date.now())                          // e.g. "1730000000000"
encodedKey = Base64(UTF8(access_key))
secret-key = Base64(HMAC-SHA256(message=ts, key=encodedKey))
secret-key-timestamp = ts
```

## Headers (typical)

```http
developer_key: <developer_key>
secret-key: <computed>
secret-key-timestamp: <ts>
content-type: application/json
```

## Node / backend sketch

```js
import crypto from "node:crypto";

export function ekoAuthHeaders(accessKey, developerKey) {
  const ts = Date.now().toString();
  const encodedKey = Buffer.from(accessKey, "utf8").toString("base64");
  const sig = crypto.createHmac("sha256", encodedKey).update(ts).digest("base64");
  return {
    developer_key: developerKey,
    "secret-key": sig,
    "secret-key-timestamp": ts,
    "content-type": "application/json",
  };
}
```

## Notes / gaps

- Official doc may clarify whether HMAC key is raw `access_key` or Base64 form (collection uses Base64 form as HMAC key).
- Staging base: `https://staging.eko.in/ekoapi/v3` — production URL TBD when owner shares.
