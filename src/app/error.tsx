"use client";

export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="error-screen">
      <div className="panel error-panel" role="alert">
        <div className="eyebrow">WORKSPACE ERROR</div>
        <h1>This view could not load.</h1>
        <p className="muted">Your saved work is unchanged. Try loading the view again.</p>
        <button className="button primary" onClick={() => retry()}>Try again</button>
      </div>
    </main>
  );
}
