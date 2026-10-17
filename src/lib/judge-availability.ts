// "Judge disabled" mode (JUDGE_ENABLED, src/server/env.ts): the API code and
// every user-facing sentence about it, shared by the server and the client.
// No server imports.

/** `code` of the 503 that Run / Submit / session start answer when the judge is off. */
export const JUDGE_DISABLED_CODE = "judge_disabled";

/** Error text of the Run / Submit 503. */
export const JUDGE_DISABLED_API_MESSAGE = "Code execution is not available on this deployment yet";

/** Error text of the session start 503. */
export const JUDGE_DISABLED_SESSION_MESSAGE =
  "Sessions can't start on this deployment yet: code execution isn't available, so no submission could be scored";

/** Problem page: tooltip of the disabled Run / Submit, shortcut announcement, console note. */
export const JUDGE_DISABLED_SHORT = "Code execution isn't available on this deployment yet.";
export const JUDGE_DISABLED_NOTE = `${JUDGE_DISABLED_SHORT} You can still read the problem and the guide.`;

/** Room session lobby. */
export const JUDGE_DISABLED_LOBBY_TITLE = "Sessions can't start here yet";
export const JUDGE_DISABLED_LOBBY_NOTE =
  "Code execution isn't available on this deployment yet, so no submission could be scored. You can still set up the lobby and invite people.";

export function isJudgeDisabledError(result: { status: number; code?: string }): boolean {
  return result.status === 503 && result.code === JUDGE_DISABLED_CODE;
}
