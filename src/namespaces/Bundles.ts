import { normalize, resolve, sep } from "node:path"
import { API } from "../API"
import { givesScope } from "../access/Scope"
import type { Context } from "../types/Context"

const BUNDLES_ROOT = import.meta.env.BUNDLES_ROOT ?? "./bundles"

const FLAVOR = /^[a-z0-9][a-z0-9-]*$/

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  sql: "text/plain; charset=utf-8",
  gz: "application/gzip",
}

function refusal(status: number, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: { status, message } }, { status, headers })
}

/**
 * The file a request designates inside a bundle, or undefined when the path
 * tries to leave the directory of the bundle.
 */
export function fileOfBundle(
  root: string,
  flavor: string,
  path: string,
): string | undefined {
  if (!FLAVOR.test(flavor)) {
    return undefined
  }

  const directory = resolve(root, flavor)
  const file = resolve(directory, normalize(path))

  return file.startsWith(directory + sep) ? file : undefined
}

/**
 * Hands out the files of a private bundle to the keys carrying its scope.
 * A bundle is a repository of packages: its index, then each package.
 */
async function download(cxt: Context) {
  const flavor = cxt.params.flavor
  const prefix = `/bundles/${flavor}/`
  const path = decodeURIComponent(new URL(cxt.request.url).pathname.slice(prefix.length))

  if (cxt.identity.kind === "anonymous") {
    return refusal(401, "This bundle needs an API key", {
      "WWW-Authenticate": 'Bearer realm="lexicon"',
    })
  }
  if (!givesScope(cxt.identity.scopes, `bundle:${flavor}`)) {
    return refusal(403, "This API key does not give access to this bundle")
  }

  const location = fileOfBundle(BUNDLES_ROOT, flavor, path)
  const file = location === undefined ? undefined : Bun.file(location)

  if (file === undefined || !(await file.exists())) {
    return refusal(404, "No such file in this bundle")
  }

  return new Response(file, {
    headers: {
      "Content-Type":
        CONTENT_TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  })
}

export const Bundles = API.new().path("/bundles/:flavor/*", download)
