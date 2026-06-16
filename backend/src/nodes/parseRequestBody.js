/**
 * Node: "Parse Request Body"
 * Workflow: B (Invoice Extract Row — LmdFhorOYBoJgXGl)
 * Mode: runOnceForEachItem
 *
 * Purpose: Validates the incoming JSON body `{ driveLink, googleAccessToken }`, extracts
 * the Drive file ID, and surfaces all three as flat fields for downstream nodes.
 * Throws on missing or unparseable inputs so the webhook returns a clean 500 error
 * rather than a silent downstream failure.
 */

const body = $json.body || $json;
const driveLink = body.driveLink || '';
const token = body.googleAccessToken || '';
if (!driveLink) throw new Error('driveLink is required');
if (!token) throw new Error('googleAccessToken is required');
const m1 = driveLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
const m2 = driveLink.match(/[?&]id=([a-zA-Z0-9_-]+)/);
const fileId = (m1 && m1[1]) || (m2 && m2[1]) || '';
if (!fileId) throw new Error('Could not parse Drive file ID from: ' + driveLink);
return { json: { driveLink, token, fileId } };
