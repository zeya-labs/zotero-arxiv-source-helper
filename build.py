"""Build a reproducible XPI and matching update metadata (Python stdlib only)."""
from pathlib import Path, PurePosixPath
import base64
import hashlib
import io
import json
import os
import platform
import re
import shutil
import subprocess
import tarfile
import urllib.request
from urllib.parse import urlparse
import zipfile

ROOT = Path(__file__).resolve().parent
TOOLS = ROOT / ".tools"
REPOSITORY = "https://github.com/zeya-labs/zotero-arxiv-source-helper"


def package(name, version, folder):
    target = TOOLS / folder
    marker = target / ".ready"
    if marker.exists() and marker.read_text() == version:
        return target / "package"
    url = f'https://registry.npmjs.org/{name}/-/{name.split("/")[-1]}-{version}.tgz'
    with urllib.request.urlopen(
        f"https://registry.npmjs.org/{name}/{version}", timeout=30
    ) as response:
        metadata = json.load(response)
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read()
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(raw).digest()).decode()
    if integrity != metadata["dist"]["integrity"]:
        raise RuntimeError("Package integrity check failed: " + name)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        for member in archive:
            parts = PurePosixPath(member.name).parts
            if (not parts or ".." in parts or member.name.startswith("/")
                    or "\\" in member.name or ":" in member.name):
                raise ValueError("Unsafe package path")
            if member.isfile():
                output = target.joinpath(*parts)
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(archive.extractfile(member).read())
    marker.write_text(version)
    return target / "package"


def compiler_path():
    system = {"Windows": "win32", "Linux": "linux", "Darwin": "darwin"}.get(
        platform.system()
    )
    arch = {"AMD64": "x64", "x86_64": "x64", "arm64": "arm64",
            "aarch64": "arm64"}.get(platform.machine())
    if not system or not arch:
        raise RuntimeError("Unsupported build platform: " + platform.platform())
    folder = package(f"@esbuild/{system}-{arch}", "0.25.12", f"esbuild-{system}-{arch}")
    binary = folder / ("esbuild.exe" if system == "win32" else "bin/esbuild")
    if os.name != "nt":
        binary.chmod(0o755)
    return binary


def validate_manifest():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    application = manifest.get("applications", {}).get("zotero", {})
    missing = [field for field in
               ["id", "update_url", "strict_min_version", "strict_max_version"]
               if not application.get(field)]
    if missing:
        raise ValueError("Zotero manifest is missing required fields: " + ", ".join(missing))
    url = urlparse(application["update_url"])
    if url.scheme != "https" or not url.netloc:
        raise ValueError("Zotero update_url must be an absolute HTTPS URL")
    project = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if manifest["version"] != project["version"]:
        raise ValueError("manifest.json and package.json versions differ")
    return manifest


def main():
    manifest = validate_manifest()
    compiler = compiler_path()
    fflate = package("fflate", "0.8.2", "fflate")
    pdfjs = package("pdfjs-dist", "5.4.296", "pdfjs")
    katex = package("katex", "0.16.22", "katex")
    css = (katex / "dist/katex.min.css").read_text(encoding="utf-8")
    def embedded_font(match):
        font = katex / "dist" / match.group(1)
        data = base64.b64encode(font.read_bytes()).decode()
        return 'src:url(data:font/woff2;base64,' + data + ') format("woff2");'
    css = re.sub(r'src:url\(([^)]+\.woff2)\) format\("woff2"\)[^;]*;', embedded_font, css)
    if "url(fonts/" in css:
        raise ValueError("KaTeX stylesheet still references external fonts")
    generated = ROOT / "src/generated"
    generated.mkdir(exist_ok=True)
    (generated / "mathStyle.ts").write_text("export const mathCSS = " + json.dumps(css) + ";\n", encoding="utf-8")
    build = ROOT / "build"
    build.mkdir(exist_ok=True)
    alias = "--alias:fflate=" + str(fflate / "esm/browser.js")
    for entry, options in [
        ("src/core.ts", ["--platform=node", "--format=esm", "--outfile=build/core.mjs"]),
        ("src/runtime.ts", ["--platform=browser", "--format=iife",
                            "--global-name=ArxivSourceHelperRuntime", "--target=firefox115",
                            "--outfile=build/runtime.js"]),
    ]:
        subprocess.run([str(compiler), entry, "--bundle", alias, "--alias:katex=" + str(katex / "dist/katex.mjs"), *options], cwd=ROOT, check=True)
    shutil.copy2(build / "runtime.js", ROOT / "runtime.js")
    shutil.copy2(fflate / "LICENSE", ROOT / "FFLATE-LICENSE")
    shutil.copy2(pdfjs / "LICENSE", ROOT / "PDFJS-LICENSE")
    shutil.copy2(katex / "LICENSE", ROOT / "KATEX-LICENSE")
    subprocess.run([str(compiler),'src/pdfPreview.ts','--bundle','--platform=browser','--format=iife','--global-name=ASHPDFPreview','--target=firefox140','--external:node:*','--log-override:empty-import-meta=silent','--alias:pdfjs-dist='+str(pdfjs),'--outfile=build/pdf-preview.js'],cwd=ROOT,check=True)
    shutil.copy2(build/'pdf-preview.js',ROOT/'pdf-preview.js')
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    version = manifest["version"]
    xpi = dist / f"arxiv-source-helper-{version}.xpi"
    names = ["manifest.json", "bootstrap.js", "runtime.js", "LICENSE",
             "FFLATE-LICENSE", "PDFJS-LICENSE", "KATEX-LICENSE", "pdf-preview.js", "THIRD_PARTY.md"]
    with zipfile.ZipFile(xpi, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in names:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, (ROOT / name).read_bytes())
    digest = hashlib.sha256(xpi.read_bytes()).hexdigest()
    (dist / "SHA256SUMS.txt").write_text(f"{digest}  {xpi.name}\n", encoding="utf-8")
    app = manifest["applications"]["zotero"]
    updates = {"addons": {app["id"]: {"updates": [{
        "version": version,
        "update_link": f"{REPOSITORY}/releases/download/v{version}/{xpi.name}",
        "update_hash": "sha256:" + digest,
        "applications": {"zotero": {
            "strict_min_version": app["strict_min_version"],
            "strict_max_version": app["strict_max_version"],
        }},
    }]}}}
    (ROOT / "updates.json").write_text(json.dumps(updates, indent=2) + "\n", encoding="utf-8")
    with zipfile.ZipFile(xpi) as archive:
        assert archive.testzip() is None
        assert all(name in archive.namelist() for name in names)
    print(xpi)
    print("SHA-256: " + digest)


if __name__ == "__main__":
    main()
