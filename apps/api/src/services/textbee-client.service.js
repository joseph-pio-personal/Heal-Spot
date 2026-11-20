import { getTextbeeApiKey, TEXTBEE_BASE_URL } from "../config/textbee.js";

const REQUEST_TIMEOUT_MS = 10_000;

export class TextbeeError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = "TextbeeError";
    this.status = status;
  }
}

export async function requestTextbee(path, { method = "GET", body } = {}) {
  const apiKey = getTextbeeApiKey();
  let response;

  try {
    response = await fetch(`${TEXTBEE_BASE_URL}${path}`, {
      method,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TextbeeError("Could not reach Textbee API.", { cause: error });
  }

  let data;
  try {
    const responseText = await response.text();
    data = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    if (response.ok) {
      throw new TextbeeError("Textbee API returned an unreadable response.", {
        status: response.status,
        cause: error,
      });
    }
  }

  if (!response.ok) {
    throw new TextbeeError(`Textbee API rejected the request (HTTP ${response.status}).`, {
      status: response.status,
    });
  }
  if (data === null) {
    throw new TextbeeError("Textbee API returned an empty response.", { status: response.status });
  }

  return data;
}
