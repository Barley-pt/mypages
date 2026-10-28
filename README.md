# acp-24.com redesign: three directions

| Path | What it is |
|---|---|
| `index.html` | Chooser page with links to the three templates |
| `templates/a-revenue-engine/` | Direction A: dark, live CRM pipeline hero, MOS cost calculator |
| `templates/b-editorial/` | Direction B: light, kinetic type, horizontal service chapters |
| `templates/c-flow/` | Direction C: scroll-driven automation graph |
| `content/copy.md` | Shared copy deck. Items marked `CONFIRM` need a check before launch |
| `assets/` | Logo files and the shared form script (`lead-form.js`) |
| `server/server.js` | Static server + `POST /api/lead` that creates a Bitrix24 lead |

Each template is one HTML file with inline CSS and JS. Animation uses GSAP 3.12.5 + ScrollTrigger from cdnjs. There is no build step.

## Run locally

```bash
BITRIX_WEBHOOK_URL="https://acp.bitrix24.com/rest/<user-id>/<token>/" node server/server.js
```

Open http://localhost:8080. Node 18 or later is necessary. There are no npm dependencies.

## Contact form to Bitrix24

1. In Bitrix24, create an inbound webhook with the `crm` scope (Developer resources > Other > Inbound webhook).
2. Set `BITRIX_WEBHOOK_URL` on the server. Optional: `BITRIX_ASSIGNED_BY_ID` sets the user who receives new leads.
3. Each submission calls `crm.lead.add` with `SOURCE_ID=WEB`, name, company, email, phone, UTM tags and a comment with the country, interest, team size and message.

Keep the webhook on the server. Do not put it in browser code: it gives full CRM access.

The endpoint has a honeypot field, server-side validation and a limit of 5 submissions per IP every 10 minutes.

## Deploy on the ACP server

Run `server/server.js` with PM2 behind nginx, or serve the static files with nginx and proxy only `/api/lead` to Node:

```nginx
location /api/lead { proxy_pass http://127.0.0.1:8080; proxy_set_header X-Forwarded-For $remote_addr; }
```
