export function resendEmailPayload(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  return {
    from: input.from.trim(),
    to: [input.to.trim()],
    subject: input.subject.trim().slice(0, 300),
    text: input.text,
  };
}

export function mapEmailFailure(status: number) {
  const permanent = [400, 401, 403, 404, 422].includes(status);
  const message =
    status === 401 || status === 403
      ? "Email provider credentials were rejected"
      : status === 400 || status === 422
        ? "Email provider rejected the message payload"
        : status === 429
          ? "Email provider rate limit was reached"
          : `Email provider request failed (${status})`;
  return { message, permanent };
}
