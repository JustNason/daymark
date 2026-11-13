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
    let requestedUserId: string | null = null;
    const authSubscription = supabase?.auth.onAuthStateChange(
      (_event, session) => {
        const userId = session?.user.id;
        if (!userId) {
          requestedUserId = null;
          return;
        }
        if (requestedUserId === userId) return;
        requestedUserId = userId;

        // Defer Supabase queries until after its auth-state callback releases
        // the session lock.
        queueMicrotask(() => {
          void (async () => {
            try {
              const result = await supabase
                ?.from("user_preferences")
                .select("theme")
                .maybeSingle();
              if (active && requestedUserId === userId && result?.data?.theme)
                setTheme(result.data.theme);
            } catch {
              // Theme remains usable from next-themes if the preference query fails.
            }
          })();
        });
      },
    );
    const apply = (event: Event) => {
      const theme = (event as CustomEvent<string>).detail;
      if (theme) setTheme(theme);
    };
    window.addEventListener("daymark-theme", apply);
    return () => {
      active = false;
      authSubscription?.data.subscription.unsubscribe();
      window.removeEventListener("daymark-theme", apply);
    };
  }, [setTheme]);
  return null;
}
