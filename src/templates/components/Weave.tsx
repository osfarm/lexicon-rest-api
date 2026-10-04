import { Html } from "@elysiajs/html"
import {
  DATASETS,
  FAMILIES,
  KEYS,
  roundedCount,
  threadOf,
  type Family,
  type Figures,
  type Text,
} from "../../home/Weave"
import type { Translator } from "../../Translator"

type Props = {
  t: Translator
  figures: Map<string, Figures>
}

// The families in the order of the columns, with how many columns each spans
const familyRuns = DATASETS.reduce<{ family: Family; span: number }[]>(
  (runs, dataset) => {
    const last = runs[runs.length - 1]

    return last !== undefined && last.family === dataset.family
      ? [...runs.slice(0, -1), { family: last.family, span: last.span + 1 }]
      : [...runs, { family: dataset.family, span: 1 }]
  },
  [],
)

/**
 * The datasets as columns, the keys they share as threads: a table, so that it
 * reads without styles nor scripts, and by a screen reader.
 */
export function Weave(props: Props) {
  const { t, figures } = props
  const language = t.language === "en" ? "en" : "fr"
  const say = (text: Text) => text[language]

  return (
    <section class="weave" id="weave">
      <div class="weave-scroll">
        <table>
          <caption class="visually-hidden">{t("home_weave_caption")}</caption>
          <colgroup>
            <col class="key-column" />
            {DATASETS.map(() => (
              <col />
            ))}
          </colgroup>
          <thead>
            <tr>
              <td></td>
              {familyRuns.map((run) => (
                <th
                  class={`family family-${run.family}`}
                  colspan={run.span}
                  scope="colgroup"
                >
                  <span>{say(FAMILIES[run.family])}</span>
                </th>
              ))}
            </tr>
            <tr>
              <td></td>
              {DATASETS.map((dataset) => {
                const figure = figures.get(dataset.name)

                return (
                  <th scope="col" class="dataset" data-dataset={dataset.name}>
                    <a href={dataset.href}>
                      <span class="name">{say(dataset.label)}</span>
                      <span class="source">{dataset.source}</span>
                      {figure ? (
                        <span class="rows">
                          {roundedCount(figure.rows, language)} {t("home_weave_rows")}
                        </span>
                      ) : (
                        ""
                      )}
                      {figure?.reserved ? (
                        <span class="rows">{t("home_weave_members")}</span>
                      ) : (
                        ""
                      )}
                    </a>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {KEYS.map((key, row) => {
              const { first, last } = threadOf(key)

              return (
                <tr
                  data-key={key.id}
                  data-datasets={key.carriedBy.join(" ")}
                  data-definition={Html.escapeHtml(say(key.definition))}
                  style={`--row: ${row}`}
                >
                  <th scope="row" class="key">
                    <button type="button" aria-pressed="false">
                      {say(key.label)}
                    </button>
                  </th>
                  {DATASETS.map((dataset, index) => {
                    const classes = [
                      index >= first && index <= last ? "thread" : "",
                      index === first ? "first" : "",
                      index === last ? "last" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")

                    return (
                      <td class={classes} data-dataset={dataset.name}>
                        {key.carriedBy.includes(dataset.name) ? (
                          <span class={`knot family-${dataset.family}`}>
                            <span class="visually-hidden">
                              {say(dataset.label)} : {say(key.label)}
                            </span>
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p
        class="weave-caption"
        id="weave-caption"
        aria-live="polite"
        data-default={Html.escapeHtml(t("home_weave_hint"))}
      >
        {t("home_weave_hint")}
      </p>

      <ul class="weave-list">
        {KEYS.map((key) => (
          <li>
            <b>{say(key.label)}</b>
            <p>{say(key.definition)}</p>
            <div class="chips">
              {DATASETS.filter((dataset) => key.carriedBy.includes(dataset.name)).map(
                (dataset) => (
                  <a class={`chip family-${dataset.family}`} href={dataset.href}>
                    {say(dataset.label)}
                  </a>
                ),
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
