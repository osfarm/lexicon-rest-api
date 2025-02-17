import { $ } from "bun"

const path = "./package.json"

async function main() {
  await $`git checkout main`
  await $`git fetch`
  await $`git pull origin main`

  const file = Bun.file(path)
  const packageJson = await file.json()

  const currentVersion = packageJson.version

  process.stdout.write(`New version number: (current: ${currentVersion}) \n> `)

  for await (const line of console) {
    const newVersion = line

    console.log(`New version: ${newVersion}`)

    packageJson.version = newVersion

    await Bun.write(path, JSON.stringify(packageJson, undefined, 2))

    await $`git add package.json`
    await $`git commit -m "Changes current version from ${currentVersion} to ${newVersion} in package.json"`
    await $`git push origin main`
    await $`git tag -a v${newVersion} -m "Production version ${newVersion}"`
    await $`git push origin tag v${newVersion}`
    await $`git checkout origin main`

    return
  }
}

main()
