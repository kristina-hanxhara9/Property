export async function streamPostSSE(url, body, handlers, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body || {}),
    signal,
  });

  if (!res.ok) {
    let errBody = '';
    try {
      errBody = await res.text();
    } catch {
      // ignore
    }
    throw new Error(`Server returned ${res.status}: ${errBody.slice(0, 300)}`);
  }
  if (!res.body) {
    throw new Error('No response body received from server.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      const parsed = parseEvent(rawEvent);
      if (parsed) {
        const handler = handlers[parsed.event] || handlers.default;
        if (handler) {
          try {
            handler(parsed.data, parsed.event);
          } catch (err) {
            console.error('SSE handler error', err);
          }
        }
      }
    }
  }
}

function parseEvent(raw) {
  const lines = raw.split('\n');
  let event = 'message';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data };
  }
}
