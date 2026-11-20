# Daymark for Schoology

A focused Chrome/Chromium Manifest V3 extension that reads coursework already rendered in a user's signed-in Schoology tab and sends normalized course/assignment data to Daymark after explicit sync. It does not modify Schoology pages or ask for Schoology credentials.

## Install for local development

1. From this directory, run `npm install` and `npm run build`.
2. In Chrome or Edge, open the Extensions page, enable Developer mode, and choose **Load unpacked**.
3. Select this directory's `dist/` folder.
4. Apply the SQL migrations through `0005_schoology_extension_device_flow.sql`, then open the extension and choose **Connect to Daymark**. It opens a Daymark tab for sign-in and approval; after approval, the extension pairs itself. The hosted Daymark address is prefilled. For local development or self-hosting, set a custom Daymark server under **Advanced connection settings**.
5. Open a signed-in Schoology home, courses, or course page. Choose **Scan page**, review the detected data, then choose **Sync to Daymark**.

After source changes, run `npm run build`; reload the unpacked extension from the browser extensions page. `npm test` builds and runs fixture tests. `npm run check` is the same combined verification command.

## Permissions

- `activeTab` and `scripting`: read the current page only after the user opens the popup and presses Scan.
- `storage`: keep the last scan, connection address, short-lived pairing state, and revocable Daymark extension token in extension-local storage.
- `alarms`: resume connection polling while the popup is closed.
- Optional host access: requested only for the exact Daymark origin selected by the user. It is used for pairing, status, revocation, and sync requests.

The extension does not read cookies, use the Schoology API, persist rendered page HTML, or send data before the user presses Sync. The temporary HTML snapshot is parsed in the popup and only normalized values are kept. Schoology page data is not sent to a third-party provider. Daymark sign-in stays in the normal Daymark browser page; the extension never asks for a Daymark password.

## Extraction and compatibility

The extractor uses rendered DOM patterns for course links/IDs and assignment cards, with common Schoology URL patterns including `/home`, `/courses`, `/course/{id}`, and `/assignment/{id}`. It accepts known Schoology hosts and an explicitly configured custom school host. IDs must come from a stable rendered data attribute or Schoology course/assignment URL; titles are never used as IDs. Date values are parsed to ISO timestamps, malformed dates stay `null`, duplicate external IDs within a course are collapsed, and submission state is reported only when page text or attributes clearly indicate it.

Schoology page markup varies by institution. A scan reports when the current page contains no identifiable records. When a visible next-page link exists, the extension tells the user to open that page and scan again; the extension does not silently crawl hidden pages or internal endpoints. A course listing page may expose multiple courses, while assignment extraction is strongest on a course materials/assignment page. Available dates and points are left unavailable unless reliably rendered. Deleted/archived assignment handling belongs to Daymark and is conservative.

The upstream [SchoologyPlus project](https://github.com/aopell/SchoologyPlus) was reviewed as an architectural reference. Its README describes a broad enhancement extension; its actual `src/scripts/content.ts` dispatches features by rendered route paths and then invokes page-specific modules. Daymark uses the same page-specific awareness only as a narrow extraction guide and does not copy its code or features.

## Sign-in, approval, and data contract

- The extension creates a short-lived device flow and keeps its polling secret and API token locally. Daymark stores only hashes.
- The browser opens `/extension/schoology?flow=…`; the user signs in through the existing Daymark login, then explicitly approves the extension for their account.
- The extension polls the flow in the background. On approval, it starts using the API token it generated locally; that token hash was associated with the authenticated Daymark user by the server. No user ID is accepted from the extension.
- Flow requests expire after ten minutes. The user can revoke the extension token from Daymark Settings.
- The legacy one-time code endpoints remain available for older extension builds during transition.
- `GET /api/schoology/extension/status` validates the connection when the popup opens.
- `DELETE /api/schoology/extension/disconnect` revokes the presented token.
- `POST /api/schoology/extension/sync` sends a `SchoologySnapshot`: source page URL, scan time, course records, normalized assignments, and extraction warnings.

Server-side approval establishes ownership, and the Daymark API validates authorization, schema, rate limits, and idempotent synchronization. A `401`/`403` on status or sync clears the local token and asks the user to connect again. Each assignment uses the Schoology external ID and course external ID, not its title.

## Troubleshooting and limits

- **Unsupported page:** navigate to the Schoology home, course list, or a specific course. For a custom school domain, add its hostname under connection settings.
- **No records detected:** confirm the page is signed in and fully loaded, then scan the course materials page. Layout variations may need a future adapter update.
- **More pages available:** open the next page shown by Schoology and scan it; each scan contributes only the currently rendered page.
- **Connection expired:** start again from the extension. Device flows expire after ten minutes.
- **Sync rejected:** confirm Daymark's origin and pair again if the token was revoked.

Automated fixture tests cover supported page detection, normalized dates, rendered course and assignment extraction, malformed fields, duplicate assignment IDs, and pagination warnings. No live authenticated Schoology account was available for compatibility verification; fixture results do not claim live support for every institution.
