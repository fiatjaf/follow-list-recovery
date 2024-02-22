<script lang="ts">
  import {onMount} from 'svelte'
  import {npubEncode} from 'nostr-tools/nip19'

  import UserLabel from '../components/UserLabel.svelte'
  import {account, signer, pool, getWriteRelays} from '../lib/nostr.ts'

  const DAY = 60 * 60 * 24
  const formatter = new Intl.DateFormat(undefined, {dateStyle: 'medium'})

  type Epoch = {epoch: number; keys: string[]}

  let epochs: Epoch[] = []
  let keys: {[pubkey: number]: Epoch} = {}

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
              epochs = epochs.map(e => {
                e.keys = e.keys
                return e
              })
            }

            for (let i = 0; i < evt.tags.length; i++) {
              let [name, pubkey] = evt.tags[i]
              if (name === 'p' && pubkey) {
                let prev = keys[pubkey]
                if (prev && prev.epoch < curr.epoch) {
                  let idx = prev.keys.indexOf(pubkey)
                  prev.keys.splice(idx, 1)
                }
                curr.keys.push(pubkey)
                keys[pubkey] = curr
              }
            }
          },
          onclose() {
            epochs.sort((a, b) => b.epoch - a.epoch)
            epochs = epochs.map(e => {
              e.keys = e.keys
              return e
            })
          }
        }
      )
    })
  })

  function formatDate(ts: number) {
    let d = new Date(epoch.epoch * 1000)
    d.setHours(0)
    d.setMinutes(0)
    d.setSeconds(0)
    return formatter.format(d)
  }
</script>

<div class="flex">
  <div class="w-40">
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
  <div>
    {#each epochs as epoch}
      <div class="border-y">
        <div>{formatDate(epoch.epoch)}</div>
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
