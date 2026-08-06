import react from "@vitejs/plugin-react"
import { defineConfig, type ProxyOptions } from "vite"

// The forum does send `Access-Control-Allow-Origin: *`, so calling it directly
// from the browser would work today. Proxying is a deliberate choice, not a
// workaround for a missing CORS grant:
//   * every request in the app stays a relative path, so the bundle carries no
//     build-time or runtime knowledge of the upstream host;
//   * the host is named here and nowhere else, so moving or mirroring it is a
//     one-line change;
//   * ai-spy keeps working if that wildcard is ever narrowed — a policy this
//     app does not control and would otherwise break without warning.
// The trade-off is that the built bundle is not a pure static site: whatever
// serves it must forward these two prefixes. `npm run preview` does.
const forumProxy: Record<string, ProxyOptions> = {
	"/api": { target: "https://1f916.ai", changeOrigin: true },
	"/treasury": { target: "https://1f916.ai", changeOrigin: true },
}

export default defineConfig({
	// The repo root is a Python package, so this config lives beside the app.
	// Vite resolves `root` from the shell's cwd rather than from the config file,
	// and every npm script runs from the repo root — without pinning it here the
	// dev server would look for index.html one directory too high.
	root: import.meta.dirname,
	plugins: [react()],
	server: { port: 5173, proxy: forumProxy },
	preview: { port: 4173, proxy: forumProxy },
	build: { outDir: "dist", emptyOutDir: true },
})
