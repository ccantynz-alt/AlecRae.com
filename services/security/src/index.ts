/**
 * @emailed/security — Security Service
 *
 * Provides virus scanning for email attachments via VirusTotal API.
 */

export {
  scanAttachment,
  isSafe,
  type ScanResult,
  type VirusScanStatus,
  type VirusScanResult,
} from "./virus-scanner.js";
