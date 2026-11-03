# LaTeXML backend validation — 2026-11-02

## Result

The backend replacement is implemented, but **Ask to Evolve did not pass conversion**. This branch is not a release candidate. Do not treat the old custom-reader screenshots or mocked integration tests as proof of real LaTeXML support for that paper.

The currently installed Zotero plugin and existing reading attachments were not changed by this work. All real conversion experiments used separate temporary folders/containers, not the production library.

## Automated checks

- 24 automated tests pass, including engine-HTML packaging, image/table order, MathML retention, local asset embedding, script and remote-resource removal, unsafe-path rejection, immutable Docker arguments, diagnostic parsing, missing-class binding rejection, failure reports and preservation of an existing successful reader.
- The bundled production runtime is exercised against a mocked Zotero API and a real temporary filesystem. It verifies source saving before conversion, attachment updates, source queries, the conversion-report endpoint and clean shutdown. This is not an actual addon installation test.
- Bootstrap starts the runtime without requiring Docker at startup. A mock of Zotero's Subprocess API verifies direct executable/argument invocation and stdout reading. The API signatures were checked against the installed Zotero 10.0.7 modules; actual addon process invocation remains unverified.
- Build and JavaScript syntax checks pass. No new plugin was installed in the user's Zotero.

## Real engine control test

The standalone CLI uses the same `convertWithLatexml` module as the plugin. A gzip archive with a standard article, heading, inline equation and table completed conversion with the default fixed official image:

- Image: `latexml/ar5ivist@sha256:9a8d577d6df6cdf088f1764c38bddab54d7c21c857fef68ae46ea3ff9676d70e` (tag 2512.17).
- Exit: 0; conversion status: 0; no Error/Fatal diagnostics.
- Result: `ready_with_warnings`, with 2 Perl warning records about an unreferenced scalar. These are recorded rather than described as a warning-free run.
- Output: selectable article text, 1 HTML table, 1 MathML equation and 1 embedded engine-generated logo image.
- Opened in headless Microsoft Edge: table/text/MathML present, every image loaded, **zero remote HTTP requests**. The screenshot was visually inspected.

This is a control document, not the requested paper and not proof of general compatibility. It does not exercise source-PDF figure conversion.

## Ask to Evolve — real source

- Paper: _Ask to Evolve: A Unified Harness for Lifelong Embodied Navigation with Hybrid Action Space and Persistent Memory_.
- arXiv: `2610.39446v1`.
- Archive: 11,683,775 bytes, 43 extracted files, main entry `main.tex`.
- Source SHA-256: `b029b0474c25dcf72d73ba2096bb7e7229db253524acdf0356262469a94aa669`.
- The original paper archive is not committed or redistributed.

The final production-driver run used the default fixed image, original source and no paper-specific bindings. It returned **exit 139**, no complete HTML and `status: failed`. The log warned that there is no binding for `evolife_report`, fell back to OmniBus and stopped while loading PGF. An earlier original-source run also reported PGF math/group errors before abnormal exit. The final run's engine elapsed measurement was 131.2 seconds, including container startup.

A Docker exit code of 139 indicates abnormal process termination; the exact cause has not been isolated. The missing document-class binding is a separate observed compatibility problem, not a proven explanation of the native crash. A fatal crash may occur before LaTeXML emits a Fatal diagnostic, so an Error/Fatal count of zero must not be taken as successful conversion.

### Diagnostic comparisons

| Configuration                                                                              | Observed outcome                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Official ar5ivist 2512.17, original source                                                 | PGF-related errors or abnormal exit; no complete reader                                     |
| Official ar5ivist 2402.29, original source                                                 | Exit 139; no complete reader                                                                |
| Official image with fewer container restrictions                                           | Also exit 139; no complete reader                                                           |
| Upstream LaTeXML `0db6f47ea859391f9099e6e25e7405afad8467bf` overlaid in the official image | Did not complete conversion                                                                 |
| Experimental LaTeXML bindings for the custom class/tcolorbox/adjustbox                     | One run digested article content but failed during later processing; other runs also failed |
| Native two-step `latexml` front end with upstream code and experimental bindings           | Exit 139; no complete reader                                                                |

An additional runtime-library comparison built XML::LibXML 2.0213 from its official CPAN source (SHA-256 `2af21c5d61ac34ea26a5fabf15ba5a5841e648f7189db3e33b6f28b5489802ab`). Only its build configuration was adjusted to link the image’s existing libxml2 directly; it was not installed into the base image or host. Its own 2,644 tests passed, but the paper converter still exited 139. This did not resolve the engine crash and is not shipped.

The experimental bindings were exploratory semantic mappings using LaTeXML's package API. They are **not shipped**, are not a general solution, and have not been validated as faithful to this paper. No modified source or partial output is promoted as a successful reading copy.

## Reproduction

After building and preparing the fixed Docker image:

```sh
node scripts/convert.mjs /path/to/2610.39446v1-source.gz /path/to/ask-result "Ask to Evolve" 2610.39446v1
```

The command returns nonzero on failure and saves `report.json` plus the fresh job's original inputs and `console.log`. Successful runs additionally save a self-contained `reading.html`. The root CLI report identifies the job directory. To compare the old official image, use:

```sh
node scripts/convert.mjs SOURCE.gz OLD_RESULT --image=latexml/ar5ivist@sha256:3d29986eb8c6b63c993b287c7745c49a56019ab0f7bd305f5429471b7d84d8f9
```

No release was published and no main-branch update manifest was changed. Remaining work before release includes diagnosing the native engine failure, supporting/validating the paper's custom class and packages, inspecting a successful full-paper conversion (including all 14 figures and 7 tables), and verifying addon installation and Connector triggering in an isolated Zotero profile.
