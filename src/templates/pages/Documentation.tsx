import { Html } from "@elysiajs/html"
import { type HypermediaType } from "../../Hypermedia"

interface Props {
  title: string
  breadcrumbs: HypermediaType["Link"][]
  documentation: {
    info: {
      title: string
      description: string
    }
  }
}

export function Documentation(props: Props) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/x-icon" href="/public/images/favicon.ico" />

        <title>{props.documentation.info.title}</title>
        <meta name="description" content={props.documentation.info.description} />
        <meta name="og:description" content={props.documentation.info.description} />
      </head>
      <body>
        <script id="api-reference">{JSON.stringify(props.documentation)}</script>
        <script
          src={`https://cdn.jsdelivr.net/npm/@scalar/api-reference@${"latest"}/dist/browser/standalone.min.js`}
          crossorigin="true"
        ></script>
      </body>
    </html>
  )
}
