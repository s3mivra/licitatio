export interface SentMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const sentMail: SentMail[] = [];
export const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
export const mailControl = { failFor: new Set<string>() };
export const sentSms: Array<{ to: string; text: string }> = [];
