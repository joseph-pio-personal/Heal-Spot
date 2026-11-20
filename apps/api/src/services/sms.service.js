import { getTextbeeDeviceId } from "../config/textbee.js";
import { requestTextbee } from "./textbee-client.service.js";

export function sendSMS(phone, message) {
  if (typeof phone !== "string" || !phone.trim()) {
    throw new TypeError("A recipient phone number is required.");
  }
  if (typeof message !== "string" || !message.trim()) {
    throw new TypeError("An SMS message is required.");
  }

  return requestTextbee("/gateway/send-sms", {
    method: "POST",
    body: {
      recipients: [phone],
      message,
      deviceId: getTextbeeDeviceId(),
    },
  });
}
