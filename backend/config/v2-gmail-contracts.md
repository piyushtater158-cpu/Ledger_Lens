# V2 Gmail Workflow Contracts (Frozen)

This file freezes the additive V2 contracts before implementation.
It is intentionally separate from active V1 workflow files.

## Workflow C: `POST /webhook/gmail-discover`

### Input
```json
{
  "googleAccessToken": "string (required)",
  "query": "string (optional)",
  "after": 1740787200,
  "before": 1743465600,
  "maxMessages": 200
}
```

### Output
```json
{
  "invoices": [
    {
      "id": "messageId:attachmentId",
      "messageId": "string",
      "attachmentId": "string",
      "mimeType": "application/pdf",
      "filename": "invoice.pdf",
      "sender": "billing@vendor.com",
      "subject": "Invoice #1001",
      "emailDate": "2025-03-12T09:14:00.000Z"
    }
  ],
  "truncated": false,
  "scanned": 47
}
```

### Rules
- `googleAccessToken`, `after`, and `before` are required.
- Query format is `has:attachment after:{after} before:{before} {query}`.
- Attachment filter allows only `application/pdf` and `image/*`.
- Deduplication key is `{messageId}:{attachmentId}`.
- `truncated` is true if `maxMessages` cap is reached.

## Workflow D: `POST /webhook/gmail-extract`

### Input
```json
{
  "googleAccessToken": "string (required)",
  "messageId": "string (required)",
  "attachmentId": "string (required)",
  "mimeType": "string (required)",
  "filename": "string (required)"
}
```

### Output
```json
{
  "payee": "Acme Corp",
  "accountNumber": "1234567890",
  "ifsc": "HDFC0001234",
  "amount": "12500.00",
  "confidence": 0.95,
  "status": "Done"
}
```

### Error output behavior
- Attachment fetch failure => status begins with `Error: attachment fetch failed`.
- Unsupported mime => status is `unsupported`.
- Empty model extraction => empty fields, `confidence: 0`, `status` remains parser-derived.

## Hard Node-Name Dependencies

Workflow D must preserve these exact node names:
- `Restore Row After Download` (required by `prepareOpenRouterPayload.js`)
- `OpenRouter Analyze Image` and `OpenRouter Analyze Document` (required by `parseRowResult.js`)

Workflow D reuses these scripts without modifying active V1 workflows:
- `backend/src/nodes/prepareOpenRouterPayload.js`
- `backend/src/nodes/parseRowResult.js`
