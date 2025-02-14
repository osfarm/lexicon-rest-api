import { Html } from "@elysiajs/html"
import { Layout } from "./Layout"
import { type HypermediaType } from "../Hypermedia"

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
  return `<!DOCTYPE html> <html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${props.documentation.info.title}</title>
        <meta
            name="description"
            content="${props.documentation.info.description}"
        />
        <meta
            name="og:description"
            content="${props.documentation.info.description}"
        />    
    
        <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui.css" >
        <style>
          .topbar {
            display: none;
          }
        </style>
    </head>
    <body>
        <script
      id="api-reference"
    >${JSON.stringify(props.documentation)}
    </script>
    <script src="${`https://cdn.jsdelivr.net/npm/@scalar/api-reference@${"latest"}/dist/browser/standalone.min.js`}" crossorigin></script>
    </body> </html>`
}
