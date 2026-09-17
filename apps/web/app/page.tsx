type Event = {
  id: string;
  title: string;
};

async function getEvents(): Promise<Event[]> {
  const response = await fetch("http://localhost:4000/api/events", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch events");
  }

  const data: { events: Event[] } = await response.json();

  return data.events;
}

export default async function HomePage() {
  const events = await getEvents();

  return (
    <main>
      <h1>Events</h1>

      {events.length === 0 ? (
        <p>No events yet</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>{event.title}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
