/**
 * Which key name to print in a shortcut hint.
 *
 * Read once at module load: nobody changes platform mid-session, and this is
 * only ever used for labelling — `useKeyboard` accepts either modifier
 * everywhere, so guessing wrong would mislabel a shortcut, not break one.
 *
 * `userAgent` rather than the deprecated `navigator.platform`; Chrome's reduced
 * UA still carries "Macintosh".
 */
const IS_APPLE = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Shown inside the Open-folder buttons, matching `useKeyboard`'s chord. */
export const OPEN_FOLDER_HINT = IS_APPLE ? "⌘O" : "Ctrl+O";
