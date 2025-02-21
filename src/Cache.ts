import { None, Some, type Maybe } from "shulk"

export class Cache {
  protected max: number
  protected storage: Record<string, { createdAt: Date; lifespan: number; content: any }> =
    {}

  constructor(config: { max: number }) {
    this.max = config.max
  }

  save(key: string, content: unknown, lifespan: number) {
    if (Object.keys(this.storage).length >= this.max) {
      const keys = Reflect.ownKeys(this.storage)

      // Deleting the oldest entry in the cache
      delete this.storage[keys[0] as string]
    }

    this.storage[key] = { createdAt: new Date(), lifespan, content }

    return this
  }

  retrieve(key: string): Maybe<any> {
    const item = this.storage[key]

    if (item) {
      const currentDate = new Date()

      const aliveFor = currentDate.getTime() - item.createdAt.getTime()

      const itemHasExceededItsLifespan = aliveFor > item.lifespan

      if (itemHasExceededItsLifespan) {
        delete this.storage[key]

        return None()
      } else {
        return Some(item.content)
      }
    } else {
      return None()
    }
  }
}
