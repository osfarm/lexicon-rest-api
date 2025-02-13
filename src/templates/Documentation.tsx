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
  return (
    // <Layout
    //   breadcrumbs={props.breadcrumbs}
    //   title={props.title}
    // >
    <>
      {`<!DOCTYPE html> <html lang="en">
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
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@3.23.4/swagger-ui-bundle.js" crossorigin></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/3.19.5/swagger-ui-standalone-preset.js"> </script>
        <script>
            window.onload = () => {
            console.log(${JSON.stringify(props.documentation)})
                const ui = SwaggerUIBundle({
                dom_id: '#swagger-ui',
              deepLinking: true,
              presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIStandalonePreset
              ],
              plugins: [
                SwaggerUIBundle.plugins.DownloadUrl
              ],
              layout: "StandaloneLayout",
                spec: ${JSON.stringify(props.documentation)}});
    
                window.ui = ui
            };
        </script>
    </body> </html>`}
      {/*</Layout> */}
    </>
  )
}
