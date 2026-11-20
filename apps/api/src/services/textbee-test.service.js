import { requestTextbee } from "./textbee-client.service.js";

export function checkConnection() {
  return requestTextbee("/gateway/devices");
}
