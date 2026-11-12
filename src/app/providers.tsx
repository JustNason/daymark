"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <PersistedTheme />
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
function PersistedTheme() {
  const { setTheme } = useTheme();
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase?.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const result = await supabase
        .from("user_preferences")
        .select("theme")
        .maybeSingle();
      if (active && result.data?.theme) setTheme(result.data.theme);
    });
    const apply = (event: Event) => {
      const theme = (event as CustomEvent<string>).detail;
      if (theme) setTheme(theme);
    };
    window.addEventListener("daymark-theme", apply);
    return () => {
      active = false;
      window.removeEventListener("daymark-theme", apply);
    };
  }, [setTheme]);
  return null;
}
