/**
 * Sequence diagrams are intentionally deferred to a future plugin.
 *
 * The original implementation depends on a UMD Snap.svg bundle that Rollup
 * cannot import as an ES module. Keep a graceful stub so normal Markdown
 * editing does not pull the legacy renderer into the main bundle.
 */
export default class SequenceDiagram {
  constructor() {
    console.warn('[libs-muya] sequence diagram renderer is not bundled yet');
  }

  render() {
    return '';
  }
}
