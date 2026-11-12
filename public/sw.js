self.addEventListener("push", (event) => {
  let data = {
    title: "Daymark",
    body: "You have an update.",
    url: "/app?section=Notifications",
  };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/daymark-icon.svg",
      badge: "/daymark-icon.svg",
      data: { url: data.url },
      tag: data.tag || "daymark",
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(event.notification.data?.url || "/app");
            return client.focus();
          }
        }
        return clients.openWindow(event.notification.data?.url || "/app");
      }),
  );
});
