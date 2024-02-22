import {
  setNostrWasm,
  type EventTemplate,
  type Event,
  verifyEvent
} from 'nostr-tools/wasm'
import {AbstractSimplePool} from 'nostr-tools/abstract-pool'
import {initNostrWasm} from 'nostr-wasm'
import {readable} from 'svelte/store'

import DataLoader from 'dataloader'
import type {Filter} from 'nostr-tools'

export type Metadata = {
  pubkey: string
  name?: string
  display_name?: string
  nip05?: string
  nip05valid: boolean
  picture?: string
}

initNostrWasm().then(setNostrWasm)

const ms500 = new Promise(resolve => setTimeout(resolve, 500))

export const pool = new AbstractSimplePool({verifyEvent})
pool.trackRelays = true

const _relaysCache = new Map<
  string,
  Promise<{
    read: string[]
    write: string[]
  }>
>()

export const signer = {
  getPublicKey: async () => {
    await ms500
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubkey = await (window as any).nostr.getPublicKey()
    initializeAccount(pubkey)
    return pubkey
  },
  signEvent: async (event: EventTemplate): Promise<Event> => {
    await ms500
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const se: Event = await (window as any).nostr.signEvent(event)
    initializeAccount(se.pubkey)
    return se
  }
}

let initializeAccount: (pubkey: string) => Promise<void>
export const account = readable<Metadata | null>(null, set => {
  let isInitialized = false

  initializeAccount = async (pubkey: string) => {
    if (isInitialized) return
    isInitialized = true

    const account = await getMetadata(pubkey)

    localStorage.setItem('loggedin', JSON.stringify(account))
    set(account)
  }

  // try to load account from localStorage on startup
  const data = localStorage.getItem('loggedin')
  try {
    const account: Metadata = JSON.parse(data || '')
    set(account)
  } catch (err) {
    /***/
  }
})

export const profileRelays = [
  'wss://relay.nos.social',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
  'wss://relay.snort.social'
]

export const relayListRelays = [
  'wss://purplepag.es',
  'wss://nos.lol',
  'wss://relay.nos.social',
  'wss://relay.damus.io'
]

export const repositoryRelays = [
  'wss://relay.nostr.bg',
  'wss://nostr21.com',
  'wss://nostr.fmt.wiz.biz',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.damus.io'
]

export async function publish(
  unsignedEvent: EventTemplate,
  relay: string | string[]
): Promise<void> {
  const event = await signer.signEvent(unsignedEvent)
  if (Array.isArray(relay)) {
    relay.forEach(async url => {
      const r = await pool.ensureRelay(url)
      await r.publish(event)
    })
  } else {
    const r = await pool.ensureRelay(relay)
    await r.publish(event)
  }
}

const metadataLoader = new DataLoader<string, Metadata, string>(
  async keys =>
    new Promise(async resolve => {
      const results = new Array(keys.length)
      const filter: Filter = {kinds: [0], authors: keys.slice(0)}

      try {
        pool.subscribeManyEose(profileRelays, [filter], {
          onevent(evt) {
            for (let i = 0; i < keys.length; i++) {
              if (keys[i] === evt.pubkey) {
                results[i] = {
                  pubkey: evt.pubkey,
                  nip05valid: false,
                  groups: [],
                  writeRelays: [],
                  ...JSON.parse(evt!.content)
                }
              }
            }
          },
          onclose() {
            for (let i = 0; i < results.length; i++) {
              if (!results[i]) results[i] = {pubkey: keys[i], nip05valid: false}
            }
            resolve(results)
          }
        })
      } catch (err) {
        for (let i = 0; i < results.length; i++) {
          results[i] = err
        }
        resolve(results)
      }
    })
)

export async function getMetadata(pubkey: string): Promise<Metadata> {
  return await metadataLoader.load(pubkey)
}

export async function getWriteRelays(
  pubkey: string | undefined
): Promise<string[]> {
  if (!pubkey) return []
  return getRelays(pubkey).then(({write}) => write)
}

export async function getReadRelays(
  pubkey: string | undefined
): Promise<string[]> {
  if (!pubkey) return []
  return getRelays(pubkey).then(({read}) => read)
}

export async function getRelays(
  pubkey: string
): Promise<{read: string[]; write: string[]}> {
  const cached = _relaysCache.get(pubkey)
  if (cached) return cached

  const fetch = pool
    .get(relayListRelays, {
      kinds: [10002],
      authors: [pubkey]
    })
    .catch(() => null)
    .then((event: Event | null) => {
      if (!event) return {read: [], write: []}
      const read = []
      const write = []
      for (let i = 0; i < event.tags.length; i++) {
        const tag = event.tags[i]
        if (tag[0] === 'r') {
          switch (tag[2]) {
            case 'write':
              write.push(tag[1])
              break
            case 'read':
              read.push(tag[1])
              break
            case undefined:
              read.push(tag[1])
              write.push(tag[1])
              break
          }
        }
      }
      return {read, write}
    })
  _relaysCache.set(pubkey, fetch)
  return fetch
}
