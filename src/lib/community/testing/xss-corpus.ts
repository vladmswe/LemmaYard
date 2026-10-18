// XSS corpus for user markdown (docs/specs/community.md AC-C-MD-1). Plain
// data: the unit test (tests/unit/community/markdown.test.ts) renders every
// payload with the server renderer and the client preview, and the e2e
// fixture page renders them in a browser under the real CSP. Every entry must
// render without any active content.

export type XssPayload = { name: string; md: string };

const deepQuote = Array.from({ length: 2000 }, () => ">").join(" ") + " deep";
const manyBrackets = "[".repeat(5000) + "x" + "]".repeat(10) + "(javascript:alert(1))";
const deepList = Array.from({ length: 300 }, (_, i) => `${"  ".repeat(i)}- level ${i}`).join("\n");
const deepEmphasis = "*".repeat(3000) + "x" + "*".repeat(3000);

export const XSS_CORPUS: XssPayload[] = [
  // --- script tags
  { name: "script plain", md: "<script>alert(1)</script>" },
  { name: "script mixed case", md: "<ScRiPt>alert(1)</sCrIpT>" },
  { name: "script nested", md: "<scr<script>ipt>alert(1)</scr</script>ipt>" },
  { name: "script split across lines", md: "<script\n>alert(1)</script\n>" },
  { name: "script src", md: '<script src="https://evil.example/x.js"></script>' },
  { name: "script inside paragraph", md: "hello <script>alert(document.cookie)</script> world" },
  { name: "script in blockquote", md: "> <script>alert(1)</script>" },
  { name: "script in list", md: "- <script>alert(1)</script>" },
  { name: "script in table", md: "| a |\n| - |\n| <script>alert(1)</script> |" },
  // --- event handlers on raw HTML
  { name: "img onerror", md: '<img src=x onerror="alert(1)">' },
  { name: "img onerror no quotes", md: "<img src=x onerror=alert(1)//>" },
  { name: "svg onload", md: "<svg onload=alert(1)>" },
  { name: "svg onload slash", md: "<svg/onload=alert(1)>" },
  { name: "body onload", md: "<body onload=alert(1)>" },
  { name: "details ontoggle", md: "<details open ontoggle=alert(1)>x</details>" },
  { name: "div onmouseover", md: '<div onmouseover="alert(1)">hover</div>' },
  { name: "a onclick", md: '<a href="#" onclick="alert(1)">x</a>' },
  { name: "input autofocus onfocus", md: "<input autofocus onfocus=alert(1)>" },
  { name: "marquee onstart", md: "<marquee onstart=alert(1)>x</marquee>" },
  { name: "video onerror", md: "<video><source onerror=alert(1)></video>" },
  { name: "audio src onerror", md: "<audio src=x onerror=alert(1)>" },
  { name: "select onfocus", md: "<select autofocus onfocus=alert(1)></select>" },
  { name: "textarea onfocus", md: "<textarea autofocus onfocus=alert(1)></textarea>" },
  // --- dangerous URL schemes in markdown links
  { name: "md link javascript", md: "[x](javascript:alert(1))" },
  { name: "md link JavaScript mixed case", md: "[x](JaVaScRiPt:alert(1))" },
  { name: "md link leading space", md: "[a]( javascript:alert(1))" },
  { name: "md link angle brackets", md: "[a](<javascript:alert(1)>)" },
  { name: "md link vbscript", md: "[x](vbscript:msgbox(1))" },
  { name: "md link data html", md: "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)" },
  { name: "md link data svg", md: "[x](data:image/svg+xml,<svg onload=alert(1)>)" },
  { name: "md link file", md: "[x](file:///etc/passwd)" },
  { name: "md link colon entity", md: "[a](javascript&colon;alert(1))" },
  { name: "md link tab entity", md: "[a](jav&#x09;ascript:alert(1))" },
  { name: "md link decimal entity", md: "[a](&#106;avascript:alert(1))" },
  { name: "md link hex entities", md: "[a](&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1))" },
  { name: "md link percent encoded", md: "[a](%6Aavascript:alert(1))" },
  { name: "md link tab inside scheme", md: "[a](java\tscript:alert(1))" },
  { name: "md link newline entity", md: "[a](java&#10;script:alert(1))" },
  { name: "md link null char", md: "[a](java\0script:alert(1))" },
  { name: "md link title injection", md: '[a](https://ok.example "x\\" onmouseover=\\"alert(1)")' },
  { name: "md link title quotes", md: "[a](https://ok.example 'x\" onclick=\"alert(1)')" },
  { name: "autolink javascript", md: "<javascript:alert(1)>" },
  { name: "autolink data", md: "<data:text/html,<script>alert(1)</script>>" },
  { name: "autolink vbscript", md: "<vbscript:msgbox(1)>" },
  { name: "reference link javascript", md: "[x][ref]\n\n[ref]: javascript:alert(1)" },
  { name: "reference link data", md: "[x][r]\n\n[r]: data:text/html,alert(1) \"t\"" },
  { name: "image javascript src", md: "![alt](javascript:alert(1))" },
  { name: "image data src", md: "![a](data:image/png;base64,AAAA)" },
  { name: "image normal", md: "![a cat](https://example.com/cat.png)" },
  { name: "image reference", md: "![x][i]\n\n[i]: javascript:alert(1)" },
  { name: "image onerror in alt", md: '![" onerror="alert(1)](https://example.com/x.png)' },
  { name: "link in image alt", md: "[![img](x.png)](javascript:alert(1))" },
  // --- off-site tricks
  { name: "protocol relative", md: "[a](//evil.com)" },
  { name: "protocol relative with path", md: "[a](//evil.com/x?y=1)" },
  { name: "backslash host", md: "[a](\\\\evil.com)" },
  { name: "slash backslash", md: "[a](/\\evil.com)" },
  { name: "html a target blank", md: '<a href="x" target=_blank>x</a>' },
  { name: "html a javascript", md: '<a href="javascript:alert(1)">a</a>' },
  // --- raw embeds
  { name: "svg with script", md: "<svg><script>alert(1)</script></svg>" },
  { name: "svg use href", md: '<svg><use href="data:image/svg+xml,<svg id=x onload=alert(1)>#x"/></svg>' },
  { name: "svg animate", md: '<svg><animate onbegin=alert(1) attributeName=x dur=1s>' },
  { name: "mathml href", md: '<math><mi xlink:href="javascript:alert(1)">x</mi></math>' },
  { name: "math maction", md: '<math><maction actiontype="statusline#http://x" xlink:href="javascript:alert(1)">x</maction></math>' },
  { name: "iframe", md: '<iframe src="https://evil.example"></iframe>' },
  { name: "iframe srcdoc", md: '<iframe srcdoc="<script>alert(1)</script>"></iframe>' },
  { name: "object data", md: '<object data="javascript:alert(1)"></object>' },
  { name: "embed src", md: '<embed src="javascript:alert(1)">' },
  { name: "style tag", md: "<style>body{background:url(javascript:alert(1))}</style>" },
  { name: "style attribute", md: '<p style="background:url(javascript:alert(1))">x</p>' },
  { name: "style expression", md: '<div style="width: expression(alert(1))">x</div>' },
  { name: "base href", md: '<base href="https://evil.example/">' },
  { name: "meta refresh", md: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">' },
  { name: "link stylesheet", md: '<link rel="stylesheet" href="https://evil.example/x.css">' },
  { name: "form action", md: '<form action="https://evil.example"><button>go</button></form>' },
  { name: "button formaction", md: '<button formaction="javascript:alert(1)">x</button>' },
  // --- DOM clobbering
  { name: "a id name", md: '<a id="x" name="y">clobber</a>' },
  { name: "form name", md: '<form name="getElementById"></form>' },
  { name: "img name", md: '<img name="cookie" src=x>' },
  { name: "heading id", md: '<h2 id="__proto__">x</h2>' },
  // --- mXSS
  { name: "noscript title mxss", md: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">' },
  { name: "math mglyph style mxss", md: "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>" },
  { name: "svg p style mxss", md: '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">' },
  { name: "template mxss", md: "<template><img src=x onerror=alert(1)></template>" },
  { name: "comment break", md: "<!--><img src=x onerror=alert(1)>-->" },
  { name: "html comment", md: "before <!-- <script>alert(1)</script> --> after" },
  { name: "cdata", md: "<![CDATA[<script>alert(1)</script>]]>" },
  { name: "xmp", md: "<xmp><img src=x onerror=alert(1)></xmp>" },
  { name: "listing plaintext", md: "<plaintext><img src=x onerror=alert(1)>" },
  // --- markdown features outside the subset
  { name: "footnotes", md: "text[^1]\n\n[^1]: <script>alert(1)</script> note" },
  { name: "task list", md: "- [ ] task one\n- [x] task two" },
  { name: "html entities in code fence", md: "```\n&lt;script&gt;alert(1)&lt;/script&gt; <img src=x onerror=alert(1)>\n```" },
  { name: "unknown fence with script", md: "```weird\n<script>alert(1)</script>\n```" },
  { name: "python fence with html", md: "```python\nprint('<script>alert(1)</script>')\n```" },
  { name: "fence language injection", md: '```js" onmouseover="alert(1)\nx\n```' },
  { name: "inline code with html", md: "`<img src=x onerror=alert(1)>`" },
  { name: "mention", md: "@jsun see `@notamention` and <a href=\"javascript:x\">@x</a>" },
  // --- giant inputs
  { name: "2000 nested blockquotes", md: deepQuote },
  { name: "5000 brackets", md: manyBrackets },
  { name: "300 nested lists", md: deepList },
  { name: "6000 emphasis markers", md: deepEmphasis },
];
