export class ApiError extends Error {
  /** kind: 'invalid' | 'notFound' | 'expired' | 'network' | 'unknown' */
  constructor(kind, { status, detail } = {}) {
    super(detail || kind);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError('network');
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body: a proxy/server failure rather than an API answer.
    throw new ApiError(response.ok ? 'unknown' : response.status >= 500 ? 'network' : 'unknown', {
      status: response.status,
    });
  }

  if (response.ok) return { status: response.status, data: body };

  const detail = typeof body?.detail === 'string' ? body.detail : undefined;
  switch (response.status) {
    case 422:
      throw new ApiError('invalid', { status: 422, detail });
    case 404:
      throw new ApiError('notFound', { status: 404, detail });
    case 410:
      throw new ApiError('expired', { status: 410, detail });
    default:
      throw new ApiError('unknown', { status: response.status, detail });
  }
}

/** Resolves `{ status, data }` so 201 (new) and 200 (reused) are distinguishable. */
export function shortenUrl(url) {
  return request('/api/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export function getAnalytics(code) {
  return request(`/api/links/${encodeURIComponent(code)}/analytics`);
}
