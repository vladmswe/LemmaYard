import { loadCodeBundle } from "@/server/guide/code";

import { CodeTabsClient } from "./CodeTabsClient";

/** `<CodeTabs code="heaps/min_heap" />`: the highlighted Python and JavaScript listings. */
export async function CodeTabs({ code, title }: { code: string; title?: string }) {
  const bundle = await loadCodeBundle(code);
  return (
    <CodeTabsClient
      refId={code}
      title={title}
      python={{ html: bundle.python.html, source: bundle.python.source }}
      javascript={{ html: bundle.javascript.html, source: bundle.javascript.source }}
    />
  );
}
