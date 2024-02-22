<script lang="ts">
  import {onMount} from 'svelte'

  import UserLabel from './components/UserLabel.svelte'
  import {account, signer, pool, getWriteRelays} from './lib/nostr'
  import type {NostrEvent} from 'nostr-tools'

  const CONTACT_RELAYS = [
    'wss://relay.damus.io',
    'wss://hist.nostr.land',
    'wss://relay.nostr.band',
    'wss://nostr-pub.wellorder.net',
    'wss://nos.lol',
    'wss://relay.nos.social',
    'wss://purplepag.es',
    'wss://relay.snort.social',
    'wss://offchain.pub'
  ]
  const DAY = 60 * 60 * 24
  const formatter = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'})

  type Epoch = {epoch: number; keys: string[]}
  type ActionableEpoch = {
    epoch: number
    keys: {pubkey: string; selected: boolean}[]
  }

  let epochs: Epoch[] = []
  let latest: NostrEvent
  let actionable: ActionableEpoch[] = []
  let message: string | undefined

  $: allSelected = actionable
    .map(({keys}) =>
      keys.filter(({selected}) => selected).map(({pubkey}) => pubkey)
    )
    .flat()

  onMount(() => {
    signer.getPublicKey().then(async pubkey => {
      let relays = await getWriteRelays(pubkey)

      pool.subscribeManyEose(
        [...CONTACT_RELAYS, ...relays],
        [{kinds: [3], authors: [pubkey]}],
        {
          onevent(evt) {
            let curr = epochs.find(
              ({epoch}) =>
                epoch > evt.created_at - DAY && epoch < evt.created_at + DAY
            )
            if (!curr) {
              curr = {epoch: evt.created_at, keys: []}
              epochs.push(curr)
            }

            for (let i = 0; i < evt.tags.length; i++) {
              let [name, pubkey] = evt.tags[i]
              if (name === 'p' && pubkey) {
                curr.keys.push(pubkey)
              }
            }

            if (!latest || latest.created_at < evt.created_at) latest = evt
          },
          onclose() {
            let visited: string[] = []
            epochs.sort((a, b) => b.epoch - a.epoch)
            actionable = epochs
              .map(epoch => ({
                epoch: epoch.epoch,
                keys: epoch.keys
                  .filter(pubkey => {
                    if (visited.includes(pubkey)) return false
                    visited.push(pubkey)
                    return true
                  })
                  .map(pubkey => ({pubkey, selected: false}))
              }))
              .filter(({keys}) => keys.length > 0)
              .slice(1)
          }
        }
      )
    })
  })

  async function handleFollow(_: MouseEvent) {
    let {content, kind, tags} = latest
    for (let i = 0; i < actionable.length; i++) {
      let epoch = actionable[i]
      for (let j = 0; j < epoch.keys.length; j++) {
        let {pubkey, selected} = epoch.keys[j]
        if (selected) {
          if (!tags.some(([name, key]) => name === 'p' && key === pubkey)) {
            tags.push(['p', pubkey])
          }
        }
      }
    }

    let relays = await getWriteRelays($account?.pubkey)

    try {
      const event = await signer.signEvent({
        content,
        kind,
        tags,
        created_at: Math.round(Date.now() / 1000)
      })
      await Promise.any(pool.publish([...CONTACT_RELAYS, ...relays], event))
      message = 'published'
    } catch (err: any) {
      message = err?.message || err ? String(err) : 'ERROR'
    }
  }

  function formatDate(ts: number) {
    let d = new Date(ts * 1000)
    d.setHours(0)
    d.setMinutes(0)
    d.setSeconds(0)
    return formatter.format(d)
  }
</script>

{#if message}
  <div
    class="m-auto text-center max-w-prose h-screen flex items-center justify-center text-7xl break-words"
  >
    {message}
  </div>
{:else}
  <div class="flex flex-col md:flex-row max-w-7xl m-auto">
    <div class="w-full md:w-40 md:mr-8">
      <div class="mb-2 md:mb-8 text-center md:text-left text-3xl font-bold">
        recover your contacts
      </div>
      <div class="hidden md:block">
        {#if $account}
          <UserLabel pubkey={$account.pubkey} />
        {/if}
      </div>
      <div class="hidden md:block mt-6 text-xl font-bold">
        these are people you have stopped following recently, perhaps
        unwillingly
      </div>
    </div>
    <div class="md:mt-6 w-full">
      <div class="mb-2 md:mb-6">
        {#if latest}
          <button
            class="px-4 py-2 bg-cyan-500 rounded cursor-pointer hover:bg-cyan-600 text-2xl font-bold"
            class:invisible={allSelected.length === 0}
            on:click={handleFollow}
          >
            follow {allSelected.length} back
          </button>
        {/if}
      </div>
      {#each actionable as epoch}
        <div class="border-b py-6">
          <div class="flex justify-between">
            <div>
              <button
                class="px-2 py-1 cursor-pointer border border-stone-400 hover:bg-stone-300 rounded"
                on:click={() => {
                  let toggle = epoch.keys.every(({selected}) => selected)
                    ? false
                    : true
                  epoch.keys.forEach(e => {
                    e.selected = toggle
                  })
                  epoch.keys = epoch.keys
                }}
              >
                {#if epoch.keys.every(({selected}) => selected)}
                  select none
                {:else}
                  select all
                {/if}
              </button>
            </div>
            <div class="text-right pb-4">
              people you were following up to <b class="font-bold"
                >{formatDate(epoch.epoch)}</b
              ><span class="hidden md:inline">&nbsp;but not anymore</span>
            </div>
          </div>
          <div class="flex flex-wrap">
            {#each epoch.keys as e}
              <div
                class="ml-2 mt-1 group flex items-center rounded"
                class:border={e.selected}
                class:bg-stone-400={e.selected}
                class:px-2={e.selected}
                class:py-1={e.selected}
              >
                <input
                  type="checkbox"
                  class="mr-1 group-hover:block w-6 h-6 text-4xl"
                  class:hidden={!e.selected}
                  bind:checked={e.selected}
                />
                <UserLabel pubkey={e.pubkey} />
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}
