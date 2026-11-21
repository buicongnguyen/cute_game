/**
 * Settings rows that come from the feature modules (AAA-PLAN WP9), so a feature adds a row without an edit of main.ts.
 * A feature registers a row in its mount(); main.ts settings() asks for each section's rows where they belong.
 * `render` returns the row's markup in English (the dialog localizes it); `bind` gets the page each time the row has
 * been put on it (undefined where there is no page), to find its own elements and listen. Rows keep the order they were added in.
 */
type SettingsSection = 'audio' | 'comfort';
type Bind = (root: ParentNode | undefined) => void;
const rows: [SettingsSection, () => string, Bind?][] = [];
export function addSettingsRow(section: SettingsSection, render: () => string, bind?: Bind) { rows.push([section, render, bind]); }
export function settingsExtrasHtml(section: SettingsSection) {
  const mine = rows.filter(row => row[0] === section);
  // Bound once the dialog holds the markup (the caller puts it on the page in this same task).
  if (mine.length) queueMicrotask(() => mine.forEach(row => row[2]?.(globalThis.document)));
  return mine.map(row => row[1]()).join('');
}
