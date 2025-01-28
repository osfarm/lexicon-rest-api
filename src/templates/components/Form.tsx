import { match, union, type InferUnion } from "shulk"
import { Html } from "@elysiajs/html"
import { Cell, Grid } from "./Grid"

export const Field = union<{
  Text: {
    label: string
    defaultValue?: string
    required: boolean
  }
  DateTime: {
    label: string
    defaultValue?: string
    required: boolean
  }
  Select: {
    label: string
    options: Record<string, string>
    defaultValue?: string
    required: boolean
  }
}>()

export type FieldType = InferUnion<typeof Field>

interface Props {
  method: "GET"
  definition: Record<string, FieldType["any"]>
}
export function Form(props: Props) {
  const { method, definition } = props

  return (
    <form method={method}>
      <Grid>
        {Object.entries(definition).map(([name, field]) => (
          <Cell width={5}>
            {match(field).case({
              Text: (field) => (
                <div class="field">
                  <label for={name}>{field.label}</label>
                  <br />
                  <input
                    type="text"
                    autocomplete="off"
                    name={name}
                    id={name}
                    required={field.required}
                    placeholder={field.label}
                    value={field.defaultValue || ""}
                  ></input>
                </div>
              ),
              DateTime: (field) => (
                <div class="field">
                  <label for={name}>{field.label}</label>
                  <br />
                  <input
                    type="datetime-local"
                    name={name}
                    id={name}
                    required={field.required}
                    placeholder={field.label}
                    value={field.defaultValue || ""}
                  ></input>
                </div>
              ),
              Select: (field) => (
                <div class="field">
                  <label for={name}>{field.label}</label>
                  <br />
                  <select name={name} id={name} required={field.required}>
                    <option value="">{"---"}</option>
                    {Object.entries(field.options).map(([key, txt]) => (
                      <option value={key} selected={field.defaultValue === key}>
                        {txt}
                      </option>
                    ))}
                  </select>
                </div>
              ),
            })}
          </Cell>
        ))}

        <Cell width={2}>
          <button
            type="submit"
            class="success button"
            style={{ height: "54px", width: "100%", fontWeight: "bold" }}
          >
            Filtrer
          </button>
        </Cell>
      </Grid>

      {/* 
	<script>
		document.querySelectorAll('.field').forEach((el) => {
			el.addEventListener('click', () => el.querySelector('input')?.focus())
		})
	</script> */}
    </form>
  )
}
