import packageJson from "../../package.json"

// Static files are cached for a day by browsers: their address changes with
// each start of the server, so that a new version is seen at once
const STAMP = `${packageJson.version}-${Date.now().toString(36)}`

export const asset = (path: string) => `/public/${path}?v=${STAMP}`
