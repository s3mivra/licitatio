export interface IdempotencyRecord {
  orgId: string;
  key: string; // uuid from the client
  method: string;
  path: string;
  requestHash: string; // sha256 of the canonical JSON body
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date; // TTL 24 hours
}
