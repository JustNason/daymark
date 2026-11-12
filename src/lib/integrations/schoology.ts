import { createHmac, randomBytes } from "node:crypto";
const KEY = () => process.env.SCHOOLOGY_CONSUMER_KEY || "";
const SECRET = () => process.env.SCHOOLOGY_CONSUMER_SECRET || "";
const enc = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
export function signedRequest(
  method: string,
  url: string,
  token?: { key: string; secret: string },
  extras: Record<string, string> = {},
) {
  const parsed = new URL(url);
  const params: Record<string, string> = {
    oauth_consumer_key: KEY(),
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    oauth_token: token?.key || "",
    ...extras,
  };
  const all: { key: string; value: string }[] = [];
  parsed.searchParams.forEach((value, key) => all.push({ key, value }));
  Object.entries(params).forEach(([key, value]) => all.push({ key, value }));
  const normalized = all
    .sort(
      (a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value),
    )
    .map((p) => `${enc(p.key)}=${enc(p.value)}`)
    .join("&");
  const base = `${method.toUpperCase()}&${enc(`${parsed.origin}${parsed.pathname}`)}&${enc(normalized)}`;
  const signingKey = `${enc(SECRET())}&${enc(token?.secret || "")}`;
  params.oauth_signature = createHmac("sha1", signingKey)
    .update(base)
    .digest("base64");
  const header = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
    .join(", ");
  return {
    url: parsed.toString(),
    headers: {
      Authorization: `OAuth realm="Schoology API", ${header}`,
      Accept: "application/json",
    },
  };
}
export async function schoologyRequest<T>(
  method: string,
  path: string,
  token?: { key: string; secret: string },
  extras: Record<string, string> = {},
) {
  let target = path.startsWith("http")
    ? path
    : `https://api.schoology.com/v1${path}`;
  let request = signedRequest(method, target, token, extras);
  let response = await fetch(request.url, {
    method,
    headers: request.headers,
    redirect: "manual",
    cache: "no-store",
  });
  if (response.status === 303) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Schoology returned an incomplete redirect");
    const next = new URL(location, target);
    if (next.hostname !== "api.schoology.com")
      throw new Error("Schoology redirected outside its API host");
    target = next.toString();
    request = signedRequest(method, target, token, extras);
    response = await fetch(request.url, {
      method,
      headers: request.headers,
      redirect: "manual",
      cache: "no-store",
    });
  }
  if (response.status === 303)
    throw new Error(
      "Schoology redirected repeatedly; retry the request later.",
    );
  const body = await response.text();
  if (!response.ok)
    throw new Error(`Schoology API ${response.status}: ${body.slice(0, 300)}`);
  return (body ? JSON.parse(body) : {}) as T;
}
export async function requestToken(callback: string) {
  const request = signedRequest(
    "POST",
    "https://api.schoology.com/v1/oauth/request_token",
    undefined,
    { oauth_callback: callback },
  );
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    redirect: "manual",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Schoology request token failed (${response.status})`);
  const data = new URLSearchParams(await response.text());
  return {
    key: data.get("oauth_token") || "",
    secret: data.get("oauth_token_secret") || "",
  };
}
export async function accessToken(
  requestToken: { key: string; secret: string },
  verifier: string,
) {
  const request = signedRequest(
    "POST",
    "https://api.schoology.com/v1/oauth/access_token",
    requestToken,
    { oauth_verifier: verifier },
  );
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    redirect: "manual",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Schoology access token failed (${response.status})`);
  const data = new URLSearchParams(await response.text());
  return {
    key: data.get("oauth_token") || "",
    secret: data.get("oauth_token_secret") || "",
  };
}
