<script lang="ts">
  import {onMount} from 'svelte'

  import UserLabel from './components/UserLabel.svelte'
  import {account, signer, pool, getWriteRelays} from './lib/nostr'

  const DAY = 60 * 60 * 24
  const formatter = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'})

  type Epoch = {epoch: number; keys: string[]}

  let epochs: Epoch[] = []

  onMount(() => {
    signer.getPublicKey().then(async pubkey => {
      let relays = await getWriteRelays(pubkey)

      pool.subscribeManyEose(
        [
          'wss://relay.damus.io',
          'wss://hist.nostr.land',
          'wss://relay.nostr.band',
          'wss://nostr-pub.wellorder.net',
          'wss://nos.lol',
          'wss://relay.nos.social',
          'wss://purplepag.es',
          'wss://relay.snort.social',
          'wss://offchain.pub',
          ...relays
        ],
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
          },
          onclose() {
            let visited: string[] = []
            epochs.sort((a, b) => b.epoch - a.epoch)
            epochs = epochs
              .map(epoch => {
                epoch.keys = epoch.keys.filter(pubkey => {
                  if (
                    pubkey ===
                    'd1d1747115d16751a97c239f46ec1703292c3b7e9988b9ebdd4ec4705b15ed44'
                  ) {
                    console.log('visiting', visited.includes(pubkey))
                  }

                  if (visited.includes(pubkey)) return false
                  visited.push(pubkey)
                  if (
                    pubkey ===
                    'd1d1747115d16751a97c239f46ec1703292c3b7e9988b9ebdd4ec4705b15ed44'
                  ) {
                    console.log('pushing', pubkey)
                  }
                  return true
                })
                return epoch
              })
              .filter(({keys}) => keys.length > 0)
              .slice(1)
          }
        }
      )
    })
  })

  function formatDate(ts: number) {
    let d = new Date(ts * 1000)
    d.setHours(0)
    d.setMinutes(0)
    d.setSeconds(0)
    return formatter.format(d)
  }
</script>

<div class="flex">
  <div class="w-40 mr-8">
    <div class="mb-6">
      <a href="/" class="text-3xl mb-2 font-bold hover:underline"
        >recover your contacts</a
      >
    </div>
    <div>
      {#if $account}
        <UserLabel pubkey={$account.pubkey} />
      {/if}
    </div>
  </div>
  <div class="mt-6">
    {#each epochs as epoch}
      <div class="border-b py-6">
        <div class="text-right pb-4">
          people you were following up to <b class="font-bold"
            >{formatDate(epoch.epoch)}</b
          > but are not anymore
        </div>
        <div class="flex flex-wrap">
          {#each epoch.keys as pubkey}
            <div class="ml-2 mt-1">
              <UserLabel {pubkey} />
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
