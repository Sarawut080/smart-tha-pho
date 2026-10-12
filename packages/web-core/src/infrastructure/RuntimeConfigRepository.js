// อ่าน config ของ repo ที่ deploy หน้าเว็บนี้เอง ไม่ผูกกับ owner ใด owner หนึ่ง
const githubRawConfigUrl = () => {
  const hostname = String(location.hostname || "").toLowerCase();
  if (!hostname.endsWith(".github.io")) return null;
  const owner = hostname.slice(0, -".github.io".length);
  const repository = String(import.meta.env.BASE_URL || "").split("/").filter(Boolean)[0];
  if (!owner || !repository) return null;
  return `https://raw.githubusercontent.com/${owner}/${repository}/main/runtime-config.json?t=${Date.now()}`;
};

const DEFAULT_CONFIG_SOURCES = Object.freeze([
  () => new URL(`runtime-config.json?t=${Date.now()}`, `${location.origin}${import.meta.env.BASE_URL}`).href,
  githubRawConfigUrl,
]);

const DEFAULT_BUILD_TIME_API_BASE = import.meta.env?.VITE_API_BASE_URL || "";
const DEFAULT_LOCATION = Object.freeze({ hostname: "localhost", origin: "http://localhost" });

export class RuntimeConfigRepository {
  constructor({
    fetchImplementation = globalThis.fetch,
    sources = DEFAULT_CONFIG_SOURCES,
    locationObject = globalThis.location || DEFAULT_LOCATION,
    buildTimeApiBase = DEFAULT_BUILD_TIME_API_BASE,
  } = {}) {
    this.fetchImplementation = fetchImplementation;
    this.sources = sources;
    this.locationObject = locationObject;
    this.buildTimeApiBase = buildTimeApiBase;
    this.pending = undefined;
  }

  normalizeApiBase(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return "";
      return `${url.href.replace(/\/$/, "").replace(/\/api$/, "")}/api`;
    } catch {
      return "";
    }
  }

  async getApiBase(forceRefresh = false) {
    const hostname = String(this.locationObject.hostname || "").toLowerCase();
    if (
      ["localhost", "127.0.0.1"].includes(hostname) ||
      hostname.endsWith(".ngrok-free.dev") || hostname.endsWith(".trycloudflare.com")
    ) return "/api";
    if (forceRefresh) this.pending = undefined;
    if (!this.pending) this.pending = this.#load();
    return this.pending;
  }

  async #load() {
    const bundledApiBase = this.normalizeApiBase(this.buildTimeApiBase);

    for (const source of this.sources) {
      try {
        const url = source();
        if (!url) continue;
        const response = await this.fetchImplementation(url, { cache: "no-store" });
        if (!response.ok) continue;
        const config = await response.json();
        const apiBase = this.normalizeApiBase(config.portalApiBaseUrl || config.apiBaseUrl);
        if (apiBase) return apiBase;
      } catch {
        // Continue with the next configured source.
      }
    }
    return bundledApiBase;
  }
}
