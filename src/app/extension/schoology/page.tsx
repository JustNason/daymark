import { ExtensionAuthorizationClient } from "./authorization-client";

export default async function SchoologyExtensionAuthorizationPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string | string[] }>;
}) {
  const params = await searchParams;
  const flowId = typeof params.flow === "string" ? params.flow : "";
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(flowId))
    return (
      <main className="error-screen">
        <section className="setup-screen extension-authorize-card">
          <div className="eyebrow">SECURE EXTENSION CONNECTION</div>
          <h1>Invalid connection request</h1>
          <p>Start again from the Daymark for Schoology extension.</p>
        </section>
      </main>
    );
  return <ExtensionAuthorizationClient flowId={flowId} />;
}
