/**
 * Mask an IP address for safe display/logging.
 * IPv4: 192.168.1.42  → 192.168.1.***
 * IPv6: 2001:41d0:801:2000::502c → 2001:41d0:***
 */
export function maskIp(ip: string | undefined): string {
  if (!ip) return "—";
  // IPv6 (contains colon)
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length >= 3) {
      return parts.slice(0, 2).join(":") + ":***";
    }
    return "***";
  }
  // IPv4
  return ip.replace(/\.\d+$/, ".***");
}
